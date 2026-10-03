use active_win_pos_rs::get_active_window;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use enigo::{Enigo, Keyboard, Settings};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use strsim::normalized_levenshtein;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, LogicalSize, Manager, RunEvent, WindowEvent,
};
use whisper_rs::{
    get_lang_max_id, get_lang_str, get_lang_str_full, FullParams, SamplingStrategy, WhisperContext,
    WhisperContextParameters,
};

#[cfg(not(target_os = "macos"))]
use tauri::PhysicalPosition;

#[cfg(target_os = "macos")]
use accessibility::{AXAttribute, AXUIElement};
#[cfg(target_os = "macos")]
use accessibility_sys::{
    kAXTrustedCheckOptionPrompt, AXIsProcessTrusted, AXIsProcessTrustedWithOptions,
};
#[cfg(target_os = "macos")]
use core_foundation::{
    base::TCFType, boolean::CFBoolean, dictionary::CFDictionary, runloop::CFRunLoop,
    string::CFString,
};
#[cfg(target_os = "macos")]
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    CallbackResult, EventField,
};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
#[cfg(target_os = "macos")]
use objc2_foundation::NSPoint;

// The multilingual small model automatically identifies the spoken language.
// Q5_1 preserves the compact footprint needed for responsive local dictation.
const MODEL_NAME: &str = "ggml-small-q5_1.bin";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AppContext {
    app_name: String,
    title: String,
    profile: String,
    meeting_detected: bool,
    meeting_provider: Option<String>,
    meeting_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct PermissionResult {
    microphone: Option<bool>,
    microphone_state: String,
    accessibility: bool,
    input_monitoring: bool,
    screen_recording: bool,
}

#[derive(Debug, Clone, Serialize)]
struct DictationResult {
    raw_text: String,
    formatted_text: String,
    app_name: String,
    app_title: String,
    profile: String,
    duration_ms: u128,
    pasted: bool,
    detected_language: String,
}

#[derive(Debug, Clone, Serialize)]
struct LanguageInfo {
    code: String,
    name: String,
}

struct CapturedAudio {
    samples: Vec<f32>,
    sample_rate: u32,
    channels: u16,
}

struct RecordingSession {
    stop_sender: mpsc::Sender<()>,
    audio_receiver: mpsc::Receiver<Result<CapturedAudio, String>>,
    started_at: Instant,
    target: AppContext,
}

#[derive(Default)]
struct RecorderState(Mutex<Option<RecordingSession>>);

struct MeetingRecordingSession {
    microphone_stop: mpsc::Sender<()>,
    microphone_audio: mpsc::Receiver<Result<CapturedAudio, String>>,
    system_stop: mpsc::Sender<()>,
    system_audio: mpsc::Receiver<Result<CapturedAudio, String>>,
    started_at: Instant,
    provider: String,
}

#[derive(Default)]
struct MeetingRecorderState(Mutex<Option<MeetingRecordingSession>>);

#[derive(Debug, Clone, Serialize)]
struct MeetingRecordingResult {
    path: String,
    provider: String,
    duration_ms: u128,
    created_at: u64,
    microphone_samples: usize,
    system_audio_samples: usize,
}

#[derive(Default)]
struct ContextState(Mutex<AppContext>);

#[derive(Default)]
struct MouseMonitorState(Arc<AtomicBool>);

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn yapflow_microphone_status() -> i32;
    fn yapflow_request_microphone() -> i32;
    fn yapflow_zoom_audio_activity() -> i32;
    fn yapflow_chrome_audio_activity() -> i32;
    fn yapflow_start_system_audio() -> i32;
    fn yapflow_stop_system_audio(samples: *mut *mut f32, sample_count: *mut usize) -> i32;
    fn yapflow_free_system_audio(samples: *mut f32);
}

fn models_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("Could not find the local data directory")?;
    Ok(base.join("YapFlow").join("models"))
}

fn model_path() -> Result<PathBuf, String> {
    Ok(models_dir()?.join(MODEL_NAME))
}

#[tauri::command]
fn remove_legacy_agent_models() -> Result<(), String> {
    let legacy_directory = models_dir()?.join("agent");
    if legacy_directory.exists() {
        std::fs::remove_dir_all(&legacy_directory).map_err(|error| {
            format!(
                "Could not remove the retired computer-control model at {}: {error}",
                legacy_directory.display()
            )
        })?;
    }
    Ok(())
}

#[tauri::command]
fn model_ready() -> bool {
    model_path().map(|path| path.exists()).unwrap_or(false)
}

#[tauri::command]
fn supported_languages() -> Vec<LanguageInfo> {
    (0..=get_lang_max_id())
        .filter_map(|id| {
            Some(LanguageInfo {
                code: get_lang_str(id)?.to_string(),
                name: get_lang_str_full(id)?.to_string(),
            })
        })
        .collect()
}

#[tauri::command]
async fn download_model() -> Result<(), String> {
    if model_ready() {
        return Ok(());
    }
    let directory = models_dir()?;
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|e| e.to_string())?;
    let destination = model_path()?;
    let temporary = destination.with_extension("download");
    let response = reqwest::get(MODEL_URL)
        .await
        .map_err(|e| format!("Model download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Model download failed with status {}",
            response.status()
        ));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    tokio::fs::write(&temporary, &bytes)
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::rename(&temporary, &destination)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn classify_context(app_name: &str, title: &str) -> (String, bool) {
    let haystack = format!("{} {}", app_name, title).to_lowercase();
    // A provider app being open is not evidence that a call is in progress.
    // Meeting titles and the native media-host checks below are the signals.
    let meeting = [
        "google meet",
        "meet - ",
        "zoom meeting",
        "zoom webinar",
        "teams meeting",
    ]
    .iter()
    .any(|needle| haystack.contains(needle));
    let profile = if ["mail", "outlook", "gmail", "thunderbird"]
        .iter()
        .any(|needle| haystack.contains(needle))
    {
        "Email"
    } else if [
        "google docs",
        "microsoft word",
        "pages",
        "notion",
        "obsidian",
    ]
    .iter()
    .any(|needle| haystack.contains(needle))
    {
        "Document"
    } else if [
        "slack", "discord", "messages", "whatsapp", "telegram", "teams",
    ]
    .iter()
    .any(|needle| haystack.contains(needle))
    {
        "Message"
    } else if ["terminal", "iterm", "visual studio code", "cursor", "xcode"]
        .iter()
        .any(|needle| haystack.contains(needle))
    {
        "Code"
    } else {
        "Natural"
    };
    (profile.to_string(), meeting)
}

fn browser_meeting(app_name: &str, title: &str) -> Option<(String, String)> {
    let app = app_name.to_lowercase();
    let title_lower = title.to_lowercase();
    let browser = [
        "chrome", "safari", "edge", "firefox", "arc", "brave", "opera",
    ]
    .iter()
    .any(|name| app.contains(name));
    if !browser {
        return None;
    }
    if title_lower.contains("zoom meeting") || title_lower.contains("zoom webinar") {
        return Some(("zoom".into(), title.into()));
    }
    if title_lower.contains("google meet")
        || title_lower.starts_with("meet - ")
        || title_lower.contains(" - meet")
    {
        return Some(("meet".into(), title.into()));
    }
    None
}

fn has_in_call_controls(text: &str, provider: &str) -> bool {
    let text = format!(
        " {} ",
        text.to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    );
    match provider {
        // Join/waiting rooms expose microphone and camera controls too. A
        // leave/end control is the important distinction after admission.
        "zoom" => {
            let leave = text.contains(" leave meeting ")
                || text.contains(" end meeting ")
                || text.contains(" leave webinar ")
                || text.contains(" leave ");
            let controls = [
                " mute ",
                " unmute ",
                " start video ",
                " stop video ",
                " participants ",
                " reactions ",
                " chat ",
                " share screen ",
            ]
            .iter()
            .filter(|label| text.contains(**label))
            .count();
            leave && controls >= 2
        }
        "meet" => {
            let leave = text.contains(" leave call ")
                || text.contains(" end call ")
                || text.contains(" leave ");
            let controls = [
                " microphone ",
                " camera ",
                " present now ",
                " participants ",
                " people ",
                " chat ",
            ]
            .iter()
            .filter(|label| text.contains(**label))
            .count();
            leave && controls >= 2
        }
        _ => false,
    }
}

