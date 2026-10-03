import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  ArrowLeft, BookOpen, ChevronRight, CircleHelp, CircleStop, Code2, Copy, Download, FileText,
  Bot, FolderOpen, Gauge, Hash, History, Home, Keyboard, Languages as LanguagesIcon, Mail, MessageCircle, Play, Radio, RefreshCw, Search, Settings, Users, Video, X
} from 'lucide-react';
import './styles.css';
import { MarketingSite } from './marketing';
import { PermissionFlow, type PermissionId, type PermissionState, type PermissionView } from './permission-flow';
import { dashboardStats, type UsageCategory } from './analytics';
import { findMeetingRecord, mergeMeetingRecordings, type MeetingHistoryRecord, type MeetingRecording } from './meeting-history';
import { isNewerVersion } from './versioning';

type Page = 'home' | 'meetings' | 'speech' | 'vocabulary' | 'languages' | 'settings';
type Mode = 'idle' | 'recording' | 'processing' | 'meeting';
type AppContext = { app_name: string; title: string; profile: string; meeting_detected: boolean; meeting_provider?: 'zoom' | 'meet'; meeting_title?: string };
type DictationResult = { raw_text: string; formatted_text: string; app_name: string; app_title?: string; profile: string; duration_ms: number; pasted: boolean; detected_language?: string };
type LanguageOption = { code: string; name: string };
type HistoryItem = DictationResult & { id: number; created_at: string };
type Preferences = { pushToTalk: string; toggle: string; launchAtLogin: boolean; autoPaste: boolean; removeFillers: boolean };
type MouseShortcutEvent = { shortcut: string; state: 'pressed' | 'released' };
type PermissionResult = { microphone: boolean | null; microphone_state: string; accessibility: boolean; input_monitoring: boolean; screen_recording: boolean };
type ReleaseInfo = { version: string; notes?: string; downloads: { mac?: string; windows?: string } };
type UpdatePhase = 'available' | 'downloading' | 'installing' | 'error';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const primaryModifier = isMac ? 'Command' : 'Control';
const permanentPermissionIdentity = 'developer-id-795892GBHN-v3';
const activeMouseCaptures = new Set<symbol>();
let shortcutRegistrationGeneration = 0;

function shortcutButton(shortcut: string) {
  return shortcut.split(':')[0];
}

function assignShortcut(current: Preferences, key: ShortcutKey, value: string): Preferences {
  const other: ShortcutKey = key === 'pushToTalk' ? 'toggle' : 'pushToTalk';
  const next = { ...current, [key]: value };
  if (shortcutButton(current[other]) === shortcutButton(value)) next[other] = defaults[other];
  return next;
}

const defaults: Preferences = {
  pushToTalk: `${primaryModifier}+Shift+Space`,
  toggle: `${primaryModifier}+Shift+Enter`,
  launchAtLogin: true,
  autoPaste: true,
  removeFillers: true
};

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return initial; }
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue] as const;
}

function Logo({ small = false }: { small?: boolean }) {
  return <img className={small ? 'logo small' : 'logo'} src="/yapflow-mark.svg" alt="" />;
}

function SoundWave() {
  return <span className="sound-wave" aria-label="Listening"><i/><i/><i/><i/><i/></span>;
}

function MeetingLogo({ provider }: { provider: 'zoom' | 'meet' }) {
  return <img className={`meeting-logo ${provider === 'zoom' ? 'zoom-logo' : 'meet-logo'}`} src={provider === 'zoom' ? '/provider-logos/zoom.webp' : '/provider-logos/google-meet.webp'} alt={provider === 'zoom' ? 'Zoom' : 'Google Meet'} />;
}

