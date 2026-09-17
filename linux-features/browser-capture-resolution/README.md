# Browser Capture Resolution

Opt-in correction for in-app browser captures made while the device viewport is
displayed as a scaled thumbnail. Enable `browser-capture-resolution` through the
normal feature configuration.

In upstream 26.908.70816, the Electron page host applies a CSS transform to the
webview. Ordinary CDP screenshots and Browser Use's one-frame screencast can
capture the reduced raster and return it enlarged to the logical viewport size.
The existing full-page path instead requests an unscaled capture surface.

This feature prepares that surface for ordinary screenshots and screencasts too.
It waits for the embedding webview to remove its transform, serializes captures
of the same tab, and restores presentation after capture (after stop for a
screencast). Failures propagate and release temporary surface overrides. Stream
overrides are also released with the upstream capture lease on detach/teardown.
It does not change the compositor, the requested viewport, screenshot encoding,
camera settings, or CDP input coordinates. During capture the existing upstream
offscreen presentation is used temporarily; a long-lived screencast keeps that
presentation until it is stopped.

Regression: at a 1920x1080 logical viewport and approximately 35% preview scale,
one-pixel alternating black/white stripes had adjacent-pixel contrast 68.5/255
in an ordinary PNG, versus 255/255 through the unscaled capture path. The fixture
also places a marker near the lower-right corner to detect clipped output.

Run `node --test linux-features/browser-capture-resolution/test.js`.
Set `CODEX_CAPTURE_MAIN_BUNDLE` to the signed package's extracted main JS bundle
to include the mandatory real-bundle patch and syntax validation.