fn has_google_meet_room_url(text: &str) -> bool {
    let lower = text.to_lowercase();
    let Some(start) = lower.find("meet.google.com/") else {
        return false;
    };
    let path = &lower[start + "meet.google.com/".len()..];
    let segment = path
        .split(|character: char| {
            character.is_whitespace() || matches!(character, '/' | '?' | '#' | ',' | '"')
        })
        .next()
        .unwrap_or_default();
    // Meet room codes use three hyphenated groups (for example abc-defg-hij).
    // Explicitly excluding product pages also keeps /home and /landing silent.
    let groups = segment.split('-').collect::<Vec<_>>();
    groups.len() == 3
        && groups.iter().all(|group| {
            !group.is_empty()
                && group
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
}

#[cfg(target_os = "macos")]
fn chrome_has_live_meeting_audio() -> bool {
    // A joined Meet keeps Chrome's output stream running even when the local
    // microphone and camera are muted. The pre-join preview may open the mic,
    // so input alone is intentionally not sufficient.
    unsafe { yapflow_chrome_audio_activity() & 2 != 0 }
}

#[cfg(not(target_os = "macos"))]
fn chrome_has_live_meeting_audio() -> bool {
    false
}

fn confirmed_google_meet_window(text: &str) -> bool {
    has_google_meet_room_url(text)
        && (has_in_call_controls(text, "meet") || chrome_has_live_meeting_audio())
}

#[cfg(target_os = "macos")]
fn mac_application_windows(application: AXUIElement) -> Vec<String> {
    let Ok(windows) = application.attribute(&AXAttribute::windows()) else {
        return Vec::new();
    };
    windows
        .into_iter()
        .map(|window| {
            let mut text = String::new();
            let mut visited = 0;
            collect_accessibility_text(&window, 0, &mut visited, &mut text);
            text
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn mac_named_process_windows(process_name: &str) -> Vec<String> {
    let Ok(output) = std::process::Command::new("/usr/bin/pgrep")
        .args(["-x", process_name])
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<i32>().ok())
        .flat_map(|pid| mac_application_windows(AXUIElement::application(pid)))
        .collect()
}

#[cfg(target_os = "macos")]
fn browser_accessibility_windows(app_name: &str) -> Vec<String> {
    let app = app_name.to_lowercase();
    let bundle = if app.contains("chrome") || app.contains("google meet") {
        "com.google.Chrome"
    } else if app.contains("safari") {
        "com.apple.Safari"
    } else if app.contains("edge") {
        "com.microsoft.edgemac"
    } else if app.contains("firefox") {
        "org.mozilla.firefox"
    } else if app.contains("arc") {
        "company.thebrowser.Browser"
    } else if app.contains("brave") {
        "com.brave.Browser"
    } else if app.contains("opera") {
        "com.operasoftware.Opera"
    } else {
        return Vec::new();
    };
    let mut windows = AXUIElement::application_with_bundle(bundle)
        .map(mac_application_windows)
        .unwrap_or_default();
    // Chrome-installed Meet PWAs run as their own app process and do not
    // necessarily appear in the main Chrome accessibility tree.
    if app.contains("google meet") || app.contains("chrome") {
        windows.extend(mac_named_process_windows("Google Meet"));
    }
    windows
}

#[cfg(target_os = "windows")]
fn browser_accessibility_windows(_app_name: &str) -> Vec<String> {
    use uiautomation::{types::TreeScope, UIAutomation};
    let Ok(automation) = UIAutomation::new() else {
        return Vec::new();
    };
    let Ok(root) = automation.get_root_element() else {
        return Vec::new();
    };
    let Ok(condition) = automation.create_true_condition() else {
        return Vec::new();
    };
    let Ok(windows) = root.find_all(TreeScope::Children, &condition) else {
        return Vec::new();
    };
    windows
        .into_iter()
        .take(150)
        .map(|window| {
            let mut text = window.get_name().unwrap_or_default().to_lowercase();
            if let Ok(elements) = window.find_all(TreeScope::Descendants, &condition) {
                for name in elements
                    .into_iter()
                    .take(500)
                    .filter_map(|element| element.get_name().ok())
                {
                    text.push(' ');
                    text.push_str(&name.to_lowercase());
                }
            }
            text
        })
        .collect()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn browser_accessibility_windows(_app_name: &str) -> Vec<String> {
    Vec::new()
}

fn browser_accessibility_text(app_name: &str) -> String {
    browser_accessibility_windows(app_name).join(" ")
}

fn confirmed_browser_meeting(app_name: &str, title: &str) -> Option<(String, String)> {
    let candidate = browser_meeting(app_name, title)?;
    has_in_call_controls(&browser_accessibility_text(app_name), &candidate.0).then_some(candidate)
}

fn any_browser_meeting() -> Option<(String, String)> {
    #[cfg(target_os = "macos")]
    let windows = [
        "Google Chrome",
        "Safari",
        "Microsoft Edge",
        "Firefox",
        "Arc",
        "Brave",
        "Opera",
    ]
    .iter()
    .flat_map(|app| browser_accessibility_windows(app))
    .chain(mac_named_process_windows("Google Meet"))
    .collect::<Vec<_>>();
    #[cfg(target_os = "windows")]
    let windows = browser_accessibility_windows("");
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let windows = Vec::<String>::new();

    for text in windows {
        if (text.contains("zoom meeting") || text.contains("zoom webinar"))
            && has_in_call_controls(&text, "zoom")
        {
            return Some(("zoom".into(), "Zoom meeting".into()));
        }
        if confirmed_google_meet_window(&text) {
            return Some(("meet".into(), "Google Meet".into()));
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn collect_accessibility_text(
    element: &AXUIElement,
    depth: u8,
    visited: &mut usize,
    text: &mut String,
) {
    // Chrome nests a Meet page's call toolbar much more deeply than a native
    // window (typically 8-10 AX levels below the window). Stopping at six
    // levels found the meeting URL but missed Leave call, microphone, and
    // camera, so a joined call looked identical to the pre-join page.
    if depth > 32 || *visited >= 5_000 {
        return;
    }
    *visited += 1;
    for attribute in [
        AXAttribute::title(),
        AXAttribute::description(),
        AXAttribute::help(),
    ] {
        if let Ok(value) = element.attribute(&attribute) {
            text.push(' ');
            text.push_str(&value.to_string().to_lowercase());
        }
    }
    // Chrome exposes the address bar and web-document URL through AXValue.
    // Without it, the scanner sees "Google Meet" but cannot distinguish
    // /home, pre-join, and an actual meeting-code URL.
    if let Ok(value) = element.attribute(&AXAttribute::value()) {
        if let Some(value) = value.downcast::<CFString>() {
            text.push(' ');
            text.push_str(&value.to_string().to_lowercase());
        }
    }
    if let Ok(children) = element.attribute(&AXAttribute::children()) {
        for child in children.into_iter() {
            collect_accessibility_text(&child, depth + 1, visited, text);
            if *visited >= 5_000 {
                break;
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn zoom_accessibility_meeting() -> bool {
    let Ok(application) = AXUIElement::application_with_bundle("us.zoom.xos") else {
        return false;
    };
    let Ok(windows) = application.attribute(&AXAttribute::windows()) else {
        return false;
    };
    for window in windows.into_iter() {
        let mut text = String::new();
        let mut visited = 0;
        collect_accessibility_text(&window, 0, &mut visited, &mut text);
        if has_in_call_controls(&text, "zoom") {
            return true;
        }
    }
    false
}

#[cfg(target_os = "macos")]
fn zoom_has_live_audio_input() -> bool {
    // Zoom retains its input stream while admitted to a call, including when
    // muted. Ignore output-only activity so an idle notification sound cannot
    // create a false meeting prompt.
    unsafe { yapflow_zoom_audio_activity() & 1 != 0 }
}

fn native_zoom_meeting() -> bool {
    #[cfg(target_os = "macos")]
    {
        return zoom_accessibility_meeting() || zoom_has_live_audio_input();
    }
    #[cfg(target_os = "windows")]
    {
        return browser_accessibility_windows("").into_iter().any(|text| {
            (text.contains("zoom meeting") || text.contains("zoom webinar"))
                && has_in_call_controls(&text, "zoom")
        });
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    false
}

fn detected_meeting(active: &AppContext) -> Option<(String, String)> {
    if let Some(meeting) = confirmed_browser_meeting(&active.app_name, &active.title) {
        return Some(meeting);
    }
    if native_zoom_meeting() {
        return Some(("zoom".into(), "Zoom meeting".into()));
    }
    if let Some(meeting) = any_browser_meeting() {
        return Some(meeting);
    }
    None
}

fn read_active_context() -> AppContext {
    match get_active_window() {
        Ok(window) => {
            let (profile, meeting_detected) = classify_context(&window.app_name, &window.title);
            let provider = if meeting_detected && window.title.to_lowercase().contains("zoom") {
                Some("zoom".into())
            } else if meeting_detected {
                Some("meet".into())
            } else {
                None
            };
            AppContext {
                app_name: window.app_name,
                title: window.title.clone(),
                profile,
                meeting_detected,
                meeting_provider: provider,
                meeting_title: meeting_detected.then_some(window.title),
            }
        }
        Err(_) => AppContext {
            app_name: "Desktop".into(),
            title: String::new(),
            profile: "Natural".into(),
            meeting_detected: false,
            meeting_provider: None,
            meeting_title: None,
        },
    }
}

#[tauri::command]
fn get_active_context(context_state: tauri::State<ContextState>) -> AppContext {
    let active = read_active_context();
    let mut current = if !active.app_name.to_lowercase().contains("yapflow") {
        *context_state.0.lock().expect("context lock") = active.clone();
        active
    } else {
        context_state.0.lock().expect("context lock").clone()
    };
    if let Some((provider, title)) = detected_meeting(&current) {
        current.meeting_detected = true;
        current.meeting_provider = Some(provider);
        current.meeting_title = Some(title);
    } else {
        current.meeting_detected = false;
        current.meeting_provider = None;
        current.meeting_title = None;
    }
    current
}

#[tauri::command]
fn announce_meeting(app: tauri::AppHandle, context: AppContext) -> Result<(), String> {
    app.emit("yapflow://meeting-detected", context)
        .map_err(|e| e.to_string())
}

fn capture_stream() -> Result<(cpal::Stream, Arc<Mutex<Vec<f32>>>, u32, u16), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No microphone was found")?;
    let supported = device
        .default_input_config()
        .map_err(|e| format!("Could not read microphone settings: {e}"))?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let config: cpal::StreamConfig = supported.clone().into();
    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let error_callback = |error| log::error!("Audio stream error: {error}");

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => {
            let target = samples.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _| target.lock().expect("audio lock").extend_from_slice(data),
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let target = samples.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    target
                        .lock()
                        .expect("audio lock")
                        .extend(data.iter().map(|value| *value as f32 / i16::MAX as f32))
                },
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let target = samples.clone();
            device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    target.lock().expect("audio lock").extend(
                        data.iter()
                            .map(|value| (*value as f32 / u16::MAX as f32) * 2.0 - 1.0),
                    )
                },
                error_callback,
                None,
            )
        }
        format => return Err(format!("Unsupported microphone sample format: {format:?}")),
    }
    .map_err(|e| format!("Could not open the microphone: {e}"))?;
    stream
        .play()
        .map_err(|e| format!("Could not start the microphone: {e}"))?;
    Ok((stream, samples, sample_rate, channels))
}

fn spawn_capture_thread() -> Result<
    (
        mpsc::Sender<()>,
        mpsc::Receiver<Result<CapturedAudio, String>>,
    ),
    String,
> {
    let (stop_sender, stop_receiver) = mpsc::channel::<()>();
    let (audio_sender, audio_receiver) = mpsc::channel::<Result<CapturedAudio, String>>();
    let (ready_sender, ready_receiver) = mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || match capture_stream() {
        Ok((stream, samples, sample_rate, channels)) => {
            let _ = ready_sender.send(Ok(()));
            let _ = stop_receiver.recv();
            drop(stream);
            let captured = samples
                .lock()
                .map(|guard| guard.clone())
                .map_err(|_| "Could not read recorded audio".to_string());
            let _ = audio_sender.send(captured.map(|samples| CapturedAudio {
                samples,
                sample_rate,
                channels,
            }));
        }
        Err(error) => {
            let _ = ready_sender.send(Err(error));
        }
    });
    ready_receiver
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "The microphone did not start in time".to_string())??;
    Ok((stop_sender, audio_receiver))
}

#[cfg(target_os = "macos")]
fn spawn_system_audio_thread() -> Result<
    (
        mpsc::Sender<()>,
        mpsc::Receiver<Result<CapturedAudio, String>>,
    ),
    String,
> {
    let (stop_sender, stop_receiver) = mpsc::channel::<()>();
    let (audio_sender, audio_receiver) = mpsc::channel::<Result<CapturedAudio, String>>();
    let (ready_sender, ready_receiver) = mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || {
        let result = (|| -> Result<CapturedAudio, String> {
            let start_status = unsafe { yapflow_start_system_audio() };
            if start_status != 0 {
                return Err(format!("Could not start macOS system audio (error {start_status}). Check Screen & System Audio Recording permission."));
            }
            let _ = ready_sender.send(Ok(()));
            let _ = stop_receiver.recv();
            let mut pointer: *mut f32 = std::ptr::null_mut();
            let mut count = 0usize;
            let stop_status = unsafe { yapflow_stop_system_audio(&mut pointer, &mut count) };
            if stop_status != 0 {
                return Err(format!(
                    "Could not finish macOS system audio (error {stop_status})"
                ));
            }
            let samples = if pointer.is_null() || count == 0 {
                Vec::new()
            } else {
                let values = unsafe { std::slice::from_raw_parts(pointer, count).to_vec() };
                unsafe {
                    yapflow_free_system_audio(pointer);
                }
                values
            };
            Ok(CapturedAudio {
                samples,
                sample_rate: 16_000,
                channels: 1,
            })
        })();
        if let Err(error) = &result {
            let _ = ready_sender.send(Err(error.clone()));
        }
        let _ = audio_sender.send(result);
    });
    ready_receiver
        .recv_timeout(Duration::from_secs(8))
        .map_err(|_| "System audio did not start in time".to_string())??;
    Ok((stop_sender, audio_receiver))
}

#[cfg(target_os = "windows")]
fn spawn_system_audio_thread() -> Result<
    (
        mpsc::Sender<()>,
        mpsc::Receiver<Result<CapturedAudio, String>>,
    ),
    String,
> {
    use std::collections::VecDeque;
    use wasapi::{initialize_mta, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};
    let (stop_sender, stop_receiver) = mpsc::channel::<()>();
    let (audio_sender, audio_receiver) = mpsc::channel::<Result<CapturedAudio, String>>();
    let (ready_sender, ready_receiver) = mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || {
        let result = (|| -> Result<CapturedAudio, String> {
            initialize_mta()
                .ok()
                .map_err(|error| format!("Could not initialize Windows audio: {error}"))?;
            let enumerator = DeviceEnumerator::new().map_err(|error| error.to_string())?;
            let device = enumerator
                .get_default_device(&Direction::Render)
                .map_err(|error| format!("No playback device is available: {error}"))?;
            let mut client = device
                .get_iaudioclient()
                .map_err(|error| error.to_string())?;
            let format = WaveFormat::new(32, 32, &SampleType::Float, 48_000, 2, None);
            let (_, minimum_period) = client
                .get_device_period()
                .map_err(|error| error.to_string())?;
            client
                .initialize_client(
                    &format,
                    &Direction::Capture,
                    &StreamMode::EventsShared {
                        autoconvert: true,
                        buffer_duration_hns: minimum_period,
                    },
                )
                .map_err(|error| format!("Could not initialize WASAPI loopback: {error}"))?;
            let event = client
                .set_get_eventhandle()
                .map_err(|error| error.to_string())?;
            let capture = client
                .get_audiocaptureclient()
                .map_err(|error| error.to_string())?;
            let mut bytes = VecDeque::<u8>::new();
            client.start_stream().map_err(|error| error.to_string())?;
            let _ = ready_sender.send(Ok(()));
            while stop_receiver.try_recv().is_err() {
                capture
                    .read_from_device_to_deque(&mut bytes)
                    .map_err(|error| error.to_string())?;
                let _ = event.wait_for_event(100);
            }
            client.stop_stream().map_err(|error| error.to_string())?;
            capture
                .read_from_device_to_deque(&mut bytes)
                .map_err(|error| error.to_string())?;
            let bytes: Vec<u8> = bytes.into_iter().collect();
            let samples = bytes
                .chunks_exact(4)
                .map(|part| f32::from_le_bytes([part[0], part[1], part[2], part[3]]))
                .collect();
            Ok(CapturedAudio {
                samples,
                sample_rate: 48_000,
                channels: 2,
            })
        })();
        if let Err(error) = &result {
            let _ = ready_sender.send(Err(error.clone()));
        }
        let _ = audio_sender.send(result);
    });
    ready_receiver
        .recv_timeout(Duration::from_secs(8))
        .map_err(|_| "System audio did not start in time".to_string())??;
    Ok((stop_sender, audio_receiver))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn spawn_system_audio_thread() -> Result<
    (
        mpsc::Sender<()>,
        mpsc::Receiver<Result<CapturedAudio, String>>,
    ),
    String,
> {
    Err("System-audio recording is supported on macOS and Windows".into())
}

#[tauri::command]
fn start_dictation(
    app: tauri::AppHandle,
    recorder: tauri::State<RecorderState>,
    context_state: tauri::State<ContextState>,
) -> Result<(), String> {
    let mut guard = recorder.0.lock().map_err(|_| "Recorder is unavailable")?;
    if guard.is_some() {
        return Ok(());
    }
    if !model_ready() {
        return Err("Download the local speech model in YapFlow first".into());
    }
    #[cfg(target_os = "macos")]
    if unsafe { yapflow_microphone_status() } != 3 {
        return Err("Microphone access is not enabled for this signed copy of YapFlow. Open Settings → System access and renew Microphone access once.".into());
    }
    let target = read_active_context();
    *context_state.0.lock().expect("context lock") = target.clone();
    let (stop_sender, audio_receiver) = spawn_capture_thread()?;
    *guard = Some(RecordingSession {
        stop_sender,
        audio_receiver,
        started_at: Instant::now(),
        target,
    });
    app.emit(
        "yapflow://state",
        serde_json::json!({"mode":"recording","message":"Listening…"}),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn downmix_and_resample(interleaved: &[f32], source_rate: u32, channels: u16) -> Vec<f32> {
    if interleaved.is_empty() {
        return Vec::new();
    }
    let channels = channels.max(1) as usize;
    let mono: Vec<f32> = interleaved
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect();
    if source_rate == 16_000 {
        return mono;
    }
    let ratio = source_rate as f64 / 16_000.0;
    let output_len = (mono.len() as f64 / ratio) as usize;
    (0..output_len)
        .map(|index| {
            let position = index as f64 * ratio;
            let left = position.floor() as usize;
            let right = (left + 1).min(mono.len() - 1);
            let fraction = (position - left as f64) as f32;
            mono[left] * (1.0 - fraction) + mono[right] * fraction
        })
        .collect()
}

pub(crate) struct LocalTranscriber {
    context: WhisperContext,
}

impl LocalTranscriber {
    pub(crate) fn load() -> Result<Self, String> {
        let path = model_path()?;
        let context = WhisperContext::new_with_params(&path, WhisperContextParameters::default())
            .map_err(|e| format!("Could not load the speech model: {e}"))?;
        Ok(Self { context })
    }

    pub(crate) fn transcribe(
        &self,
        samples: &[f32],
        vocabulary: &[String],
        installed_languages: &[String],
    ) -> Result<(String, String), String> {
        transcribe_with_context(&self.context, samples, vocabulary, installed_languages)
    }
}

fn transcribe(
    samples: Vec<f32>,
    vocabulary: &[String],
    installed_languages: &[String],
) -> Result<(String, String), String> {
    LocalTranscriber::load()?.transcribe(&samples, vocabulary, installed_languages)
}

fn transcribe_with_context(
    context: &WhisperContext,
    samples: &[f32],
    vocabulary: &[String],
    installed_languages: &[String],
) -> Result<(String, String), String> {
    if samples.len() < 1_600 {
        return Err("I didn’t hear enough audio. Try holding the shortcut a little longer.".into());
    }
    let (rms, peak) = audio_signal_levels(&samples);
    if rms < 0.0015 && peak < 0.01 {
        return Err("No voice was captured. Check YapFlow’s Microphone permission and the selected microphone, then try again.".into());
    }
    let mut state = context.create_state().map_err(|e| e.to_string())?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 3 });
    params.set_language(None);
    params.set_no_timestamps(true);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_special(false);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params.set_temperature(0.0);
    params.set_no_speech_thold(0.6);
    if !vocabulary.is_empty() {
        let prompt = format!(
            "Correct spelling for this vocabulary: {}.",
            vocabulary.join(", ")
        );
        params.set_initial_prompt(&prompt);
    }
    state
        .full(params, &samples)
        .map_err(|e| format!("Transcription failed: {e}"))?;
    let language_id = state.full_lang_id_from_state();
    let language = get_lang_str(language_id).unwrap_or("unknown").to_string();
    if language != "unknown" && !installed_languages.iter().any(|code| code == &language) {
        let name = get_lang_str_full(language_id)
            .map(str::to_string)
            .unwrap_or_else(|| language.clone());
        return Err(format!(
            "I detected {name}. Install it from Languages in YapFlow, then try again."
        ));
    }
    let text = state
        .as_iter()
        .filter_map(|segment| segment.to_str().ok())
        .collect::<Vec<_>>()
        .join(" ");
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err("No speech was detected. Try speaking closer to the microphone.".into());
    }
    Ok((text, language))
}

fn audio_signal_levels(samples: &[f32]) -> (f32, f32) {
    if samples.is_empty() {
        return (0.0, 0.0);
    }
    let mut sum_squares = 0.0f64;
    let mut peak = 0.0f32;
    for sample in samples {
        let value = if sample.is_finite() { *sample } else { 0.0 };
        sum_squares += f64::from(value) * f64::from(value);
        peak = peak.max(value.abs());
    }
    ((sum_squares / samples.len() as f64).sqrt() as f32, peak)
}

fn strip_fillers(text: &str) -> String {
    let fillers = ["um", "uh", "erm", "hmm", "ah"];
    let mut words = Vec::new();
    for word in text.split_whitespace() {
        let normalized = word
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        if fillers.contains(&normalized.as_str()) {
            continue;
        }
        if words
            .last()
            .map(|previous: &String| previous.eq_ignore_ascii_case(word))
            .unwrap_or(false)
        {
            continue;
        }
        words.push(word.to_string());
    }
    words.join(" ")
}

fn trim_correction_edges(text: &str) -> &str {
    text.trim_matches(|character: char| {
        character.is_whitespace() || ",.;:!?—–-".contains(character)
    })
}

fn without_last_utterance(text: &str) -> String {
    let trimmed = text.trim_end_matches(|character: char| {
        character.is_whitespace() || ",.;:!?—–-".contains(character)
    });
    let boundary = trimmed
        .char_indices()
        .rev()
        .find(|(_, character)| ".!?;\n".contains(*character))
        .map(|(index, character)| index + character.len_utf8());
    boundary
        .map(|index| trimmed[..index].trim().to_string())
        .unwrap_or_default()
}

fn without_last_word(text: &str) -> String {
    let trimmed = text.trim_end_matches(|character: char| {
        character.is_whitespace() || ",.;:!?—–-".contains(character)
    });
    trimmed
        .rfind(char::is_whitespace)
        .map(|index| trimmed[..index].trim_end().to_string())
        .unwrap_or_default()
}

fn apply_spoken_corrections(text: &str) -> String {
    let reset = Regex::new(r"(?i)\b(?:(?:no|sorry)[\s,.-]*)?(?:i\s+(?:didn['’]?t|did\s+not)\s+mean\s+that|that(?:['’]?s|\s+is)\s+not\s+(?:right|what\s+i\s+meant)|scratch\s+that|cancel\s+that|ignore\s+that|let\s+me\s+(?:start\s+over|rephrase))\b[\s,.;:!?—–-]*").expect("valid reset correction regex");
    let replace = Regex::new(r"(?i)\b(?:(?:no|sorry)[\s,.-]*)?(?:i\s+mean|i\s+meant|make\s+that|correction)\b[\s,.;:!?—–-]*").expect("valid replacement correction regex");
    let mut result = text.trim().to_string();
    for _ in 0..8 {
        if let Some(found) = reset.find(&result) {
            let prefix = without_last_utterance(&result[..found.start()]);
            let replacement = trim_correction_edges(&result[found.end()..]);
            result = [prefix.as_str(), replacement]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            continue;
        }
        if let Some(found) = replace.find(&result) {
            let replacement = trim_correction_edges(&result[found.end()..]);
            if replacement.is_empty() {
                break;
            }
            let replacement_words = replacement.split_whitespace().take(5).count();
            let prefix = if replacement_words <= 3 {
                without_last_word(&result[..found.start()])
            } else {
                without_last_utterance(&result[..found.start()])
            };
            result = [prefix.as_str(), replacement]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            continue;
        }
        break;
    }
    result.trim().to_string()
}

fn vocabulary_correct(text: &str, vocabulary: &[String]) -> String {
    let mut words: Vec<String> = text.split_whitespace().map(str::to_string).collect();
    for canonical in vocabulary {
        let target: String = canonical
            .chars()
            .filter(|c| c.is_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect();
        if target.len() < 4 {
            continue;
        }
        let mut best: Option<(usize, usize, f64)> = None;
        for start in 0..words.len() {
            for width in 1..=3.min(words.len() - start) {
                let candidate: String = words[start..start + width]
                    .join("")
                    .chars()
                    .filter(|c| c.is_alphanumeric())
                    .flat_map(char::to_lowercase)
                    .collect();
                if candidate.len().abs_diff(target.len()) > 3 {
                    continue;
                }
                let score = normalized_levenshtein(&candidate, &target);
                if score >= 0.76
                    && best
                        .as_ref()
                        .map(|(_, _, old)| score > *old)
                        .unwrap_or(true)
                {
                    best = Some((start, width, score));
                }
            }
        }
        if let Some((start, width, _)) = best {
            words.splice(start..start + width, [canonical.clone()]);
        }
    }
    words.join(" ")
}

fn sentence_case(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut chars = trimmed.chars();
    let first = chars.next().unwrap().to_uppercase().collect::<String>();
    let mut output = format!("{}{}", first, chars.collect::<String>());
    if !output.ends_with(['.', '!', '?']) {
        output.push('.');
    }
    output
}

fn format_for_context(text: &str, profile: &str, remove_fillers: bool) -> String {
    let cleaned = if remove_fillers {
        strip_fillers(text)
    } else {
        text.to_string()
    };
    let polished = sentence_case(&cleaned);
    match profile {
        "Email" => {
            let mut parts: Vec<&str> = polished
                .split_inclusive(['.', '!', '?'])
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .collect();
            if parts.len() > 2 {
                let rest = parts.split_off(1);
                format!("{}\n\n{}", parts.join(" "), rest.join(" "))
            } else {
                polished
            }
        }
        "Document" => {
            let sentences: Vec<&str> = polished
                .split_inclusive(['.', '!', '?'])
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .collect();
            sentences
                .chunks(3)
                .map(|chunk| chunk.join(" "))
                .collect::<Vec<_>>()
                .join("\n\n")
        }
        _ => polished,
    }
}

fn type_into_active_app(text: &str) -> Result<(), String> {
    std::thread::sleep(Duration::from_millis(120));
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        format!("YapFlow needs Accessibility permission to type into other apps: {e}")
    })?;
    enigo
        .text(text)
        .map_err(|e| format!("Could not type into the active app: {e}"))
}

#[cfg(target_os = "macos")]
fn focused_text_target_available() -> bool {
    use accessibility_sys::{
        kAXFocusedUIElementAttribute, kAXValueAttribute, AXUIElementCopyAttributeValue,
        AXUIElementCreateSystemWide, AXUIElementIsAttributeSettable, AXUIElementRef,
    };
    use core_foundation::{
        base::{CFRelease, CFTypeRef, TCFType},
        string::CFString,
    };
    use std::ffi::c_uchar;

    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return false;
        }
        let focused_name = CFString::from_static_string(kAXFocusedUIElementAttribute);
        let mut focused: CFTypeRef = std::ptr::null();
        let focused_error =
            AXUIElementCopyAttributeValue(system, focused_name.as_concrete_TypeRef(), &mut focused);
        CFRelease(system as CFTypeRef);
        if focused_error != 0 || focused.is_null() {
            return false;
        }

        let value_name = CFString::from_static_string(kAXValueAttribute);
        let mut settable: c_uchar = 0;
        let settable_error = AXUIElementIsAttributeSettable(
            focused as AXUIElementRef,
            value_name.as_concrete_TypeRef(),
            &mut settable,
        );
        CFRelease(focused);
        settable_error == 0 && settable != 0
    }
}

#[cfg(not(target_os = "macos"))]
fn focused_text_target_available() -> bool {
    true
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.set_text(text).map_err(|error| error.to_string())
}

#[tauri::command]
fn native_permission_status() -> PermissionResult {
    #[cfg(target_os = "macos")]
    {
        use core_graphics::access::ScreenCaptureAccess;
        let microphone_status = unsafe { yapflow_microphone_status() };
        PermissionResult {
            microphone: Some(microphone_status == 3),
            microphone_state: match microphone_status {
                0 => "not_determined",
                1 => "restricted",
                2 => "denied",
                3 => "granted",
                _ => "unknown",
            }
            .into(),
            accessibility: unsafe { AXIsProcessTrusted() },
            input_monitoring: unsafe { CGPreflightListenEventAccess() },
            screen_recording: ScreenCaptureAccess::default().preflight(),
        }
    }
    #[cfg(target_os = "windows")]
    {
        let microphone = windows_microphone_permission();
        PermissionResult {
            microphone,
            microphone_state: match microphone {
                Some(true) => "granted",
                Some(false) => "denied",
                None => "not_determined",
            }
            .into(),
            accessibility: true,
            input_monitoring: true,
            screen_recording: true,
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        PermissionResult {
            microphone: None,
            microphone_state: "webview".into(),
            accessibility: true,
            input_monitoring: true,
            screen_recording: true,
        }
    }
}

#[cfg(target_os = "macos")]
fn request_accessibility_access() -> bool {
    let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
    let value = CFBoolean::true_value();
    let options = CFDictionary::from_CFType_pairs(&[(key, value)]);
    unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) }
}

