# Skill Invocation Policy

This opt-in feature adds a separate invocation-policy button beside the normal
enabled/disabled control on installed Skill cards and separates their composer
menus:

- `A` — the Skill is enabled, may be selected automatically by the model, and
  appears in the `$` menu.
- `!` — the Skill is enabled but manual-only; it appears only in the `!` menu
  and is omitted from automatic model routing.
- the existing enabled switch still controls whether the Skill is available at
  all.

Apps remain in the `$` menu because the automatic/manual-only policy applies to
Skills, not app mentions. Both `$` and `!` selections create the existing
`skill-mention` node. The `!` prefix is a user-facing selector; the persisted
prompt link keeps the upstream `$skill-name` form used for explicit invocation.

The policy button preserves the current enabled state and writes
`allowImplicitInvocation` through the existing `skills/config/write` request.
Plugin-qualified Skills are selected by `name`; standalone Skills are selected
by `path`. The control is rendered only for materialized Skills with a local
`path`; remote catalog-only metadata is intentionally excluded.

## Backend requirement

The Desktop package does not provide the Codex CLI. This feature therefore
requires a Codex CLI/app-server build whose `skills/config/write` request and
Skill metadata support `allowImplicitInvocation`. Pin that CLI with
`programs.codexDesktopLinux.cliPackage` or `CODEX_CLI_PATH`. With an older CLI,
the ordinary enabled switch continues to work, but the new policy write fails
and the button keeps its previous state.

## Enable for a regular build

Add the feature to the gitignored `linux-features/features.json` file and
rebuild the app:

```json
{
  "enabled": [
    "skill-invocation-policy"
  ]
}
```

The tracked `features.example.json` intentionally remains empty.

The Nix output `.#codex-desktop-full-linux` includes this UI feature. It still
needs a compatible CLI selected separately, because Desktop package outputs do
not bundle the Codex CLI.

## Verification

```bash
node --test linux-features/skill-invocation-policy/test.js
nix build .#checks.x86_64-linux.nix-linux-features-evaluation --no-link
nix build .#checks.x86_64-linux.nix-plugin-skill-feature-payload --no-link
```

The feature patches are fail-soft and idempotent. Current Electron 42 builds
split Skill trigger parsing from the trigger registration, menu filtering, and
composer call site, so the patch handles those generated chunks independently.
The composer matcher preserves the complete upstream Skill availability
predicate, including any model-context arguments, and only replaces the leading
enabled-state gate with the automatic/manual invocation policy gate.
Within each affected asset, all required anchors must match or that asset is
left unchanged and a warning is reported. The dedicated payload Nix check then
requires exactly one registration marker, parser marker, composer-filter marker,
and combined Skill-card/plugin-update marker in the package it builds.
