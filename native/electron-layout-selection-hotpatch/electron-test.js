"use strict";

const { app, BrowserWindow } = require("electron");

let rendererFailed = false;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { sandbox: false },
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    rendererFailed = true;
    process.stderr.write(
      `layout-selection-test: renderer gone ${JSON.stringify(details)}\n`,
    );
  });

  const content = Array.from(
    { length: 300 },
    (_, index) =>
      `<p>Selectable line ${index}: the quick brown fox jumps over the lazy dog.</p>`,
  ).join("");
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      `<style>body{font:16px sans-serif;line-height:24px}</style>${content}`,
    )}`,
  );

  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: 20,
    y: 30,
    button: "left",
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: "mouseMove",
    x: 500,
    y: 220,
    movementX: 480,
    movementY: 190,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: 500,
    y: 220,
    button: "left",
    clickCount: 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 750));
  const selectedText = await window.webContents.executeJavaScript(
    "window.getSelection().toString()",
  );
  if (rendererFailed || !selectedText.includes("Selectable line")) {
    process.stderr.write(
      `layout-selection-test: failed selection=${JSON.stringify(selectedText)}\n`,
    );
    app.exit(1);
    return;
  }

  process.stdout.write(
    `layout-selection-test: passed selectedLength=${selectedText.length}\n`,
  );
  app.exit(0);
});
