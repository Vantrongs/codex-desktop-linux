# Linux performance workarounds

Disabled-by-default renderer workarounds for machines where sidebar scrolling,
tab layout, streaming Markdown animations, agent-activity disclosure layout,
or thread virtualizer resize work regress. Enable only after a measured problem
or after the corresponding unsafe official-bundle contract is verified.

Enable it in `linux-features/features.json` only for a reproduced regression:

```json
{ "enabled": ["linux-performance-workarounds"] }
```

These are upstream-bundle patches, not baseline compatibility code. Retest the
measured regression and run:

```bash
node --test linux-features/linux-performance-workarounds/test.js
```
