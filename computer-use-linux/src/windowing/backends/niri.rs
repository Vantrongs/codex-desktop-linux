use crate::terminal::enrich_terminal_windows;
use crate::windowing::registry::BackendProbe;
use crate::windowing::types::{WindowBounds, WindowInfo};
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::os::unix::fs::FileTypeExt;
use std::path::PathBuf;
use std::process::Command;

pub const NIRI_BACKEND: &str = "niri";

pub fn probe() -> BackendProbe {
    match niri_command().args(["msg", "-j", "windows"]).output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let ok = matches!(
                serde_json::from_str::<serde_json::Value>(&stdout),
                Ok(serde_json::Value::Array(_))
            );
            BackendProbe {
                id: NIRI_BACKEND,
                ok,
                can_list_windows: ok,
                can_focus_apps: ok,
                can_focus_windows: ok,
                detail: if ok {
                    "niri msg -j windows returned a JSON array".to_string()
                } else {
                    "niri msg -j windows did not return a JSON array".to_string()
                },
            }
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            BackendProbe {
                id: NIRI_BACKEND,
                ok: false,
                can_list_windows: false,
                can_focus_apps: false,
                can_focus_windows: false,
                detail: if stderr.is_empty() { stdout } else { stderr },
            }
        }
        Err(error) => BackendProbe {
            id: NIRI_BACKEND,
            ok: false,
            can_list_windows: false,
            can_focus_apps: false,
            can_focus_windows: false,
            detail: error.to_string(),
        },
    }
}

pub fn list_windows() -> Result<Vec<WindowInfo>> {
    let windows_json = niri_json(&["msg", "-j", "windows"])?;
    let workspaces_json = niri_json(&["msg", "-j", "workspaces"]).ok();
    let outputs_json = niri_json(&["msg", "-j", "outputs"]).ok();

    let mut windows = parse_niri_windows(
        &windows_json,
        workspaces_json.as_deref(),
        outputs_json.as_deref(),
    )?;
    enrich_terminal_windows(&mut windows);
    Ok(windows)
}