function Notch() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [meetingContext, setMeetingContext] = useState<AppContext | null>(null);
  const [message, setMessage] = useState('YapFlow is ready');
  const [transcript, setTranscript] = useState<DictationResult | null>(null);
  const [meetingError, setMeetingError] = useState('');
  const [dismissedMeeting, setDismissedMeeting] = useState<string | null>(null);
  const meetingKey = meetingContext ? `${meetingContext.meeting_provider || ''}:${meetingContext.meeting_title || meetingContext.title}` : '';
  const meeting = Boolean(meetingContext?.meeting_detected && meetingKey !== dismissedMeeting);
  const meetingProvider: 'zoom' | 'meet' = meetingContext?.meeting_provider || (`${meetingContext?.app_name || ''} ${meetingContext?.title || ''}`.toLowerCase().includes('zoom') ? 'zoom' : 'meet');

  useEffect(() => {
    if (!isTauri()) return;
    // Re-dock after the webview has its final native size. macOS may apply the
    // configured frame once more while the window is being created.
    void invoke('dock_notch');
    const cleanups: Array<() => void> = [];
    void Promise.all([
      listen<{ mode: Mode; message?: string }>('yapflow://state', event => {
        setMode(event.payload.mode);
        if (event.payload.mode === 'recording') setTranscript(null);
        setMessage(event.payload.message || (event.payload.mode === 'recording' ? 'Listening…' : 'YapFlow is ready'));
      }),
      listen<AppContext>('yapflow://meeting-detected', event => {
        setMeetingContext(event.payload.meeting_detected ? event.payload : null);
        if (!event.payload.meeting_detected) setDismissedMeeting(null);
      }),
      listen<DictationResult>('yapflow://transcript', event => {
        if (!event.payload.pasted) setTranscript(event.payload);
      })
    ]).then(values => cleanups.push(...values));
    return () => cleanups.forEach(fn => fn());
  }, []);

  useEffect(() => {
    if (!isTauri() || !shellRef.current) return;
    const shell = shellRef.current;
    let lastHeight = 0;
    let frame = 0;
    const syncNativeFrame = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.ceil(shell.getBoundingClientRect().height);
        if (height === lastHeight) return;
        lastHeight = height;
        void invoke('resize_notch', { height });
      });
    };
    const observer = new ResizeObserver(syncNativeFrame);
    observer.observe(shell);
    syncNativeFrame();
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, []);

  return (
    <div ref={shellRef} className={`notch-shell ${mode} ${meeting ? 'meeting-found' : ''}`}>
      <div className="notch-cap">
        <div className="notch-wing notch-wing-left">
          <Logo small />
          {mode !== 'idle' && <span className="live-dot" />}
        </div>
        <div className="notch-hardware" aria-hidden="true" />
        <div className="notch-wing notch-wing-right">
          {mode === 'recording' && <SoundWave />}
          {mode === 'processing' && <span className="spinner" />}
          {mode === 'meeting' && <button className="notch-stop" aria-label="Stop meeting recording" onClick={() => void invoke('stop_meeting').catch(error => setMessage(String(error)))}><CircleStop /></button>}
        </div>
      </div>
      {mode === 'idle' && transcript ? <div className="transcript-status">
        <div><strong>Transcript</strong><p>{transcript.formatted_text}</p></div>
        <button onClick={() => { void invoke('copy_text', { text: transcript.formatted_text }); setTranscript(null); }}>Copy</button>
      </div> : (mode !== 'idle' || meeting) && <div className={`notch-status ${mode === 'idle' && meeting ? 'meeting-status' : ''}`}>
        {mode === 'idle' && meeting
          ? <><MeetingLogo provider={meetingProvider}/><span title={meetingError}>{meetingError || 'Meeting detected'}</span><button onClick={() => { setMeetingError(''); void invoke('start_meeting').catch(error => setMeetingError(String(error))); }}>Start Recording</button><button className="meeting-dismiss" aria-label="Dismiss meeting" onClick={() => setDismissedMeeting(meetingKey)}><X/></button></>
          : <span>{message}</span>}
      </div>}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>('home');
  const [mode, setMode] = useState<Mode>('idle');
  const [context, setContext] = useState<AppContext>({ app_name: 'Desktop', title: '', profile: 'Natural', meeting_detected: false });
  const [status, setStatus] = useState('Ready when you are');
  const [modelReady, setModelReady] = useState(() => localStorage.getItem('yapflow:model-ready') === 'true');
  const [downloading, setDownloading] = useState(false);
  const [history, setHistory] = useStoredState<HistoryItem[]>('yapflow:speech-history', []);
  const [meetingHistory, setMeetingHistory] = useStoredState<MeetingHistoryRecord[]>('yapflow:meeting-history', []);
  const [vocabulary, setVocabulary] = useStoredState<string[]>('yapflow:vocabulary', ['YapFlow', 'Supabase']);
  const [installedLanguages, setInstalledLanguages] = useStoredState<string[]>('yapflow:languages', ['en']);
  const [preferences, setPreferences] = useStoredState<Preferences>('yapflow:preferences', defaults);
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('yapflow:setup-complete') === 'true');
  const [permissionRecoveryRequired, setPermissionRecoveryRequired] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseInfo | null>(null);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('available');
  const [updateError, setUpdateError] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [showSupport, setShowSupport] = useState(false);
  const [supportCopied, setSupportCopied] = useState(false);
  const modeRef = useRef<Mode>('idle');
  const startPendingRef = useRef<Promise<void> | null>(null);
  const stopAfterStartRef = useRef(false);
  const finishDictationRef = useRef<() => Promise<void>>(async () => undefined);
  const mousePressedAt = useRef<Record<string, number>>({});
  const mouseLastClick = useRef<Record<string, number>>({});
  const preferencesRef = useRef(preferences);
  const permissionMigrationRunning = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => {
    if (isTauri()) void invoke('remove_legacy_agent_models').catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;
    void listen<MeetingRecording>('yapflow://meeting-recorded', event => {
      setMeetingHistory(current => mergeMeetingRecordings(current, [event.payload]));
    }).then(unlisten => {
      if (disposed) unlisten(); else cleanup = unlisten;
    });
    void invoke<MeetingRecording[]>('list_meeting_recordings').then(recordings => {
      if (!disposed) setMeetingHistory(current => mergeMeetingRecordings(current, recordings));
    }).catch(() => undefined);
    return () => { disposed = true; cleanup?.(); };
  }, [setMeetingHistory]);
  const appReady = onboardingComplete && !permissionRecoveryRequired && modelReady;
  useEffect(() => {
    if (isTauri()) void invoke('set_setup_complete', { complete: appReady });
  }, [appReady]);
  useEffect(() => {
    if (!isTauri() || !onboardingComplete) return;
    let disposed = false;
    const verify = () => void invoke<PermissionResult>('native_permission_status').then(result => {
      if (disposed) return;
      const missing = isMac
        ? !result.microphone || !result.accessibility || !result.input_monitoring || !result.screen_recording
        : result.microphone === false;
      setPermissionRecoveryRequired(missing);
      if (isMac && missing && !permissionMigrationRunning.current && localStorage.getItem('yapflow:permission-identity') !== permanentPermissionIdentity) {
        permissionMigrationRunning.current = true;
        const permissions: PermissionId[] = [];
        if (!result.microphone) permissions.push('microphone');
        if (!result.accessibility) permissions.push('accessibility');
        if (!result.input_monitoring) permissions.push('input_monitoring');
        if (!result.screen_recording) permissions.push('screen_recording');
        void invoke('reset_stale_permissions', { permissions }).then(() => {
          localStorage.setItem('yapflow:permission-identity', permanentPermissionIdentity);
          return invoke('restart_for_permissions');
        }).catch(error => {
          permissionMigrationRunning.current = false;
          setStatus(`Could not repair stale macOS permissions: ${String(error)}`);
        });
      }
    }).catch(() => undefined);
    verify();
    const timer = window.setInterval(verify, 1500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [onboardingComplete]);
  useEffect(() => {
    setPreferences(current => {
      const pushToTalk = current.pushToTalk.replace('CommandOrControl', primaryModifier);
      let toggle = current.toggle.replace('CommandOrControl', primaryModifier);
      if (toggle === `${primaryModifier}+Shift+D`) toggle = `${primaryModifier}+Shift+Enter`;
      return pushToTalk === current.pushToTalk && toggle === current.toggle ? current : { ...current, pushToTalk, toggle };
    });
  }, [setPreferences]);

  const finishDictation = useCallback(async () => {
    if (startPendingRef.current) {
      stopAfterStartRef.current = true;
      return;
    }
    if (!isTauri() || modeRef.current !== 'recording') return;
    modeRef.current = 'processing'; setMode('processing'); setStatus('Polishing your words…');
    try {
      const result = await invoke<DictationResult>('stop_dictation', { vocabulary, installedLanguages, autoPaste: preferences.autoPaste, removeFillers: preferences.removeFillers });
      setHistory(items => [{ ...result, id: Date.now(), created_at: new Date().toISOString() }, ...items].slice(0, 250));
      setStatus(`Written in ${result.app_name || 'your app'}`);
    } catch (error) {
      setStatus(String(error));
    } finally { modeRef.current = 'idle'; setMode('idle'); }
  }, [installedLanguages, preferences.autoPaste, preferences.removeFillers, setHistory, vocabulary]);
  useEffect(() => { finishDictationRef.current = finishDictation; }, [finishDictation]);

  const startDictation = useCallback(async () => {
    if (!isTauri() || modeRef.current !== 'idle' || startPendingRef.current) return;
    stopAfterStartRef.current = false;
    const pending = invoke('start_dictation') as Promise<void>;
    startPendingRef.current = pending;
    let started = false;
    try {
      await pending;
      modeRef.current = 'recording'; setMode('recording'); setStatus('Listening…');
      started = true;
    } catch (error) { setStatus(String(error)); }
    finally { startPendingRef.current = null; }
    if (started && stopAfterStartRef.current) {
      stopAfterStartRef.current = false;
      await finishDictationRef.current();
    }
  }, []);

  const toggleDictation = useCallback(() => {
    if (startPendingRef.current) {
      stopAfterStartRef.current = true;
      return;
    }
    if (modeRef.current === 'recording') void finishDictation(); else void startDictation();
  }, [finishDictation, startDictation]);

  useEffect(() => {
    if (!isTauri()) return;
    const refreshModel = () => void invoke<boolean>('model_ready').then(ready => {
      setModelReady(ready);
      if (ready) localStorage.setItem('yapflow:model-ready', 'true');
      else localStorage.removeItem('yapflow:model-ready');
    }).catch(() => undefined);
    refreshModel();
    const modelTimer = window.setTimeout(refreshModel, 500);
    return () => { window.clearTimeout(modelTimer); };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let stopped = false;
    let checking = false;
    let lastCheckStartedAt = 0;
    const checkForUpdate = async (force = false) => {
      const now = Date.now();
      if (checking || (!force && now - lastCheckStartedAt < 10_000)) return;
      checking = true;
      lastCheckStartedAt = now;
      try {
        const installed = await getVersion();
        let release: ReleaseInfo | null = null;

        // Prefer the signed native updater feed. The public metadata endpoint is
        // retained as a failover so a temporary problem on either route cannot
        // make an available release invisible.
        try {
          const nativeUpdate = await check({ timeout: 30_000 });
          if (nativeUpdate) {
            release = {
              version: nativeUpdate.version,
              notes: typeof nativeUpdate.body === 'string' ? nativeUpdate.body : undefined,
              downloads: {}
            };
          }
        } catch { /* Try the public metadata endpoints below. */ }

        if (!release) {
          for (const endpoint of [
            'https://yapflow.app/api/releases/latest',
            'https://yapflow-production.up.railway.app/api/releases/latest'
          ]) {
            try {
              const response = await fetch(endpoint, { cache: 'no-store' });
              if (!response.ok) continue;
              release = await response.json() as ReleaseInfo;
              break;
            } catch { /* Continue to the next endpoint. */ }
          }
        }

        if (!stopped && release) {
          const newer = isNewerVersion(release.version, installed);
          setAvailableUpdate(newer ? release : null);
          if (newer) setUpdatePhase('available');
        }
      } finally {
        checking = false;
      }
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };

    void checkForUpdate(true);
    const timer = window.setInterval(() => void checkForUpdate(true), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', checkWhenVisible);
    window.addEventListener('focus', checkWhenVisible);
    const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload) void checkForUpdate();
    });
    const unlistenReopen = listen('yapflow://app-reopened', () => void checkForUpdate(true));
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkWhenVisible);
      window.removeEventListener('focus', checkWhenVisible);
      void unlistenFocus.then(unlisten => unlisten());
      void unlistenReopen.then(unlisten => unlisten());
    };
  }, []);

  const installUpdate = async () => {
    if (!availableUpdate || updatePhase === 'downloading' || updatePhase === 'installing') return;
    setUpdateError('');
    setUpdateProgress(0);
    setUpdatePhase('downloading');
    try {
      const update = await check({ timeout: 30_000 });
      if (!update) {
        setAvailableUpdate(null);
        setUpdatePhase('available');
        return;
      }
      let received = 0;
      let total = 0;
      await update.downloadAndInstall(event => {
        if (event.event === 'Started') total = event.data.contentLength || 0;
        if (event.event === 'Progress') {
          received += event.data.chunkLength;
          if (total > 0) setUpdateProgress(Math.min(99, Math.round(received / total * 100)));
        }
        if (event.event === 'Finished') {
          setUpdateProgress(100);
          setUpdatePhase('installing');
        }
      }, { timeout: 5 * 60_000, restartAfterInstall: true });
      if (isMac) await relaunch();
    } catch (error) {
      setUpdateError(String(error));
      setUpdatePhase('error');
    }
  };

  useEffect(() => {
    if (!isTauri() || !appReady) return;
    void isAutostartEnabled().then(enabled => setPreferences(current => ({ ...current, launchAtLogin: enabled })));
    const timer = window.setInterval(() => {
      void invoke<AppContext>('get_active_context').then(next => {
        setContext(next);
        void invoke('announce_meeting', { context: next });
      }).catch(() => undefined);
    }, 2500);
    return () => { window.clearInterval(timer); };
  }, [appReady, setPreferences]);

  useEffect(() => {
    if (!isTauri() || !appReady) return;
    const generation = ++shortcutRegistrationGeneration;
    const configure = async () => {
      await unregisterAll();
      if (generation !== shortcutRegistrationGeneration) return;
      if (!preferences.pushToTalk.startsWith('Mouse')) {
        await register(preferences.pushToTalk, event => {
          if (event.state === 'Pressed') void startDictation();
          if (event.state === 'Released') void finishDictation();
        });
      }
      if (generation !== shortcutRegistrationGeneration) return;
      if (!preferences.toggle.startsWith('Mouse')) {
        await register(preferences.toggle, event => {
          if (event.state === 'Released') toggleDictation();
        });
      }
    };
    void configure().catch(error => {
      if (generation === shortcutRegistrationGeneration) setStatus(`Shortcut error: ${String(error)}`);
    });
    return () => {
      if (generation === shortcutRegistrationGeneration) {
        shortcutRegistrationGeneration += 1;
        void unregisterAll();
      }
    };
  }, [appReady, finishDictation, preferences.pushToTalk, preferences.toggle, startDictation, toggleDictation]);

  useEffect(() => {
    if (!isTauri() || !appReady) return;
    if (preferences.pushToTalk.startsWith('Mouse') || preferences.toggle.startsWith('Mouse')) {
      void invoke('enable_auxiliary_mouse_monitor');
    }
  }, [appReady, preferences.pushToTalk, preferences.toggle]);

  useEffect(() => {
    if (!isTauri() || !appReady) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;
    void listen<MouseShortcutEvent>('yapflow://mouse-shortcut', event => {
      if (activeMouseCaptures.size > 0) return;
      const { shortcut, state } = event.payload;
      const current = preferencesRef.current;
      const [pushButton] = current.pushToTalk.split(':');
      const [toggleButton, toggleGesture = 'Single'] = current.toggle.split(':');
      if (shortcut === pushButton) {
        if (state === 'pressed') void startDictation();
        if (state === 'released') void finishDictation();
        return;
      }
      if (shortcut === toggleButton) {
        if (state === 'pressed') mousePressedAt.current[shortcut] = Date.now();
        if (state === 'released') {
          if (toggleGesture === 'Double') {
            const now = Date.now();
            if (now - (mouseLastClick.current[shortcut] || 0) <= 420) { mouseLastClick.current[shortcut] = 0; toggleDictation(); }
            else mouseLastClick.current[shortcut] = now;
          } else if (toggleGesture === 'Hold') {
            if (Date.now() - (mousePressedAt.current[shortcut] || Date.now()) >= 500) toggleDictation();
          } else toggleDictation();
        }
      }
    }).then(unlisten => {
      if (disposed) unlisten(); else cleanup = unlisten;
    });
    return () => { disposed = true; cleanup?.(); };
  }, [appReady, finishDictation, startDictation, toggleDictation]);

  const nav = useMemo(() => [
    { id: 'home' as Page, label: 'Yap Flow', icon: Home },
    { id: 'meetings' as Page, label: 'Meeting history', icon: Users },
    { id: 'speech' as Page, label: 'Speech history', icon: History },
    { id: 'vocabulary' as Page, label: 'Vocabulary', icon: BookOpen },
    { id: 'languages' as Page, label: 'Languages', icon: LanguagesIcon }
  ], []);

  const downloadModel = async () => {
    if (!isTauri()) return;
    setDownloading(true); setStatus('Downloading local speech model…');
    try { await invoke('download_model'); setModelReady(true); localStorage.setItem('yapflow:model-ready', 'true'); setStatus('Local speech model is ready'); }
    catch (error) { setStatus(String(error)); }
    finally { setDownloading(false); }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" data-tauri-drag-region>
        <div className="brand"><Logo /><span>YapFlow</span></div>
        <nav>{nav.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><item.icon /><span>{item.label}</span></button>)}</nav>
        <div className="sidebar-bottom">
          <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Settings /><span>Settings</span></button>
          <button onClick={() => { setSupportCopied(false); setShowSupport(true); }}><CircleHelp /><span>Support</span></button>
          <div className="local-status"><span /> Local processing</div>
        </div>
      </aside>
      <main>
        {availableUpdate && <button className={`update-banner ${updatePhase}`} disabled={updatePhase === 'downloading' || updatePhase === 'installing'} onClick={() => void installUpdate()}>
          <RefreshCw/><span><strong>{updatePhase === 'downloading' ? `Downloading update${updateProgress ? ` · ${updateProgress}%` : '…'}` : updatePhase === 'installing' ? 'Installing and restarting…' : updatePhase === 'error' ? 'Update Could Not Install' : 'New Version Available'}</strong><small>{updatePhase === 'downloading' ? 'YapFlow will restart automatically when the download is ready.' : updatePhase === 'installing' ? 'Your settings and history will be kept.' : updatePhase === 'error' ? `${updateError} Click to try again.` : `YapFlow ${availableUpdate.version} is ready. Click to update.`}</small></span><ChevronRight/>
        </button>}
        {page === 'home' && <HomePage {...{ history, modelReady, downloading, downloadModel }} />}
        {page === 'meetings' && <MeetingHistoryPage items={meetingHistory} />}
        {page === 'speech' && <HistoryPage title="Speech history" subtitle="Everything YapFlow has written for you." items={history} empty="No speech history yet" />}
        {page === 'vocabulary' && <VocabularyPage words={vocabulary} setWords={setVocabulary} />}
        {page === 'languages' && <LanguagesPage installed={installedLanguages} setInstalled={setInstalledLanguages} />}
        {page === 'settings' && <SettingsPage preferences={preferences} setPreferences={setPreferences} context={context} modelReady={modelReady} downloadModel={downloadModel} />}
      </main>
      {showSupport && <div className="update-overlay" role="dialog" aria-modal="true" aria-labelledby="support-title" onMouseDown={event => { if (event.target === event.currentTarget) setShowSupport(false); }}>
        <section className="update-modal support-modal">
          <button className="update-modal-close" aria-label="Close support" onClick={() => setShowSupport(false)}><X/></button>
          <CircleHelp className="support-icon"/>
          <span className="kicker">YAPFLOW SUPPORT</span>
          <h2 id="support-title">How can we help?</h2>
          <p>For support, please email <strong>contact@thementorprogram.xyz</strong></p>
          <div className="update-modal-actions"><button className="primary" onClick={() => {
            const email = 'contact@thementorprogram.xyz';
            const copy = isTauri() ? invoke('copy_text', { text: email }) : navigator.clipboard.writeText(email);
            void copy.then(() => setSupportCopied(true));
          }}><Copy/>{supportCopied ? 'Email copied' : 'Copy email'}</button></div>
        </section>
      </div>}
      {(!onboardingComplete || permissionRecoveryRequired || !modelReady) && <SetupWizard recovery={permissionRecoveryRequired} existing={onboardingComplete} preferences={preferences} setPreferences={setPreferences} modelReady={modelReady} downloading={downloading} downloadModel={downloadModel} onComplete={() => {
        localStorage.setItem('yapflow:setup-complete', 'true');
        setOnboardingComplete(true);
        setPermissionRecoveryRequired(false);
      }}/>} 
    </div>
  );
}

