import { useEffect, useState } from 'react';
import logoUrl from './assets/logo.svg';

type Device = { idx: number; name: string };
type CamShape = 'rectangle' | 'square' | 'circle';
type CamCorner = 'tl' | 'tr' | 'bl' | 'br';
type Settings = {
  destination: string | null;
  audioIdx: number | null;
  airpods: boolean;
  audioOffsetMs: number;
  saveScreenOnly: boolean;
  saveCameraOnly: boolean;
  saveLog: boolean;
  camShape: CamShape;
  camCorner: CamCorner;
  camSizeMult: number;
};
type Status = {
  state: 'idle' | 'recording' | 'finalizing';
  elapsedMs: number;
  output?: string;
  lastFile?: string;
  lastError?: string;
  lastExitCode?: number;
};

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function shortenPath(p: string | null, maxLen = 56): string {
  if (!p) return '— not set —';
  if (p.length <= maxLen) return p;
  const head = p.slice(0, 18);
  const tail = p.slice(-(maxLen - 18 - 1));
  return `${head}…${tail}`;
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [audioDevices, setAudioDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<Status>({ state: 'idle', elapsedMs: 0 });
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
    window.api.listDevices().then((d) => setAudioDevices(d.audio));
    const off = window.api.onStatus((s) => setStatus(s));
    return off;
  }, []);

  const refresh = async () => {
    const [s, d] = await Promise.all([window.api.getSettings(), window.api.listDevices()]);
    setSettings(s);
    setAudioDevices(d.audio);
  };

  const handleChooseDest = async () => {
    setBusy(true);
    try {
      const dest = await window.api.chooseDestination();
      if (dest) await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAudioChange = async (idx: number) => {
    await window.api.setAudioIdx(idx);
    await refresh();
  };

  const handleAirpodsToggle = async (on: boolean) => {
    await window.api.setAirpods(on);
    await refresh();
  };

  const handleOffsetChange = async (ms: number) => {
    await window.api.setAudioOffset(ms);
    await refresh();
  };

  const handleToggle = async (
    setter: (on: boolean) => Promise<void>,
    on: boolean,
  ) => {
    await setter(on);
    await refresh();
  };

  const handleStart = async () => {
    setUiError(null);
    setBusy(true);
    try {
      const r = await window.api.startRecording();
      if (!r.ok) setUiError(r.error ?? 'failed to start');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await window.api.stopRecording();
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = (filePath?: string) => {
    if (filePath) window.api.revealInFinder(filePath);
  };

  const isRecording = status.state === 'recording';
  const canStart =
    !isRecording &&
    !busy &&
    !!settings?.destination &&
    settings?.audioIdx != null;

  return (
    <div className="app">
      <header>
        <img src={logoUrl} alt="Demo Recorder" className="brand-mark" />
        <div className="brand-text">
          <h1>
            DEMO <span className="accent">RECORDER</span>
          </h1>
          <p className="sub">Screen + camera + mic, picture-in-picture, by Digital Porters</p>
        </div>
        <button
          className="cog"
          onClick={() => setAdvancedOpen(true)}
          disabled={isRecording}
          title="Advanced settings"
          aria-label="Advanced settings"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <section className="card">
        <div className="row-label">
          <span>Destination folder</span>
          <button onClick={handleChooseDest} disabled={busy || isRecording}>
            {settings?.destination ? 'Change…' : 'Choose…'}
          </button>
        </div>
        <div className="path" title={settings?.destination ?? ''}>
          {shortenPath(settings?.destination ?? null)}
        </div>
      </section>

      <section className="card">
        <div className="row-label">
          <span>Microphone</span>
          <button onClick={refresh} disabled={busy || isRecording}>Refresh</button>
        </div>
        <select
          value={settings?.audioIdx ?? ''}
          onChange={(e) => handleAudioChange(Number(e.target.value))}
          disabled={isRecording}
        >
          <option value="" disabled>
            — choose a microphone —
          </option>
          {audioDevices.map((d) => (
            <option key={d.idx} value={d.idx}>
              [{d.idx}] {d.name}
            </option>
          ))}
        </select>
        <div className="row-inline">
          <label htmlFor="offset">Audio offset</label>
          <input
            id="offset"
            type="number"
            min={-500}
            max={1000}
            step={10}
            value={settings?.audioOffsetMs ?? 100}
            onChange={(e) => handleOffsetChange(Number(e.target.value))}
            disabled={isRecording}
          />
          <span className="muted">ms · positive delays audio (use to sync with video)</span>
        </div>
      </section>

      {advancedOpen && (
        <div className="modal-backdrop" onClick={() => setAdvancedOpen(false)}>
          <div className="modal" role="dialog" aria-label="Advanced settings" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Advanced</h2>
              <button className="close" onClick={() => setAdvancedOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="advanced">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings?.saveScreenOnly ?? false}
                  onChange={(e) => handleToggle(window.api.setSaveScreen, e.target.checked)}
                  disabled={isRecording}
                />
                <span>Also save screen-only video</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings?.saveCameraOnly ?? false}
                  onChange={(e) => handleToggle(window.api.setSaveCamera, e.target.checked)}
                  disabled={isRecording}
                />
                <span>Also save camera-only video</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings?.saveLog ?? false}
                  onChange={(e) => handleToggle(window.api.setSaveLog, e.target.checked)}
                  disabled={isRecording}
                />
                <span>Save ffmpeg log alongside each recording</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings?.airpods ?? false}
                  onChange={(e) => handleAirpodsToggle(e.target.checked)}
                  disabled={isRecording}
                />
                <span>I'm using AirPods (hint — no-op today)</span>
              </label>

              <div className="field">
                <div className="field-label">Camera shape</div>
                <div className="segmented">
                  {([
                    ['rectangle', 'Rectangle'],
                    ['square', 'Square'],
                    ['circle', 'Circle'],
                  ] as [CamShape, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      className={`seg ${settings?.camShape === val ? 'on' : ''}`}
                      onClick={() => window.api.setCamShape(val).then(refresh)}
                      disabled={isRecording}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <div className="field-label">
                  Camera size <span className="muted">· {Math.round(320 * (settings?.camSizeMult ?? 1))} px wide</span>
                </div>
                <div className="segmented">
                  {[0.5, 0.75, 1, 1.5, 2].map((v) => (
                    <button
                      key={v}
                      className={`seg ${(settings?.camSizeMult ?? 1) === v ? 'on' : ''}`}
                      onClick={() => window.api.setCamSize(v).then(refresh)}
                      disabled={isRecording}
                    >
                      {v}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <div className="field-label">Camera corner</div>
                <div className="corner-grid" role="radiogroup" aria-label="Camera corner">
                  {([
                    ['tl', 'top-left'],
                    ['tr', 'top-right'],
                    ['bl', 'bottom-left'],
                    ['br', 'bottom-right'],
                  ] as [CamCorner, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      className={`corner-btn corner-${val} ${settings?.camCorner === val ? 'on' : ''}`}
                      onClick={() => window.api.setCamCorner(val).then(refresh)}
                      disabled={isRecording}
                      aria-label={label}
                      title={label}
                    >
                      <span className="corner-dot" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="record-card">
        {isRecording ? (
          <button className="btn-stop" onClick={handleStop} disabled={busy}>
            <span className="rec-dot" />
            Stop · {fmtElapsed(status.elapsedMs)}
          </button>
        ) : (
          <button className="btn-record" onClick={handleStart} disabled={!canStart}>
            <span className="rec-dot" />
            Start Recording
          </button>
        )}
        {!canStart && !isRecording && (
          <p className="hint">Pick a destination folder and a microphone to start.</p>
        )}
      </section>

      {uiError && <div className="error">{uiError}</div>}

      {status.lastFile && status.state === 'idle' && (
        <section className="card">
          <div className="row-label">
            <span>Last recording</span>
            <button onClick={() => handleReveal(status.lastFile)}>Show in Finder</button>
          </div>
          <div className="path" title={status.lastFile}>
            {shortenPath(status.lastFile, 64)}
          </div>
          {status.lastExitCode != null && status.lastExitCode !== 0 && (
            <div className="muted">ffmpeg exit {status.lastExitCode} · check the .log next to the file</div>
          )}
        </section>
      )}
    </div>
  );
}