fn niri_json(args: &[&str]) -> Result<String> {
    let output = niri_command()
        .args(args)
        .output()
        .with_context(|| format!("failed to run niri {}", args.join(" ")))?;
    if !output.status.success() {
        bail!(
            "niri {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    String::from_utf8(output.stdout).context("niri returned non-UTF-8 JSON")
}

pub(crate) fn parse_niri_windows(
    json: &str,
    workspaces_json: Option<&str>,
    outputs_json: Option<&str>,
) -> Result<Vec<WindowInfo>> {
    let raw_windows: Vec<NiriWindow> =
        serde_json::from_str(json).context("failed to parse niri msg -j windows output")?;
    let workspace_outputs = workspaces_json
        .and_then(|json| serde_json::from_str::<Vec<NiriWorkspace>>(json).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|workspace| workspace.output.map(|output| (workspace.id, output)))
        .collect::<HashMap<_, _>>();
    let outputs = outputs_json
        .and_then(|json| serde_json::from_str::<HashMap<String, NiriOutput>>(json).ok())
        .unwrap_or_default();
    let mut windows = raw_windows
        .into_iter()
        .map(|window| window_info(window, &workspace_outputs, &outputs))
        .collect::<Vec<_>>();
    windows.sort_by_key(|window| window.window_id);
    Ok(windows)
}

pub fn activate_window(window_id: u64) -> Result<()> {
    let output = niri_command()
        .args([
            "msg",
            "action",
            "focus-window",
            "--id",
            &window_id.to_string(),
        ])
        .output()
        .with_context(|| format!("failed to run niri msg action focus-window --id {window_id}"))?;
    if output.status.success() {
        Ok(())
    } else {
        bail!(
            "niri msg action focus-window --id {window_id} failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
}

fn niri_command() -> Command {
    let mut command = Command::new("niri");
    if env::var_os("NIRI_SOCKET").is_none() {
        if let Some(socket) = infer_niri_socket() {
            command.env("NIRI_SOCKET", socket);
        }
    }
    command
}

fn infer_niri_socket() -> Option<PathBuf> {
    let runtime = xdg_runtime_dir()?;
    let mut sockets = fs::read_dir(runtime)
        .ok()?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let file_name = entry.file_name();
            let file_name = file_name.to_str()?;
            if !file_name.starts_with("niri.") || !file_name.ends_with(".sock") {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            if !metadata.file_type().is_socket() {
                return None;
            }
            let modified = metadata.modified().ok();
            Some((modified, entry.path()))
        })
        .collect::<Vec<_>>();
    sockets.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    sockets.into_iter().map(|(_, path)| path).next()
}

fn xdg_runtime_dir() -> Option<PathBuf> {
    env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            fs::metadata("/proc/self").ok().map(|metadata| {
                PathBuf::from(format!(
                    "/run/user/{}",
                    std::os::unix::fs::MetadataExt::uid(&metadata)
                ))
            })
        })
}

#[derive(Debug, Deserialize)]
struct NiriWindow {
    id: u64,
    title: Option<String>,
    app_id: Option<String>,
    pid: Option<i32>,
    workspace_id: Option<u64>,
    #[serde(default)]
    is_focused: bool,
    layout: Option<NiriLayout>,
}

#[derive(Debug, Deserialize)]
struct NiriLayout {
    window_size: Option<[i32; 2]>,
    tile_pos_in_workspace_view: Option<[f64; 2]>,
    window_offset_in_tile: Option<[f64; 2]>,
}

#[derive(Debug, Deserialize)]
struct NiriWorkspace {
    id: u64,
    output: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NiriOutput {
    logical: Option<NiriLogicalOutput>,
}

#[derive(Debug, Deserialize)]
struct NiriLogicalOutput {
    x: i32,
    y: i32,
}

fn window_info(
    window: NiriWindow,
    workspace_outputs: &HashMap<u64, String>,
    outputs: &HashMap<String, NiriOutput>,
) -> WindowInfo {
    let app_id = clean_string(window.app_id.as_deref());
    let bounds = window.layout.as_ref().and_then(|layout| {
        let [raw_width, raw_height] = layout.window_size?;
        let width = u32::try_from(raw_width).ok().filter(|width| *width > 0)?;
        let height = u32::try_from(raw_height)
            .ok()
            .filter(|height| *height > 0)?;
        let position = niri_global_origin(&window, layout, workspace_outputs, outputs);
        Some(WindowBounds {
            x: position.map(|(x, _)| x),
            y: position.map(|(_, y)| y),
            width,
            height,
        })
    });

    WindowInfo {
        window_id: window.id,
        title: clean_string(window.title.as_deref()),
        app_id: app_id.clone(),
        wm_class: app_id,
        pid: window.pid.and_then(|pid| u32::try_from(pid).ok()),
        bounds,
        workspace: window
            .workspace_id
            .and_then(|workspace_id| i32::try_from(workspace_id).ok()),
        focused: window.is_focused,
        hidden: false,
        client_type: Some("wayland".to_string()),
        backend: NIRI_BACKEND.to_string(),
        terminal: None,
    }
}

fn niri_global_origin(
    window: &NiriWindow,
    layout: &NiriLayout,
    workspace_outputs: &HashMap<u64, String>,
    outputs: &HashMap<String, NiriOutput>,
) -> Option<(i32, i32)> {
    let workspace_id = window.workspace_id?;
    let output_name = workspace_outputs.get(&workspace_id)?;
    let logical = outputs.get(output_name)?.logical.as_ref()?;
    let [tile_x, tile_y] = layout.tile_pos_in_workspace_view?;
    let [offset_x, offset_y] = layout.window_offset_in_tile?;
    Some((
        rounded_global_coordinate(logical.x, tile_x, offset_x)?,
        rounded_global_coordinate(logical.y, tile_y, offset_y)?,
    ))
}

fn rounded_global_coordinate(output_origin: i32, tile: f64, offset: f64) -> Option<i32> {
    let coordinate = f64::from(output_origin) + tile + offset;
    if !coordinate.is_finite()
        || coordinate < f64::from(i32::MIN)
        || coordinate > f64::from(i32::MAX)
    {
        return None;
    }
    Some(coordinate.round() as i32)
}

fn clean_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "null")
        .map(ToOwned::to_owned)
}