#[tauri::command]
fn reset_stale_permissions(permissions: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        for permission in permissions {
            let service = match permission.as_str() {
                "microphone" => "Microphone",
                "accessibility" => "Accessibility",
                "input_monitoring" => "ListenEvent",
                "screen_recording" => "ScreenCapture",
                _ => continue,
            };
            let status = std::process::Command::new("/usr/bin/tccutil")
                .args(["reset", service, "app.yapflow.desktop"])
                .status()
                .map_err(|error| format!("Could not reset stale {service} access: {error}"))?;
            if !status.success() {
                return Err(format!("macOS could not reset stale {service} access"));
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = permissions;
        Ok(())
    }
}

#[cfg(any(target_os = "windows", test))]
fn combine_consent(values: &[Option<bool>]) -> Option<bool> {
    if values.iter().any(|value| *value == Some(false)) {
        Some(false)
    } else if values.iter().any(Option::is_some) {
        Some(true)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn windows_microphone_permission() -> Option<bool> {
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
        RegKey,
    };
    fn value(root: winreg::HKEY, path: &str) -> Option<bool> {
        let key = RegKey::predef(root).open_subkey(path).ok()?;
        let value: String = key.get_value("Value").ok()?;
        match value.to_ascii_lowercase().as_str() {
            "allow" => Some(true),
            "deny" => Some(false),
            _ => None,
        }
    }
    // Windows desktop apps share the OS-level desktop microphone grant. Read
    // the machine, user, and NonPackaged consent stores; any explicit denial
    // wins. No YapFlow history or cached application state is consulted.
    combine_consent(&[
        value(
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone",
        ),
        value(
            HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone",
        ),
        value(
            HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged",
        ),
    ])
}

#[tauri::command]
fn request_native_permission(
    permission: String,
    app: tauri::AppHandle,
    mouse_state: tauri::State<MouseMonitorState>,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use core_graphics::access::ScreenCaptureAccess;
        match permission.as_str() {
            "microphone" => {
                let status = unsafe { yapflow_microphone_status() };
                if status == 3 {
                    return Ok(true);
                }
                let resolved = if status == 0 {
                    unsafe { yapflow_request_microphone() }
                } else {
                    status
                };
                if resolved == 1 || resolved == 2 {
                    // Only open System Settings after macOS has registered the
                    // signed application and the user previously denied access.
                    open_permission_settings("microphone")?;
                }
                Ok(resolved == 3)
            }
            "accessibility" => {
                if unsafe { AXIsProcessTrusted() } {
                    return Ok(true);
                }
                let allowed = request_accessibility_access();
                if !allowed {
                    open_permission_settings("accessibility")?;
                }
                Ok(allowed)
            }
            "input_monitoring" => {
                let allowed =
                    unsafe { CGPreflightListenEventAccess() || CGRequestListenEventAccess() };
                if allowed {
                    setup_auxiliary_mouse_monitor(app, mouse_state.0.clone());
                } else {
                    open_permission_settings("input_monitoring")?;
                }
                Ok(allowed)
            }
            "screen_recording" => {
                let access = ScreenCaptureAccess::default();
                Ok(access.preflight() || access.request())
            }
            _ => Err(format!("Unknown permission: {permission}")),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, mouse_state);
        #[cfg(target_os = "windows")]
        {
            if permission == "microphone" {
                if windows_microphone_permission() == Some(true) {
                    return Ok(true);
                }
                open_permission_settings("microphone")?;
                return Ok(windows_microphone_permission() == Some(true));
            }
            Ok(true)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = permission;
            Ok(true)
        }
    }
}

#[tauri::command]
fn open_permission_settings(permission: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let target = match permission {
        "microphone" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        }
        "accessibility" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        "input_monitoring" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
        }
        "screen_recording" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        _ => return Err("Unknown permission".into()),
    };
    #[cfg(target_os = "macos")]
    return std::process::Command::new("/usr/bin/open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string());
    #[cfg(target_os = "windows")]
    {
        if permission != "microphone" {
            return Err("Unknown permission".into());
        }
        return std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:privacy-microphone"])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = permission;
        Err("Open your system microphone settings".into())
    }
}