type HomeProps = {
  history: HistoryItem[]; modelReady: boolean; downloading: boolean; downloadModel: () => Promise<void>;
};

function HomePage(props: HomeProps) {
  const stats = useMemo(() => dashboardStats(props.history), [props.history]);
  const categoryIcons: Record<UsageCategory, typeof Code2> = { Coding: Code2, Meetings: Video, Messaging: MessageCircle, Email: Mail, Documents: FileText, AI: Bot };
  const useCases = (Object.keys(categoryIcons) as UsageCategory[]).map(title => ({ icon: categoryIcons[title], title, percentage: stats.percentages[title] }));
  return <div className="home-page">
    <header><span className="kicker">YOUR YAPFLOW</span><h1>Speak freely, <em>write clearly.</em></h1><p>Your voice activity and the places where YapFlow helps you most.</p></header>
    {!props.modelReady && <div className="setup-card"><div><Download /><div><strong>One small setup</strong><p>Download the local speech model to start dictating privately.</p></div></div><button disabled={props.downloading} onClick={props.downloadModel}>{props.downloading ? 'Downloading…' : 'Download model'}</button></div>}
    <section className="analytics-grid">
      <article className="metric-card"><div><Gauge/><span>Words per minute</span></div><strong>{stats.wordsPerMinute ?? '—'}</strong><small>{stats.wordsPerMinute === null ? 'Available after your first session' : '30-day speaking average'}</small></article>
      <article className="metric-card"><div><Hash/><span>Words spoken</span></div><strong>{stats.wordsSpoken.toLocaleString()}</strong><small>Dictated in the last 30 days</small></article>
      <article className="metric-card usage-card">
        <div className="usage-heading"><span>Where you use YapFlow</span></div>
        <div className="usage-list">{useCases.map(({ icon: Icon, title, percentage }) => <div className="usage-row" key={title}>
          <Icon/>
          <div className="usage-detail"><span>{title}</span><i><b style={{ width: `${percentage}%` }}/></i></div>
          <strong>{percentage}%</strong>
        </div>)}</div>
      </article>
    </section>
    <section className="app-history-panel speech-home-panel">
      <div className="app-history-heading"><div><span className="kicker">SPEECH HISTORY</span><h2>Everything you’ve said</h2></div><span className="tracking-soon">{props.history.length.toLocaleString()} entries</span></div>
      {props.history.length > 0 ? <div className="home-speech-list">{props.history.map(item => <article key={item.id}><div><small>{new Date(item.created_at).toLocaleString()} · {item.app_name}</small><p>{item.formatted_text}</p></div><button aria-label="Copy transcript" title="Copy" onClick={() => void invoke('copy_text', { text: item.formatted_text })}><Copy/></button></article>)}</div> : <div className="app-history-empty"><History/><div><strong>No speech history yet</strong><p>Your completed dictations will appear here.</p></div></div>}
    </section>
  </div>;
}

