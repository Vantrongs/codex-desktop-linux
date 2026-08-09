# Linux Computer Use

Linux Computer Use is an opt-in UI surface backed by a native Rust MCP backend,
`codex-computer-use-linux`. The backend is bundled and registered by default;
the in-app Computer Use controls are disabled until you opt in.

It supports:

- app listing and accessibility trees through AT-SPI
- screenshots through GNOME Shell DBus, the Codex GNOME Shell extension, or XDG Desktop Portal
- window listing and focusing on GNOME, KWin/Plasma 5 and 6, Hyprland, Niri,
  COSMIC, i3, and generic X11/EWMH window managers; GNOME extension and X11
  windows can also be moved and resized
- keyboard, text, click, scroll, and drag input through `/dev/uinput`, XDG
  RemoteDesktop portal, `xdotool` on X11, or `ydotool`
- pointer-direction feedback for the built-in V2 pet after successful click,
  scroll, and drag actions

## Runtime Dependencies

Install `ydotool` 1.0.3 or newer when you need the fallback input path. The
backend probes the exact absolute move, wheel move, click, delayed key, and
stdin typing command shapes it emits. Earlier or incompatible CLIs are rejected
even if `ydotoold` and its socket are present.

```bash
# Debian / Ubuntu
sudo apt install ydotool
sudo apt install ydotoold   # on Ubuntu releases that split the daemon

# Fedora
sudo dnf install ydotool

# Arch / Manjaro
sudo pacman -S ydotool

# openSUSE
sudo zypper install ydotool
```

The preferred coordinate input path opens `/dev/uinput` directly. The XDG
RemoteDesktop portal can also provide input on desktops that expose it.

For `ydotool`, run a daemon and make sure your user can access the socket:

```bash
sudo systemctl enable --now ydotoold
sudo usermod -a -G input "$USER"
```

Then log out and back in.

On X11, install `xdotool` for layout-correct XTEST keyboard/text input and
coordinate clicks, and `wmctrl` plus `xprop` for generic EWMH window listing,
focus, move, and resize. `xdotool` is preferred only with a nonempty `DISPLAY`;
ydotool is used when it cannot be launched. Once xdotool starts, a failure or
timeout is returned and input is never replayed through ydotool. Override
keyboard selection with `COMPUTER_USE_LINUX_FORCE_YDOTOOL_KEYBOARD=1` or
`CODEX_COMPUTER_USE_FORCE_YDOTOOL_KEYBOARD=1`; the corresponding
`*_FORCE_XDOTOOL_KEYBOARD=1` names force XTEST when available. Set
`COMPUTER_USE_LINUX_FORCE_YDOTOOL_POINTER=1` or
`CODEX_COMPUTER_USE_FORCE_YDOTOOL_POINTER=1` to skip native-X11 xdotool clicks.

Some distros name the unit `ydotool.service` instead of `ydotoold.service`, and
some install `/usr/bin/ydotoold` without a service unit. If the system unit path
is awkward, a user-session service that binds `%t/.ydotool_socket` is also
valid.

Portal packages are needed when your desktop relies on XDG Desktop Portal input
or screenshots:

- KDE Plasma: `xdg-desktop-portal-kde`
- sway/wlroots: `xdg-desktop-portal-wlr`
- Hyprland: `xdg-desktop-portal-hyprland`
- GNOME: usually available by default

### Niri window targeting

The Niri backend uses the installed compositor CLI for `windows`, `workspaces`,
`outputs`, and exact focus actions. Verify the session IPC directly with:

```bash
niri msg -j windows
```

Desktop processes started by a service do not always inherit `NIRI_SOCKET`.
When it is absent, the Computer Use startup diagnostics try to recover the
session value from the current process ancestry and the systemd user-manager
environment. If neither source exports it, add `NIRI_SOCKET` to the user-manager
environment before starting Desktop.

Niri reports `tile_pos_in_workspace_view` only when a reliable position is
available. The backend combines that position with the workspace output's
logical origin for multi-monitor global coordinates. If the position,
workspace-to-output mapping, or output geometry is unavailable, window listing
and exact focus still work but `bounds.x`/`bounds.y` remain `null`; relative
window click/scroll operations then fail safely instead of guessing coordinates.
A targeted screenshot cannot be cropped without an origin, so it falls back to
the uncropped full-screen capture. The recovered socket must still belong to
the active Niri session and be reachable by the desktop user.

The optional `x11-ewmh-computer-use` Linux feature remains available as a
separate, alternative namespaced tool surface. It is not required for the core
backend's generic X11/EWMH support.

## Verify Readiness

Once Computer Use is visible in the Codex UI, ask Codex:

> Check whether Linux Computer Use is ready

You can also run the backend directly:

```bash
./codex-app/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux doctor
./codex-app/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux setup
./codex-app/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux apps
./codex-app/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux windows
./codex-app/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-computer-use-linux screenshot
```

## Enable The In-App UI

Ad hoc, for one build:

```bash
CODEX_LINUX_ENABLE_COMPUTER_USE_UI=1 make build-app
```

Persistent, including future auto-updater rebuilds:

```bash
mkdir -p ~/.config/codex-desktop
echo '{"codex-linux-computer-use-ui-enabled": true}' > ~/.config/codex-desktop/settings.json
```

To opt back out, unset the env var and remove the settings flag or set it to
`false`.

Nix:

```bash
nix run github:ilysenko/codex-desktop-linux#codex-desktop-computer-use-ui
```

Combined with a Linux feature output:

```bash
nix run github:ilysenko/codex-desktop-linux#computer-use-ui-remote-mobile-control
```

## Side-By-Side Dev Variant

```bash
make build-dev-app
make run-dev-app
```

Override the dev identity with `DEV_APP_ID`, `DEV_APP_NAME`, and
`CODEX_WEBVIEW_PORT` if needed.
