# Git Plugin Update Button

This opt-in feature adds an **Update** action to an installed plugin when the
plugin source is Git-backed (`git` or `git-subdir`). The source test is
independent of the marketplace source, so it also covers a Git-subdir plugin
declared by a local marketplace, including the Matt Pocock Skills bundle.

The action performs the existing Desktop update sequence:

1. For a Git marketplace, `marketplace/upgrade` refreshes its checkout first.
2. For a local marketplace, that step is skipped; `plugin/install` materializes
   the plugin's Git source itself.
3. `plugin/install` atomically replaces the installed plugin.
4. The plugin detail and plugin/Skill queries are refreshed.

It does not uninstall the plugin first. If the atomic install fails, the
app-server keeps the previously installed copy. Local-path, npm, built-in, and
remote plugin sources do not receive the button. While an update is running,
the ordinary plugin mutation actions are disabled by the same page-level busy
state. If installation succeeds but the query refresh fails, the button keeps
the successful install result visible and offers a refresh-only retry.

## Enable for a regular build

Add the feature to the gitignored `linux-features/features.json` file and
rebuild the app:

```json
{
  "enabled": [
    "plugin-update-button"
  ]
}
```

The tracked `features.example.json` intentionally remains empty. For an
isolated Nix build, override the regular package without changing the system:

```bash
nix build --impure --no-link --expr '
let flake = builtins.getFlake (toString ./.);
in flake.packages.x86_64-linux.codex-desktop.override {
  linuxFeatureIds = [ "plugin-update-button" ];
}'
```

## Verification

```bash
node --test linux-features/plugin-update-button/test.js
nix flake check --no-build --no-write-lock-file path:.
```

The asset patch is fail-closed and idempotent. If the upstream plugin detail
bundle no longer matches the complete expected contract, the enabled feature
build fails instead of applying or accepting a partial action. The isolated
package build applies the feature to the selected upstream payload and rejects
a missing or incomplete required marker contract.