function HistoryPage({ title, subtitle, items, empty }: { title: string; subtitle: string; items: HistoryItem[]; empty: string }) {
  return <div className="page"><header><span className="kicker">LIBRARY</span><h2>{title}</h2><p>{subtitle}</p></header>{items.length === 0 ? <div className="empty-state"><Radio/><strong>{empty}</strong><p>New recordings will appear here and stay on this device.</p></div> : <div className="history-list">{items.map(item => <article key={item.id}><div><small>{new Date(item.created_at).toLocaleString()} · {item.app_name}</small><p>{item.formatted_text}</p></div><ChevronRight/></article>)}</div>}</div>;
}

function MeetingHistoryPage({ items }: { items: MeetingHistoryRecord[] }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const selected = findMeetingRecord(items, selectedPath);

  if (selected) {
    const date = new Date(selected.created_at);
    const durationSeconds = Math.max(0, Math.round(selected.duration_ms / 1_000));
    const duration = durationSeconds >= 60
      ? `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`
      : `${durationSeconds}s`;
    return <div className="page meeting-detail-page">
      <button className="meeting-back" onClick={() => { setSelectedPath(null); setActionError(''); }}><ArrowLeft/>Meeting history</button>
      <header><span className="kicker">LOCAL RECORDING</span><h2>{selected.app_name} meeting</h2><p>{date.toLocaleString()} · {duration}</p></header>
      <section className="meeting-detail-card">
        <div className="meeting-detail-icon">{selected.app_name.toLowerCase().includes('zoom')
          ? <MeetingLogo provider="zoom"/>
          : selected.app_name.toLowerCase().includes('meet')
            ? <MeetingLogo provider="meet"/>
            : <Radio/>}</div>
        <div><small>RECORDING</small><strong>{selected.formatted_text}</strong><span>Microphone and system audio · stored only on this device</span></div>
      </section>
      <section className="meeting-detail-actions">
        <button onClick={() => { setActionError(''); void openPath(selected.path).catch(error => setActionError(String(error))); }}><Play/>Play recording</button>
        <button onClick={() => { setActionError(''); void revealItemInDir(selected.path).catch(error => setActionError(String(error))); }}><FolderOpen/>Show in folder</button>
      </section>
      {actionError && <p className="meeting-action-error" role="alert">{actionError}</p>}
      <section className="meeting-transcript-card"><span className="kicker">TRANSCRIPT</span><p>{selected.raw_text || 'This recording does not have a saved transcript.'}</p></section>
    </div>;
  }

  return <div className="page"><header><span className="kicker">LIBRARY</span><h2>Meeting history</h2><p>Your local Zoom and Google Meet recordings.</p></header>{items.length === 0 ? <div className="empty-state"><Radio/><strong>No meetings recorded yet</strong><p>New recordings will appear here and stay on this device.</p></div> : <div className="history-list meeting-history-list">{items.map(item => <button type="button" key={item.path || item.id} onClick={() => setSelectedPath(item.path)}><div><small>{new Date(item.created_at).toLocaleString()} · {item.app_name}</small><p>{item.formatted_text}</p></div><ChevronRight/></button>)}</div>}</div>;
}

