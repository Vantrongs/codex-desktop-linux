# Linux renderer crash diagnostics

Disabled-by-default diagnostics for machines with previously reproduced
renderer restarts. The feature records bounded renderer crash metadata,
ResizeObserver breadcrumbs, and at most three retained minidumps.

The files are written below the application's XDG state directory. Enable the
feature only while this extra diagnostic evidence is useful.
