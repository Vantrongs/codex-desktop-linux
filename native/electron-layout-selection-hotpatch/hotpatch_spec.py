#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path
from typing import Any


PT_LOAD = 1
PT_NOTE = 4
NT_GNU_BUILD_ID = 3


def load_spec(spec_path: Path) -> dict[str, Any]:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    required = {
        "electronVersion",
        "architecture",
        "elfMachine",
        "gnuBuildId",
        "addresses",
        "targets",
    }
    if set(spec) != required:
        raise ValueError(f"spec keys must be exactly {sorted(required)}")
    if spec["architecture"] != "x86_64" or spec["elfMachine"] != 62:
        raise ValueError("only the verified x86_64 Electron target is supported")
    build_id = bytes.fromhex(spec["gnuBuildId"])
    if len(build_id) != 20:
        raise ValueError("GNU build ID must be a 20-byte SHA-1 value")
    if set(spec["addresses"]) != {"cppgcCageBaseGlobal"}:
        raise ValueError("unexpected address contract")
    int(spec["addresses"]["cppgcCageBaseGlobal"], 0)
    expected_targets = {
        "layoutSelectionCommit",
        "frameSelectionGetDocument",
        "documentCalculateStyleAndLayoutTreeUpdate",
        "documentView",
        "localFrameViewNeedsLayout",
        "localFrameViewScheduleAnimation",
    }
    if set(spec["targets"]) != expected_targets:
        raise ValueError("unexpected target contract")
    for name, target in spec["targets"].items():
        if set(target) != {"rva", "signature"}:
            raise ValueError(f"unexpected fields for target {name}")
        int(target["rva"], 0)
        signature = bytes.fromhex(target["signature"])
        if len(signature) < 8:
            raise ValueError(f"signature for {name} is too short")
    commit_signature = bytes.fromhex(
        spec["targets"]["layoutSelectionCommit"]["signature"]
    )
    if len(commit_signature) != 12:
        raise ValueError("LayoutSelection::Commit prologue must be exactly 12 bytes")
    return spec


def macro_name(camel_case: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", camel_case).upper()


def bytes_initializer(value: bytes) -> str:
    return ", ".join(f"0x{byte:02x}" for byte in value)


def generate_header(spec: dict[str, Any]) -> str:
    lines = [
        "#ifndef CODEX_BLINK_LAYOUT_SELECTION_HOTPATCH_SPEC_H_",
        "#define CODEX_BLINK_LAYOUT_SELECTION_HOTPATCH_SPEC_H_",
        "",
        f'#define CODEX_HOTPATCH_ELECTRON_VERSION "{spec["electronVersion"]}"',
        (
            "#define CODEX_HOTPATCH_CPPGC_CAGE_BASE_GLOBAL_RVA "
            f"((uintptr_t){spec['addresses']['cppgcCageBaseGlobal']}ULL)"
        ),
        "",
    ]
    build_id = bytes.fromhex(spec["gnuBuildId"])
    lines.extend(
        [
            "static const uint8_t kCodexHotpatchExpectedBuildId[] = {",
            f"    {bytes_initializer(build_id)},",
            "};",
            "",
        ]
    )
    for target_name, target in spec["targets"].items():
        macro = macro_name(target_name)
        signature = bytes.fromhex(target["signature"])
        lines.extend(
            [
                f"#define CODEX_HOTPATCH_{macro}_RVA \\",
                f"  ((uintptr_t){target['rva']}ULL)",
                f"static const uint8_t kCodexHotpatch{target_name[0].upper() + target_name[1:]}Signature[] = {{",
                f"    {bytes_initializer(signature)},",
                "};",
                "",
            ]
        )
    lines.extend(
        [
            "#endif  // CODEX_BLINK_LAYOUT_SELECTION_HOTPATCH_SPEC_H_",
            "",
        ]
    )
    return "\n".join(lines)


class Elf64:
    def __init__(self, binary_path: Path):
        self.path = binary_path
        self.data = binary_path.read_bytes()
        if self.data[:4] != b"\x7fELF":
            raise ValueError("not an ELF binary")
        if self.data[4] != 2 or self.data[5] != 1:
            raise ValueError("expected a little-endian ELF64 binary")
        header = struct.unpack_from("<HHIQQQIHHHHHH", self.data, 16)
        self.machine = header[1]
        program_header_offset = header[4]
        program_header_entry_size = header[8]
        program_header_count = header[9]
        if program_header_entry_size != 56:
            raise ValueError("unexpected ELF64 program-header size")
        self.program_headers = []
        for index in range(program_header_count):
            offset = program_header_offset + index * program_header_entry_size
            self.program_headers.append(
                struct.unpack_from("<IIQQQQQQ", self.data, offset)
            )

    def build_id(self) -> bytes | None:
        for header in self.program_headers:
            segment_type, _, file_offset, _, _, file_size, _, _ = header
            if segment_type != PT_NOTE:
                continue
            cursor = file_offset
            end = file_offset + file_size
            while cursor + 12 <= end:
                name_size, description_size, note_type = struct.unpack_from(
                    "<III", self.data, cursor
                )
                cursor += 12
                name = self.data[cursor : cursor + name_size].rstrip(b"\0")
                cursor += (name_size + 3) & ~3
                description = self.data[cursor : cursor + description_size]
                cursor += (description_size + 3) & ~3
                if name == b"GNU" and note_type == NT_GNU_BUILD_ID:
                    return description
        return None

    def bytes_at_rva(self, rva: int, size: int) -> bytes:
        for header in self.program_headers:
            segment_type, _, file_offset, virtual_address, _, file_size, _, _ = header
            if (
                segment_type == PT_LOAD
                and virtual_address <= rva
                and rva + size <= virtual_address + file_size
            ):
                offset = file_offset + rva - virtual_address
                return self.data[offset : offset + size]
        raise ValueError(f"RVA 0x{rva:x} is not backed by a PT_LOAD segment")


def verify_binary(spec: dict[str, Any], binary_path: Path) -> None:
    elf = Elf64(binary_path)
    if elf.machine != spec["elfMachine"]:
        raise ValueError(
            f"ELF machine mismatch: expected {spec['elfMachine']}, got {elf.machine}"
        )
    expected_build_id = bytes.fromhex(spec["gnuBuildId"])
    actual_build_id = elf.build_id()
    if actual_build_id != expected_build_id:
        actual = "missing" if actual_build_id is None else actual_build_id.hex()
        raise ValueError(
            f"GNU build ID mismatch: expected {expected_build_id.hex()}, got {actual}"
        )
    for name, target in spec["targets"].items():
        expected = bytes.fromhex(target["signature"])
        actual = elf.bytes_at_rva(int(target["rva"], 0), len(expected))
        if actual != expected:
            raise ValueError(
                f"signature mismatch for {name}: expected {expected.hex()}, got {actual.hex()}"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    header_parser = subparsers.add_parser("header")
    header_parser.add_argument("spec", type=Path)
    header_parser.add_argument("output", type=Path)

    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("spec", type=Path)
    verify_parser.add_argument("binary", type=Path)

    args = parser.parse_args()
    spec = load_spec(args.spec)
    if args.command == "header":
        args.output.write_text(generate_header(spec), encoding="utf-8")
    else:
        verify_binary(spec, args.binary)
        print(
            f"verified Electron {spec['electronVersion']} {spec['architecture']} "
            f"GNU build ID {spec['gnuBuildId']}"
        )


if __name__ == "__main__":
    main()