function VocabularyPage({ words, setWords }: { words: string[]; setWords: React.Dispatch<React.SetStateAction<string[]>> }) {
  const [draft, setDraft] = useState('');
  const add = (event: React.FormEvent) => { event.preventDefault(); const word = draft.trim(); if (word && !words.some(value => value.toLowerCase() === word.toLowerCase())) setWords(current => [word, ...current]); setDraft(''); };
  return <div className="page"><header><span className="kicker">PERSONAL DICTIONARY</span><h2>Vocabulary</h2><p>Add names and terms exactly as they should be written. YapFlow uses them during decoding and performs a final phonetic correction.</p></header><form className="word-form" onSubmit={add}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Supabase, PostgreSQL, a person’s name…"/><button>Add word</button></form><div className="word-list">{words.map(word => <span key={word}>{word}<button aria-label={`Remove ${word}`} onClick={() => setWords(current => current.filter(value => value !== word))}><X/></button></span>)}</div></div>;
}

function LanguagesPage({ installed, setInstalled }: { installed: string[]; setInstalled: React.Dispatch<React.SetStateAction<string[]>> }) {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<LanguageOption[]>('supported_languages').then(setLanguages).catch(() => setLanguages([]));
  }, []);
  const filtered = languages.filter(language => `${language.name} ${language.code}`.toLowerCase().includes(query.trim().toLowerCase()));
  const displayName = (name: string) => name.replace(/\b\w/g, character => character.toUpperCase());
  return <div className="page languages-page">
    <header><span className="kicker">MULTILINGUAL DICTATION</span><h2>Languages</h2><p>Install the languages you use. YapFlow automatically identifies which installed language you are speaking and writes in that language.</p></header>
    <div className="language-toolbar"><label><Search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search languages…" /></label><span><LanguagesIcon/>Automatic detection</span></div>
    <div className="language-note"><strong>One private multilingual model</strong><span>Language installs are instant—the shared local model already contains every language below.</span></div>
    <div className="language-grid">{filtered.map(language => {
      const isEnglish = language.code === 'en';
      const isInstalled = isEnglish || installed.includes(language.code);
      return <article key={language.code}><div className="language-code">{language.code.toUpperCase()}</div><div><strong>{displayName(language.name)}</strong><small>{isInstalled ? 'Available for automatic detection' : 'Available to install'}</small></div><button disabled={isInstalled} onClick={() => setInstalled(current => current.includes(language.code) ? current : [...current, language.code])}>{isEnglish ? 'Built in' : isInstalled ? 'Installed' : 'Install'}</button></article>;
    })}</div>
    {filtered.length === 0 && <div className="language-empty">No languages match “{query}”.</div>}
  </div>;
}

