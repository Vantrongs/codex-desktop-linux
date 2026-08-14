# NixOS runtime compatibility

Nix packages enable this feature automatically. Rewriting Electron with
`patchelf` moves `PT_INTERP` beyond `detect-libc`'s initial scan; its
`process.report` fallback then trips Electron CFI with `SIGILL`.

Directories copied from `/nix/store` also retain read-only modes. The official
bundled-plugin materializer must later remove and replace its user-owned
staging tree, so a copied `0555` plugin directory otherwise fails with
`EACCES` before Chrome native-host reconciliation can refresh its runtime
manifest.

The feature makes the same fixed-length glibc selection used by Nixpkgs and,
on Linux only, adds owner-write permission to the user-owned bundled-plugin
copy after `fs.cp`. It does not change the source payload in `/nix/store`,
follow symlinks, or grant group/world write access. Both mutations are recorded
in the normal ASAR patch report and output hash.
