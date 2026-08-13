# NixOS Git watcher compatibility

Nix packages enable this feature automatically. Rewriting Electron with
`patchelf` moves `PT_INTERP` beyond `detect-libc`'s initial scan; its
`process.report` fallback then trips Electron CFI with `SIGILL`.

The feature makes the same fixed-length glibc selection used by Nixpkgs and
records the mutation in the normal ASAR patch report and output hash.