type ShortcutKey = 'pushToTalk' | 'toggle';

function shortcutFromEvent(event: KeyboardEvent): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return null;
  const modifiers = [event.metaKey && 'Command', event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean) as string[];
  let key = event.code;
  if (key.startsWith('Key')) key = key.slice(3);
  else if (key.startsWith('Digit')) key = key.slice(5);
  else if (key === 'Period') key = 'Period';
  else if (key === 'Comma') key = 'Comma';
  else if (key === 'Slash') key = 'Slash';
  else if (key === 'Backslash') key = 'Backslash';
  else if (key === 'Semicolon') key = 'Semicolon';
  else if (key === 'Quote') key = 'Quote';
  else if (key === 'Backquote') key = 'Backquote';
  else if (key === 'Equal') key = 'Equal';
  else if (key === 'Minus') key = 'Minus';
  if (!key) return null;
  return [...modifiers, key].join('+');
}

function shortcutParts(shortcut: string) {
  const mouse = shortcut.match(/^Mouse(\d+)(?::(Double|Hold))?$/);
  if (mouse) return [`Mouse ${mouse[1]}${mouse[2] ? ` · ${mouse[2]}` : ''}`];
  return shortcut.replace('CommandOrControl', primaryModifier).split('+').map(part => part === 'Period' ? '.' : part);
}

function ShortcutSetting({ icon: Icon, title, description, value, capturing, onConfigure, onChange }: { icon: typeof Keyboard; title: string; description: string; value: string; capturing: boolean; onConfigure: () => void; onChange: (value: string) => void }) {
  const captureToken = useRef(Symbol('mouse-shortcut-capture'));
  const mouseDown = useRef<{ shortcut: string; at: number } | null>(null);
  const pendingClick = useRef<{ shortcut: string; timer: number } | null>(null);
  useEffect(() => {
    if (!capturing) return;
    activeMouseCaptures.add(captureToken.current);
    let nativeCleanup: (() => void) | undefined;
    let disposed = false;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { onConfigure(); return; }
      const shortcut = shortcutFromEvent(event);
      if (shortcut) onChange(shortcut);
    };
    const beginMouse = (shortcut: string) => {
      mouseDown.current = { shortcut, at: Date.now() };
    };
    const finishMouse = (shortcut: string) => {
      if (mouseDown.current?.shortcut !== shortcut) return;
      const heldFor = Date.now() - mouseDown.current.at;
      mouseDown.current = null;
      if (heldFor >= 500) {
        if (pendingClick.current) window.clearTimeout(pendingClick.current.timer);
        pendingClick.current = null;
        onChange(`${shortcut}:Hold`);
        return;
      }
      if (pendingClick.current?.shortcut === shortcut) {
        window.clearTimeout(pendingClick.current.timer);
        pendingClick.current = null;
        onChange(`${shortcut}:Double`);
        return;
      }
      const timer = window.setTimeout(() => { pendingClick.current = null; onChange(shortcut); }, 360);
      pendingClick.current = { shortcut, timer };
    };
    const captureMouse = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      beginMouse(`Mouse${event.button + 1}`);
    };
    const finishDomMouse = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      finishMouse(`Mouse${event.button + 1}`);
    };
    const suppressMouseAction = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', capture, true);
    // DOM capture works immediately for every mouse button while the pointer is
    // inside YapFlow. The native monitor adds buttons pressed anywhere else.
    window.addEventListener('mousedown', captureMouse, true);
    window.addEventListener('mouseup', finishDomMouse, true);
    window.addEventListener('auxclick', suppressMouseAction, true);
    window.addEventListener('contextmenu', suppressMouseAction, true);
    if (isTauri()) {
      void listen<MouseShortcutEvent>('yapflow://mouse-shortcut', event => {
        if (event.payload.state === 'pressed') beginMouse(event.payload.shortcut);
        else finishMouse(event.payload.shortcut);
      }).then(unlisten => {
        if (disposed) unlisten(); else nativeCleanup = unlisten;
      });
      void invoke<boolean>('enable_auxiliary_mouse_monitor');
    }
    return () => {
      disposed = true;
      activeMouseCaptures.delete(captureToken.current);
      nativeCleanup?.();
      if (pendingClick.current) window.clearTimeout(pendingClick.current.timer);
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('mousedown', captureMouse, true);
      window.removeEventListener('mouseup', finishDomMouse, true);
      window.removeEventListener('auxclick', suppressMouseAction, true);
      window.removeEventListener('contextmenu', suppressMouseAction, true);
    };
  }, [capturing, onChange, onConfigure]);

  return <div className={`shortcut-setting ${capturing ? 'capturing' : ''}`}>
    <div className="setting-description"><Icon/><span><strong>{title}</strong><small>{description}</small></span></div>
    <div className="shortcut-controls">
      <div className="keycaps" aria-label={capturing ? 'Click your shortcut' : value}>
        {capturing ? <kbd className="capture-prompt">Click your shortcut</kbd> : shortcutParts(value).map((part, index) => <kbd key={`${part}-${index}`}>{part}</kbd>)}
      </div>
      <button type="button" onClick={onConfigure}>{capturing ? 'Cancel' : 'Configure'}</button>
    </div>
  </div>;
}

