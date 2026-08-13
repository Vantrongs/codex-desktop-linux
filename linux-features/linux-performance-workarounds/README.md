# Linux performance workarounds

Disabled-by-default renderer workarounds for machines where sidebar scrolling,
tab layout, streaming Markdown animations, agent-activity disclosure layout,
thread virtualizer resize work, long-thread resume hydration, or persisted
subagent runtime projection regress. Enable only after a measured problem or
after the corresponding unsafe official-bundle contract is verified.

The long-thread patch keeps resume hydration paginated whenever the connected
app-server reports pagination support; older turns remain available on demand.
The existing paginated resume contract retains only the five newest turns in
renderer memory initially and loads older turns in five-turn pages. Pages that
were loaded while browsing are cleared when the inactive thread is unsubscribed.
For paginated threads, the navigation rail uses the app-server's complete turn
index instead of replaying the displayed history. The rail is withheld until
the complete index is available, and a selected prompt/answer preview is loaded
from indexed storage only when needed.

Legacy root threads can be converted once with the app-server's atomic rollout
migrator. Inspection is the default; `--apply` is explicit and selection can be
limited to a single thread:

```bash
codex app-server migrate-rollouts --thread-id THREAD_UUID
codex app-server migrate-rollouts --thread-id THREAD_UUID --apply --max-mib-per-second 32
```

The migrator stages and verifies the paginated rollout and SQLite projection
before publishing it. Subagent rollouts are skipped; after a root is paginated,
new v2 subagents inherit paginated history from it.

The subagent patch treats only an explicit current `active` status as working;
`notLoaded`, `idle`, and missing current status remain inactive while the
independent open spawn edge is preserved for explicit resume. Topology recovery
uses thread metadata only; a child thread's turns are loaded only when that
thread is explicitly opened or otherwise addressed. An inactive owned thread
is unsubscribed after 30 minutes, which removes its turns from renderer memory;
the app-server's existing 30-minute idle-unload then removes the cold runtime.
Active views, running turns, approvals, and pending user input remain loaded.

Enable it in `linux-features/features.json` only for a reproduced regression:

```json
{ "enabled": ["linux-performance-workarounds"] }
```

These are upstream-bundle patches, not baseline compatibility code. Retest the
measured regression and run:

```bash
node --test linux-features/linux-performance-workarounds/test.js
```
