# Linux performance workarounds

Disabled-by-default renderer workarounds for machines where sidebar scrolling,
tab layout, streaming Markdown animations, agent-activity disclosure layout,
thread virtualizer resize work, long-thread resume hydration, or persisted
subagent runtime projection regress. Enable only after a measured problem or
after the corresponding unsafe official-bundle contract is verified.

Official 26.908 keeps resume hydration paginated whenever the connected
app-server reports pagination support; older turns remain available on demand.
The feature verifies this native contract without rewriting the retired remote
flag gate.
The existing paginated resume contract retains only the five newest turns in
renderer memory initially and loads older turns in five-turn pages. Pages that
were loaded while browsing are cleared when the inactive thread is unsubscribed.
For paginated threads, the official 26.901 navigation rail now uses the
app-server's complete turn index without the retired remote flag instead of
replaying the displayed history. The feature verifies that contract
fail-closed without rewriting the signed webview bundle. The rail is withheld
until the complete index is available, and a selected prompt/answer preview is
loaded from indexed storage only when needed.

Legacy root threads can be converted once with the official CLI's atomic rollout
migrator. Inspection is the default; `--apply` is explicit and selection can be
limited to a single thread:

```bash
codex migrate-rollouts --thread THREAD_UUID
codex migrate-rollouts --thread THREAD_UUID --apply --max-mib-per-second 32
```

The migrator plans legacy rollback markers by logical instruction turn,
preserves the legacy display name in SQLite, then stages and verifies the
paginated rollout and SQLite projection before publishing it. Subagent rollouts
are skipped; after a root is paginated, new v2 subagents inherit paginated
history from it.

The official 26.901 subagent projector now treats only an explicit current
`active` status as working; `notLoaded` and `idle` are done, while a missing
status can consult live turn state only until topology discovery completes.
The feature verifies that contract fail-closed without rewriting it. The
current official topology-recovery path already keeps only spawn metadata plus
one content-free final turn and is verified the same way. A child thread's
content is loaded only when that thread is explicitly opened or otherwise
addressed. An inactive owned thread is unsubscribed after 30 minutes, which
removes its turns from renderer memory; the app-server's existing 30-minute
idle-unload then removes the cold runtime. Active views, running turns,
approvals, and pending user input remain loaded.

Enable it in `linux-features/features.json` only for a reproduced regression:

```json
{ "enabled": ["linux-performance-workarounds"] }
```

These are upstream-bundle patches, not baseline compatibility code. Retest the
measured regression and run:

```bash
node --test linux-features/linux-performance-workarounds/test.js
```