function SetupWizard({ recovery = false, existing = false, preferences, setPreferences, modelReady, downloading, downloadModel, onComplete }: { recovery?: boolean; existing?: boolean; preferences: Preferences; setPreferences: React.Dispatch<React.SetStateAction<Preferences>>; modelReady: boolean; downloading: boolean; downloadModel: () => Promise<void>; onComplete: () => void }) {
  const permissionOrder = useMemo<PermissionId[]>(() => isMac
    ? ['microphone', 'accessibility', 'input_monitoring', 'screen_recording']
    : ['microphone'], []);
  const permissionLabels: Record<PermissionId, string> = {
    microphone: 'Microphone', accessibility: 'Accessibility', input_monitoring: 'Input Monitoring', screen_recording: 'Screen & System Audio Recording'
  };
  const [permissionView, setPermissionView] = useState<PermissionView>({ permissions: null, current: null, started: false, error: '' });
  const permissionController = useRef<PermissionFlow | null>(null);
  const [shortcutsDone, setShortcutsDone] = useState(recovery || existing);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [capturing, setCapturing] = useState<ShortcutKey | null>(null);

  useEffect(() => {
    let browserMicrophone = false;
    const read = async (): Promise<PermissionState> => {
      if (!isTauri()) throw new Error('Open the installed YapFlow app to set up system permissions.');
      const native = await invoke<PermissionResult>('native_permission_status');
      // macOS always uses AVFoundation. Browser-origin permission and device
      // labels are not evidence of the native application's microphone grant.
      if (native.microphone !== null) return { microphone: native.microphone, accessibility: native.accessibility, input_monitoring: native.input_monitoring, screen_recording: native.screen_recording };
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        browserMicrophone = status.state === 'granted';
      } catch { /* Some webviews only report the result of getUserMedia. */ }
      return { microphone: browserMicrophone, accessibility: native.accessibility, input_monitoring: native.input_monitoring, screen_recording: native.screen_recording };
    };
    const request = async (permission: PermissionId) => {
      if (isMac || permission !== 'microphone') {
        await invoke('request_native_permission', { permission });
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        browserMicrophone = true;
        stream.getTracks().forEach(track => track.stop());
      }
    };
    const controller = new PermissionFlow(permissionOrder, read, request, setPermissionView);
    permissionController.current = controller;
    const refresh = () => { void controller.refresh(); };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const unlisten = isTauri() ? getCurrentWindow().onFocusChanged(({ payload }) => { if (payload) refresh(); }) : Promise.resolve(() => {});
    return () => {
      controller.stop(); window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      void unlisten.then(fn => fn());
    };
  }, [permissionOrder]);

  const permissionsDone = Boolean(permissionView.permissions && permissionOrder.every(id => permissionView.permissions![id]));
  const currentPermission = permissionView.current;
  const grantedCount = permissionOrder.filter(id => permissionView.permissions?.[id]).length;
  const permissionMessage = permissionView.error || (!permissionView.permissions ? 'Checking macOS permissions…' : permissionsDone
    ? `All ${permissionOrder.length} permissions verified · ready`
    : `${grantedCount} of ${permissionOrder.length} enabled${currentPermission ? ` · Enable ${permissionLabels[currentPermission]} in System Settings` : ''}`);

  const saveShortcut = (key: ShortcutKey, value: string) => {
    setPreferences(current => assignShortcut(current, key, value));
    setCapturing(null);
  };
  const ready = permissionsDone && modelReady && shortcutsDone;

  return <div className="setup-overlay"><section className="setup-modal">
    <Logo/>
    <span className="kicker">{recovery ? 'SECURE UPDATE' : 'WELCOME TO YAPFLOW'}</span>
    <h2>{recovery ? 'Renew system access once' : 'Complete the setup'}</h2>
    <p className="setup-intro">{recovery ? 'YapFlow is now Apple-signed. macOS keeps your private history but requires one fresh approval for the permanent app identity. Future updates will retain it.' : existing ? 'Confirm your local speech model and shortcuts to keep YapFlow ready.' : 'Three quick steps, then YapFlow will stay ready in your notch.'}</p>
    <div className={`setup-step ${permissionsDone ? 'done' : ''}`}><span className="step-number">1</span><div><strong>Enable permissions</strong><p>Allow YapFlow to hear you, capture meeting system audio, insert text, and recognize your shortcuts.</p><small role="status">{permissionMessage}</small></div><button disabled={permissionsDone} onClick={() => void permissionController.current?.next()}>{permissionsDone ? 'Done' : permissionView.started ? 'Next Disabled Permission' : 'Set Up'}</button></div>
    <div className="permission-checklist">{permissionOrder.map(id => <div key={id}><span>{permissionLabels[id]}</span><strong className={permissionView.permissions?.[id] ? 'granted' : ''}>{!permissionView.permissions ? 'Checking…' : permissionView.permissions[id] ? 'Enabled' : 'Not enabled'}</strong></div>)}{permissionView.started && !permissionsDone && <p>Already switched on? <button onClick={() => void permissionController.current?.refresh()}>Check again</button> or <button onClick={() => void invoke('restart_for_permissions')}>Restart YapFlow</button> to refresh macOS access.</p>}</div>
    <div className={`setup-step ${modelReady ? 'done' : ''}`}><span className="step-number">2</span><div><strong>Install local transcription</strong><p>Download the private speech model used to turn your voice into text on this device.</p></div><button disabled={downloading || modelReady} onClick={() => void downloadModel()}>{modelReady ? 'Installed' : downloading ? 'Installing…' : 'Install'}</button></div>
    <div className={`setup-step shortcut-step ${shortcutsDone ? 'done' : ''}`}><span className="step-number">3</span><div><strong>Configure shortcuts</strong><p>Choose keyboard keys or auxiliary mouse buttons for push-to-talk and hands-free dictation.</p></div><button onClick={() => setShowShortcuts(value => !value)}>{shortcutsDone ? 'Edit' : showShortcuts ? 'Hide' : 'Configure'}</button></div>
    {showShortcuts && <div className="setup-shortcuts"><ShortcutSetting icon={Keyboard} title="Push to talk" description="Hold, speak, release" value={preferences.pushToTalk} capturing={capturing === 'pushToTalk'} onConfigure={() => setCapturing(current => current === 'pushToTalk' ? null : 'pushToTalk')} onChange={value => saveShortcut('pushToTalk', value)}/><ShortcutSetting icon={Radio} title="Hands-free" description="Tap once to start and again to stop" value={preferences.toggle} capturing={capturing === 'toggle'} onConfigure={() => setCapturing(current => current === 'toggle' ? null : 'toggle')} onChange={value => saveShortcut('toggle', value)}/><button className="save-shortcuts" onClick={() => { setShortcutsDone(true); setShowShortcuts(false); }}>Use these shortcuts</button></div>}
    <button className="finish-setup" disabled={!ready} onClick={onComplete}>Open YapFlow</button>
  </section></div>;
}

