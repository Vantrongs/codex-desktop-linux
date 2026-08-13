# Linux performance workarounds

Disabled-by-default renderer workarounds for machines where sidebar scrolling,
tab layout, streaming Markdown animations, agent-activity disclosure layout,
thread virtualizer resize work, long-thread resume hydration, or persisted
subagent runtime projection regress. Enable only after a measured problem or
after the corresponding unsafe official-bundle contract is verified.

The long-thread patch keeps resume hydration paginated whenever the connected
app-server reports pagination support; older turns remain available on demand.
The subagent patch treats only an explicit current `active` status as working;
`notLoaded`, `idle`, and missing current status remain inactive while the
independent open spawn edge is preserved for explicit resume. Topology recovery
uses thread metadata only; a child thread's turns are loaded only when that
thread is explicitly opened or otherwise addressed.

Enable it in `linux-features/features.json` only for a reproduced regression:

```json
{ "enabled": ["linux-performance-workarounds"] }
```

These are upstream-bundle patches, not baseline compatibility code. Retest the
measured regression and run:

```bash
node --test linux-features/linux-performance-workarounds/test.js
```
