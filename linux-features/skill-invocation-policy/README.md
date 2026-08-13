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

The official package bundles a Codex CLI, but this feature requires a patched
CLI/app-server build whose `skills/config/write` request and
Skill metadata support `allowImplicitInvocation`. Pin that CLI with
`CODEX_CLI_PATH`; the Desktop launcher honors an absolute override. With the
unpatched bundled CLI,
the ordinary enabled switch continues to work, but the new policy write fails
and the button keeps its previous state.

The companion CLI patch applies the persisted policy to both plugin Skills and
the host Skill service. Codex CLI 0.147.0 moved that service from
`core-skills` to `ext/skills`; the patch follows the new source-of-truth path
and preserves an existing policy when a later config layer changes only the
enabled state.

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

For Nix, add `"skill-invocation-policy"` to the `linuxFeatureIds` override.
The test candidate in this worktree enables the Desktop half explicitly, but
still contains the official bundled CLI. End-to-end testing must launch it with
a compatible patched CLI selected separately through `CODEX_CLI_PATH`; do not
promote the feature on the bundled CLI alone.

## Verification

```bash
node --test linux-features/skill-invocation-policy/test.js
nix flake check --no-build --no-write-lock-file path:.
```

The feature patches are fail-closed and idempotent. Current Electron 42 builds
split Skill trigger parsing from the trigger registration, menu filtering, and
composer call site, so the patch handles those generated chunks independently.
The composer matcher preserves the complete upstream Skill availability
predicate, including any model-context arguments, and only replaces the leading
enabled-state gate with the automatic/manual invocation policy gate.
Within each affected asset, all required anchors must match or the enabled
feature build fails. Final candidate validation extracts the resulting ASAR and
checks the registration, parser, composer-filter, and Skill-card markers.