function SettingsPage({ preferences, setPreferences, context, modelReady, downloadModel }: { preferences: Preferences; setPreferences: React.Dispatch<React.SetStateAction<Preferences>>; context: AppContext; modelReady: boolean; downloadModel: () => Promise<void> }) {
  const [capturing, setCapturing] = useState<ShortcutKey | null>(null);
  const [systemPermissions, setSystemPermissions] = useState<PermissionResult | null>(null);
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences(current => ({ ...current, [key]: value }));
  const saveShortcut = useCallback((key: ShortcutKey, value: string) => {
    setPreferences(current => assignShortcut(current, key, value));
    setCapturing(null);
  }, [setPreferences]);
  const setAutostart = (value: boolean) => {
    if (!isTauri()) { update('launchAtLogin', value); return; }
    void (value ? enableAutostart() : disableAutostart()).then(() => update('launchAtLogin', value));
  };
  useEffect(() => {
    if (!isTauri()) return;
    const refresh = () => void invoke<PermissionResult>('native_permission_status').then(setSystemPermissions).catch(() => setSystemPermissions(null));
    refresh();
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const accessRows = isMac
    ? [['Microphone', systemPermissions?.microphone], ['Accessibility', systemPermissions?.accessibility], ['Input Monitoring', systemPermissions?.input_monitoring], ['Screen & System Audio Recording', systemPermissions?.screen_recording]] as const
    : [['Microphone', systemPermissions?.microphone]] as const;
  return <div className="page"><header><span className="kicker">PREFERENCES</span><h2>Settings</h2><p>Configure how YapFlow listens, writes, and stays available.</p></header><section className="settings-group"><h3>System access <small>Read directly from {isMac ? 'macOS' : 'Windows'}</small></h3><div className="permission-settings-list">{accessRows.map(([name, enabled]) => <div key={name}><span>{name}</span><strong className={enabled ? 'granted' : ''}>{enabled === undefined || enabled === null ? 'Checking…' : enabled ? 'Enabled' : 'Not enabled'}</strong></div>)}</div></section><section className="settings-group"><h3>Shortcuts</h3><ShortcutSetting icon={Keyboard} title="Push to talk" description="Hold to speak, release to write" value={preferences.pushToTalk} capturing={capturing === 'pushToTalk'} onConfigure={() => setCapturing(current => current === 'pushToTalk' ? null : 'pushToTalk')} onChange={value => saveShortcut('pushToTalk', value)}/><ShortcutSetting icon={Radio} title="Hands-free" description="Tap once to start and again to stop" value={preferences.toggle} capturing={capturing === 'toggle'} onConfigure={() => setCapturing(current => current === 'toggle' ? null : 'toggle')} onChange={value => saveShortcut('toggle', value)}/></section><section className="settings-group"><h3>Writing</h3><Toggle title="Paste automatically" description="Insert the finished text into the active app." checked={preferences.autoPaste} onChange={value => update('autoPaste', value)}/><Toggle title="Remove filler words" description="Remove ums, uhs, false starts, and repeated words." checked={preferences.removeFillers} onChange={value => update('removeFillers', value)}/></section><section className="settings-group"><h3>Local model</h3><div className="model-row"><div><Download/><span><strong>Local speech model</strong><small>{modelReady ? 'Installed and ready' : 'Required for transcription'}</small></span></div>{!modelReady && <button onClick={downloadModel}>Download</button>}</div></section><section className="settings-group"><h3>System</h3><Toggle title="Launch at login" description="Keep YapFlow ready from the moment you sign in." checked={preferences.launchAtLogin} onChange={setAutostart}/></section><div className="context-debug"><small>CURRENT CONTEXT</small><strong>{context.app_name}</strong><span>{context.title || 'No window title available'}</span><em>{context.profile} formatting</em></div></div>;
}

function Toggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><div><span><strong>{title}</strong><small>{description}</small></span></div><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/><i /></label>;
}

async function boot() {
  let notch = false;
  if (isTauri()) notch = getCurrentWindow().label === 'notch';
  if (notch) document.documentElement.classList.add('notch-document');
  if (!isTauri()) document.documentElement.classList.add('marketing-document');
  createRoot(document.getElementById('root')!).render(<React.StrictMode>{!isTauri() ? <MarketingSite/> : notch ? <Notch/> : <App/>}</React.StrictMode>);
}

void boot();
