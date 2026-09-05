# NixOS runtime compatibility

Nix packages enable this feature automatically. Rewriting Electron with
`patchelf` moves `PT_INTERP` beyond `detect-libc`'s initial scan; its
`process.report` fallback then trips Electron CFI with `SIGILL`.

The feature makes the same fixed-length glibc selection used by Nixpkgs. It is
the only mutation owned here and is recorded in the normal ASAR patch report
and output hash.

Writable staging copies of bundled plugins are owned once by the separate
internal `nix-store-bundled-marketplace-permissions` Nix feature. Keeping that
repair out of this public compatibility feature prevents two descriptors from
rewriting the same official copy operation.