#[tauri::command]
fn restart_for_permissions(app: tauri::AppHandle) {
    app.request_restart();
}

#[tauri::command]
fn set_setup_complete(app: tauri::AppHandle, complete: bool) -> Result<(), String> {
    let notch = app
        .get_webview_window("notch")
        .ok_or("The notch window is unavailable")?;
    if complete {
        notch.show().map_err(|error| error.to_string())?;
        attach_notch_to_menu_bar(&notch).map_err(|error| error.to_string())?;
    } else {
        notch.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn stop_dictation(
    app: tauri::AppHandle,
    recorder: tauri::State<'_, RecorderState>,
    vocabulary: Vec<String>,
    installed_languages: Vec<String>,
    auto_paste: bool,
    remove_fillers: bool,
) -> Result<DictationResult, String> {
    let _ = app.emit(
        "yapflow://state",
        serde_json::json!({"mode":"processing","message":"Polishing…"}),
    );
    let result: Result<DictationResult, String> = async {
        let recording = recorder
            .0
            .lock()
            .map_err(|_| "Recorder is unavailable")?
            .take()
            .ok_or("No dictation is running")?;
        let RecordingSession {
            stop_sender,
            audio_receiver,
            started_at,
            target,
        } = recording;
        let duration_ms = started_at.elapsed().as_millis();
        stop_sender
            .send(())
            .map_err(|_| "The microphone stopped unexpectedly")?;
        let captured = audio_receiver
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "Timed out while finishing the recording")??;
        let mono = downmix_and_resample(&captured.samples, captured.sample_rate, captured.channels);
        let vocab_for_task = vocabulary.clone();
        let languages_for_task = installed_languages.clone();
        let (raw, detected_language) = tauri::async_runtime::spawn_blocking(move || {
            transcribe(mono, &vocab_for_task, &languages_for_task)
        })
        .await
        .map_err(|e| e.to_string())??;
        let corrected = vocabulary_correct(&apply_spoken_corrections(&raw), &vocabulary);
        let formatted = format_for_context(
            &corrected,
            &target.profile,
            remove_fillers && detected_language == "en",
        );
        let pasted = auto_paste
            && focused_text_target_available()
            && type_into_active_app(&formatted).is_ok();
        Ok(DictationResult {
            raw_text: raw,
            formatted_text: formatted,
            app_name: target.app_name,
            app_title: target.title,
            profile: target.profile,
            duration_ms,
            pasted,
            detected_language,
        })
    }
    .await;
    if let Ok(transcript) = &result {
        let _ = app.emit("yapflow://transcript", transcript);
    }
    let message = if result.is_ok() { "Done" } else { "Ready" };
    let _ = app.emit(
        "yapflow://state",
        serde_json::json!({"mode":"idle","message":message}),
    );
    result
}

fn save_meeting_audio(
    microphone: &CapturedAudio,
    system: &CapturedAudio,
) -> Result<PathBuf, String> {
    let microphone = downmix_and_resample(
        &microphone.samples,
        microphone.sample_rate,
        microphone.channels,
    );
    let system = downmix_and_resample(&system.samples, system.sample_rate, system.channels);
    let frames = microphone.len().max(system.len());
    if frames == 0 {
        return Err("No meeting audio was captured".into());
    }
    let directory = dirs::data_local_dir()
        .ok_or("Could not find the local data directory")?
        .join("YapFlow")
        .join("meetings");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let path = directory.join(format!("meeting-{timestamp}.wav"));
    // Keep the sources discrete: left is the local microphone and right is
    // desktop/system audio. This both proves the remote side was captured and
    // preserves cleaner inputs for later diarization/transcription.
    let specification = hound::WavSpec {
        channels: 2,
        sample_rate: 16_000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer =
        hound::WavWriter::create(&path, specification).map_err(|error| error.to_string())?;
    for index in 0..frames {
        let local = microphone.get(index).copied().unwrap_or_default();
        let desktop = system.get(index).copied().unwrap_or_default();
        writer
            .write_sample((local.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .map_err(|error| error.to_string())?;
        writer
            .write_sample((desktop.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .map_err(|error| error.to_string())?;
    }
    writer.finalize().map_err(|error| error.to_string())?;
    Ok(path)
}

fn meeting_recordings_dir() -> Result<PathBuf, String> {
    Ok(dirs::data_local_dir()
        .ok_or("Could not find the local data directory")?
        .join("YapFlow")
        .join("meetings"))
}

#[tauri::command]
fn list_meeting_recordings() -> Result<Vec<MeetingRecordingResult>, String> {
    scan_meeting_recordings(&meeting_recordings_dir()?)
}

fn scan_meeting_recordings(
    directory: &std::path::Path,
) -> Result<Vec<MeetingRecordingResult>, String> {
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut recordings = Vec::new();
    for entry in std::fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("wav"))
            != Some(true)
        {
            continue;
        }
        let reader = match hound::WavReader::open(&path) {
            Ok(reader) => reader,
            Err(_) => continue,
        };
        let specification = reader.spec();
        let duration_ms =
            u128::from(reader.duration()) * 1_000 / u128::from(specification.sample_rate.max(1));
        let created_at = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .and_then(|stem| stem.strip_prefix("meeting-"))
            .and_then(|timestamp| timestamp.parse::<u64>().ok())
            .map(|timestamp| timestamp * 1_000)
            .or_else(|| {
                entry
                    .metadata()
                    .ok()?
                    .modified()
                    .ok()?
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|duration| duration.as_millis() as u64)
            })
            .unwrap_or_default();
        recordings.push(MeetingRecordingResult {
            path: path.to_string_lossy().into_owned(),
            provider: "meeting".into(),
            duration_ms,
            created_at,
            microphone_samples: 0,
            system_audio_samples: 0,
        });
    }
    recordings.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(recordings)
}

#[tauri::command]
fn start_meeting(
    app: tauri::AppHandle,
    recorder: tauri::State<MeetingRecorderState>,
    context_state: tauri::State<ContextState>,
) -> Result<(), String> {
    let mut guard = recorder
        .0
        .lock()
        .map_err(|_| "Meeting recorder is unavailable")?;
    if guard.is_some() {
        return Ok(());
    }
    let active = context_state
        .0
        .lock()
        .map_err(|_| "Meeting context is unavailable")?
        .clone();
    let (provider, _) = detected_meeting(&active)
        .ok_or("YapFlow can no longer confirm an active Zoom or Google Meet call")?;
    let (microphone_stop, microphone_audio) = spawn_capture_thread()?;
    let (system_stop, system_audio) = match spawn_system_audio_thread() {
        Ok(stream) => stream,
        Err(error) => {
            let _ = microphone_stop.send(());
            let _ = microphone_audio.recv_timeout(Duration::from_secs(2));
            return Err(error);
        }
    };
    *guard = Some(MeetingRecordingSession {
        microphone_stop,
        microphone_audio,
        system_stop,
        system_audio,
        started_at: Instant::now(),
        provider,
    });
    app.emit(
        "yapflow://state",
        serde_json::json!({"mode":"meeting","message":"Recording microphone + system audio"}),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn stop_meeting(
    app: tauri::AppHandle,
    recorder: tauri::State<MeetingRecorderState>,
) -> Result<MeetingRecordingResult, String> {
    let recording = recorder
        .0
        .lock()
        .map_err(|_| "Meeting recorder is unavailable")?
        .take()
        .ok_or("No meeting recording is running")?;
    let MeetingRecordingSession {
        microphone_stop,
        microphone_audio,
        system_stop,
        system_audio,
        started_at,
        provider,
    } = recording;
    let _ = microphone_stop.send(());
    let _ = system_stop.send(());
    let microphone = microphone_audio
        .recv_timeout(Duration::from_secs(8))
        .map_err(|_| "Timed out while finishing microphone audio")??;
    let system = system_audio
        .recv_timeout(Duration::from_secs(8))
        .map_err(|_| "Timed out while finishing system audio")??;
    let path = save_meeting_audio(&microphone, &system)?;
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis() as u64;
    let result = MeetingRecordingResult {
        path: path.to_string_lossy().into_owned(),
        provider,
        duration_ms: started_at.elapsed().as_millis(),
        created_at,
        microphone_samples: microphone.samples.len(),
        system_audio_samples: system.samples.len(),
    };
    let _ = app.emit("yapflow://meeting-recorded", &result);
    let _ = app.emit(
        "yapflow://state",
        serde_json::json!({"mode":"idle","message":"Meeting recording saved"}),
    );
    Ok(result)
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open YapFlow", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit YapFlow", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn setup_auxiliary_mouse_monitor(app: tauri::AppHandle, running: Arc<AtomicBool>) {
    if running.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let result = CGEventTap::with_enabled(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![
                CGEventType::LeftMouseDown,
                CGEventType::LeftMouseUp,
                CGEventType::RightMouseDown,
                CGEventType::RightMouseUp,
                CGEventType::OtherMouseDown,
                CGEventType::OtherMouseUp,
            ],
            move |_proxy, event_type, event| {
                let button = event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER);
                let pressed = matches!(
                    event_type,
                    CGEventType::LeftMouseDown
                        | CGEventType::RightMouseDown
                        | CGEventType::OtherMouseDown
                );
                let _ = app.emit(
                    "yapflow://mouse-shortcut",
                    serde_json::json!({
                        "shortcut": format!("Mouse{}", button + 1),
                        "state": if pressed { "pressed" } else { "released" }
                    }),
                );
                CallbackResult::Keep
            },
            CFRunLoop::run_current,
        );
        if result.is_err() {
            running.store(false, Ordering::SeqCst);
            log::error!("Could not start the auxiliary mouse button monitor. Input Monitoring permission may be required.");
        }
    });
}

#[cfg(target_os = "windows")]
static WINDOWS_MOUSE_APP: std::sync::OnceLock<Mutex<Option<tauri::AppHandle>>> =
    std::sync::OnceLock::new();

#[cfg(target_os = "windows")]
unsafe extern "system" fn windows_mouse_hook(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, MSLLHOOKSTRUCT, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
        WM_RBUTTONDOWN, WM_RBUTTONUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
    };
    if code >= 0 {
        let message = wparam.0 as u32;
        let (button, pressed) = match message {
            WM_LBUTTONDOWN => (Some(1), true),
            WM_LBUTTONUP => (Some(1), false),
            WM_RBUTTONDOWN => (Some(2), true),
            WM_RBUTTONUP => (Some(2), false),
            WM_MBUTTONDOWN => (Some(3), true),
            WM_MBUTTONUP => (Some(3), false),
            WM_XBUTTONDOWN | WM_XBUTTONUP => {
                let data = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                let xbutton = ((data.mouseData >> 16) & 0xffff) as i32;
                (
                    Some(if xbutton == 1 { 4 } else { 5 }),
                    message == WM_XBUTTONDOWN,
                )
            }
            _ => (None, false),
        };
        if let Some(button) = button {
            if let Some(app) = WINDOWS_MOUSE_APP
                .get()
                .and_then(|slot| slot.lock().ok()?.clone())
            {
                let _ = app.emit(
                    "yapflow://mouse-shortcut",
                    serde_json::json!({
                        "shortcut": format!("Mouse{button}"),
                        "state": if pressed { "pressed" } else { "released" }
                    }),
                );
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

#[cfg(target_os = "windows")]
fn setup_auxiliary_mouse_monitor(app: tauri::AppHandle, running: Arc<AtomicBool>) {
    if running.swap(true, Ordering::SeqCst) {
        return;
    }
    let slot = WINDOWS_MOUSE_APP.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = slot.lock() {
        *guard = Some(app);
    }
    std::thread::spawn(move || unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetMessageW, SetWindowsHookExW, MSG, WH_MOUSE_LL,
        };
        let Ok(_hook) = SetWindowsHookExW(WH_MOUSE_LL, Some(windows_mouse_hook), None, 0) else {
            running.store(false, Ordering::SeqCst);
            return;
        };
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).0 > 0 {}
        running.store(false, Ordering::SeqCst);
    });
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn setup_auxiliary_mouse_monitor(_app: tauri::AppHandle, _running: Arc<AtomicBool>) {}

#[tauri::command]
fn enable_auxiliary_mouse_monitor(
    app: tauri::AppHandle,
    state: tauri::State<MouseMonitorState>,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let allowed = unsafe { CGPreflightListenEventAccess() || CGRequestListenEventAccess() };
        if allowed {
            setup_auxiliary_mouse_monitor(app, state.0.clone());
        }
        Ok(allowed)
    }
    #[cfg(not(target_os = "macos"))]
    {
        setup_auxiliary_mouse_monitor(app, state.0.clone());
        Ok(true)
    }
}

#[cfg(target_os = "macos")]
fn attach_notch_to_menu_bar(notch: &tauri::WebviewWindow) -> tauri::Result<()> {
    let native = notch.ns_window()? as *mut NSWindow;
    // SAFETY: Tauri owns this NSWindow for the lifetime of `notch`, and setup
    // runs on AppKit's main thread. We only change ordinary NSWindow properties.
    unsafe {
        let window = &*native;

        // Normal always-on-top windows are kept below the menu bar by AppKit.
        // Status-bar level allows this accessory window to share the hardware
        // notch's Y=0 menu-bar strip instead of being constrained to Y=34.
        window.setLevel(25);
        window.setCollectionBehavior(
            window.collectionBehavior()
                | NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle
                | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );

        if let Some(screen) = window.screen() {
            let screen_frame = screen.frame();
            let window_frame = window.frame();
            let left_of_notch = screen.auxiliaryTopLeftArea();
            let right_of_notch = screen.auxiliaryTopRightArea();
            let notch_center = if left_of_notch.size.width > 0.0 && right_of_notch.size.width > 0.0
            {
                let notch_left = left_of_notch.origin.x + left_of_notch.size.width;
                let notch_right = right_of_notch.origin.x;
                (notch_left + notch_right) / 2.0
            } else {
                screen_frame.origin.x + screen_frame.size.width / 2.0
            };
            let x = notch_center - window_frame.size.width / 2.0;
            let y = screen_frame.origin.y + screen_frame.size.height - window_frame.size.height;
            window.setFrameOrigin(NSPoint::new(x, y));
        }
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn attach_notch_to_menu_bar(notch: &tauri::WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = notch.primary_monitor()? {
        let monitor_position = monitor.position();
        let screen_width = monitor.size().width as i32;
        let window_width = notch.outer_size()?.width as i32;
        let x = monitor_position.x + (screen_width - window_width) / 2;
        notch.set_position(PhysicalPosition::new(x, monitor_position.y))?;
    }
    Ok(())
}

#[tauri::command]
fn dock_notch(app: tauri::AppHandle) -> Result<(), String> {
    let notch = app
        .get_webview_window("notch")
        .ok_or("The notch window is unavailable")?;
    attach_notch_to_menu_bar(&notch).map_err(|error| error.to_string())
}

#[tauri::command]
fn resize_notch(app: tauri::AppHandle, height: f64) -> Result<(), String> {
    let notch = app
        .get_webview_window("notch")
        .ok_or("The notch window is unavailable")?;
    // A transparent native window still captures clicks. Keep its frame exactly
    // as tall as the rendered island so the unused area below it passes through
    // to browser tabs and every other application.
    let height = if height.is_finite() {
        height.ceil().clamp(37.0, 164.0)
    } else {
        37.0
    };
    notch
        .set_size(LogicalSize::new(300.0, height))
        .map_err(|error| error.to_string())?;
    attach_notch_to_menu_bar(&notch).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(RecorderState::default())
        .manage(MeetingRecorderState::default())
        .manage(ContextState::default())
        .manage(MouseMonitorState::default())
        .setup(|app| {
            setup_tray(app)?;
            if let Some(notch) = app.get_webview_window("notch") {
                attach_notch_to_menu_bar(&notch)?;
                #[cfg(target_os = "macos")]
                notch.set_ignore_cursor_events(false)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            model_ready,
            remove_legacy_agent_models,
            download_model,
            supported_languages,
            get_active_context,
            announce_meeting,
            start_dictation,
            stop_dictation,
            start_meeting,
            stop_meeting,
            list_meeting_recordings,
            dock_notch,
            resize_notch,
            enable_auxiliary_mouse_monitor,
            copy_text,
            native_permission_status,
            reset_stale_permissions,
            request_native_permission,
            open_permission_settings,
            restart_for_permissions,
            set_setup_complete
        ])
        .build(tauri::generate_context!())
        .expect("failed to build YapFlow")
        .run(|_app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                // Closing the main window keeps YapFlow alive in the notch. A
                // dock reopen therefore does not remount React, so explicitly
                // tell the existing webview to perform a fresh update check.
                let _ = _app.emit("yapflow://app-reopened", ());
            }
            RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_meeting_audio_is_discovered_with_its_duration() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("yapflow-meeting-test-{unique}"));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("meeting-1790605000.wav");
        let specification = hound::WavSpec {
            channels: 2,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, specification).unwrap();
        for _ in 0..32_000 {
            writer.write_sample(1_i16).unwrap();
            writer.write_sample(2_i16).unwrap();
        }
        writer.finalize().unwrap();
        let recordings = scan_meeting_recordings(&directory).unwrap();
        assert_eq!(recordings.len(), 1);
        assert_eq!(recordings[0].duration_ms, 2_000);
        assert_eq!(recordings[0].created_at, 1_790_605_000_000);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn vocabulary_fixes_spoken_variants() {
        assert_eq!(
            vocabulary_correct("connect it to super base today", &["Supabase".into()]),
            "connect it to Supabase today"
        );
        assert_eq!(
            vocabulary_correct("send this through boo send", &["BooSend".into()]),
            "send this through BooSend"
        );
        assert_eq!(
            vocabulary_correct("open zorro mail", &["ZorroMail".into()]),
            "open ZorroMail"
        );
    }

    #[test]
    fn filler_cleanup_removes_repeats() {
        assert_eq!(
            strip_fillers("um we we should ship this"),
            "we should ship this"
        );
    }

    #[test]
    fn silent_audio_is_distinguishable_from_voice() {
        let (silent_rms, silent_peak) = audio_signal_levels(&vec![0.0; 16_000]);
        assert_eq!((silent_rms, silent_peak), (0.0, 0.0));
        let voice = (0..16_000)
            .map(|index| if index % 2 == 0 { 0.04 } else { -0.04 })
            .collect::<Vec<_>>();
        let (voice_rms, voice_peak) = audio_signal_levels(&voice);
        assert!(voice_rms > 0.0015);
        assert!(voice_peak > 0.01);
    }

    #[test]
    fn spoken_corrections_keep_only_the_intended_text() {
        assert_eq!(
            apply_spoken_corrections(
                "Meet me on Tuesday. No, I didn't mean that. Meet me on Wednesday."
            ),
            "Meet me on Wednesday"
        );
        assert_eq!(
            apply_spoken_corrections("Send it to Sarah, I meant Sara."),
            "Send it to Sara"
        );
        assert_eq!(
            apply_spoken_corrections("The appointment is at five, make that six."),
            "The appointment is at six"
        );
        assert_eq!(
            apply_spoken_corrections(
                "Hi John. Use the old draft. Scratch that. Use the final draft."
            ),
            "Hi John. Use the final draft"
        );
    }

    #[test]
    fn detects_meetings() {
        assert!(classify_context("Google Chrome", "Weekly sync - Google Meet").1);
        assert!(classify_context("zoom.us", "Zoom Meeting").1);
        assert!(!classify_context("zoom.us", "Zoom Workplace").1);
        assert_eq!(
            browser_meeting("Google Chrome", "Zoom Meeting").map(|meeting| meeting.0),
            Some("zoom".into())
        );
        assert!(browser_meeting("Google Chrome", "Zoom – Account Settings").is_none());
        assert!(!has_in_call_controls(
            "Mute Start video Participants Share",
            "zoom"
        ));
        assert!(has_in_call_controls(
            "Mute Start video Participants Leave Meeting",
            "zoom"
        ));
        assert!(has_in_call_controls(
            "Mute Start Video Participants Share Screen Leave",
            "zoom"
        ));
        assert!(!has_in_call_controls(
            "New Meeting Join Share Screen",
            "zoom"
        ));
        assert!(!has_in_call_controls("Microphone Camera Join now", "meet"));
        assert!(has_in_call_controls("Microphone Camera Leave call", "meet"));
        assert!(has_google_meet_room_url(
            "https://meet.google.com/abc-defg-hij"
        ));
        assert!(!has_google_meet_room_url("https://meet.google.com/home"));
        assert!(!has_google_meet_room_url("https://meet.google.com/landing"));
        assert!(confirmed_google_meet_window(
            "https://meet.google.com/abc-defg-hij Turn off microphone Turn off camera Leave call"
        ));
        assert!(confirmed_google_meet_window("https://meet.google.com/wee-fjhm-moo Meeting details People Audio settings Turn off microphone Video settings Turn off camera Share screen Raise hand Leave call Chat with everyone You have joined the call"));
        assert!(!confirmed_google_meet_window(
            "https://meet.google.com/abc-defg-hij Microphone Camera Join now"
        ));
    }

    #[test]
    fn multilingual_catalog_includes_major_languages() {
        let languages = supported_languages();
        assert!(languages.len() >= 99);
        for code in ["en", "es", "fr", "de", "ja", "zh", "ar", "hi"] {
            assert!(languages.iter().any(|language| language.code == code));
        }
    }

    #[test]
    fn operating_system_consent_denial_wins() {
        assert_eq!(
            combine_consent(&[Some(true), Some(false), None]),
            Some(false)
        );
        assert_eq!(combine_consent(&[Some(true), None]), Some(true));
        assert_eq!(combine_consent(&[None, None]), None);
    }
}
