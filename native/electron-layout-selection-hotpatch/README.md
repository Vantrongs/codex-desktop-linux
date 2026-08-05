# Electron Layout Selection Hotpatch

This module carries the native dirty-layout guard proposed by Chromium change
[8187581](https://chromium-review.googlesource.com/c/chromium/src/+/8187581)
for the exact Electron 42.3.0 x86_64 binary used by the Nix package.

## Why It Exists

A retained Crashpad dump from Codex Desktop 26.727.51351 symbolized to this
release stack:

```text
Document::UpdateStyleAndLayoutTreeForThisDocument
FrameSelection::SelectionHasFocus
FrameSelection::IsHidden
LayoutSelection::Commit
LayoutView::CommitPendingSelection
LocalFrameView::RunCompositingInputsLifecyclePhase
MouseEventManager::HandleMouseReleaseEvent
```

`LayoutSelection::Commit()` runs during compositing inputs, where Blink forbids
layout-tree mutations. If the document or frame view is still dirty, its call
through `IsHidden()` and `SelectionHasFocus()` forces a nested style/layout
update and reaches the fatal `StateAllowsTreeMutations()` check. This is a
native Chromium lifecycle defect; JavaScript layout reads before `pointerup`
do not cover the later phase and are not used here.

## Runtime Behavior

The shared library detours only `LayoutSelection::Commit()`:

1. A clean document follows the original function byte-for-byte through a
   trampoline.
2. A dirty document keeps `has_pending_selection_` set, schedules another
   animation frame, and returns.
3. The next clean frame commits the same selection normally.

Before installing the detour, the library verifies:

- the executable GNU build ID;
- the `LayoutSelection::Commit()` prologue;
- every native method called by the guard;
- the expected x86_64 architecture during the Nix build.

`spec.json` is the single machine contract used by both the build-time ELF
verifier and the generated C header. Unknown binaries are left unchanged. The
module is not enabled on aarch64 because that binary has not been mapped and
validated.

## Validation

Build-time verification and compilation:

```bash
nix build 'path:.#checks.x86_64-linux.electron-layout-selection-hotpatch' --no-link
```

`electron-test.js` is a hidden-window integration fixture. Run it with the
matching official Electron binary and the built library twice: once normally,
then with `CODEX_BLINK_LAYOUT_SELECTION_TEST_FORCE_DIRTY_ONCE=1`. The second
run must log one deferred selection and still return the same non-empty native
selection on the next frame.

## Removal

Remove the derivation and launcher injection when the pinned Electron build
contains Chromium's equivalent native guard. Do not retain the hotpatch merely
because the signatures still match: the owning condition is the absence of the
upstream lifecycle fix.
