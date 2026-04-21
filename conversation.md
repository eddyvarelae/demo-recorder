# Demo Recorder — how it was built

A macOS screen + camera + mic recorder, built with Claude Code over one session.
Two artifacts live in this repo:

1. **`screenrec`** — a bash CLI around `ffmpeg` + AVFoundation.
2. **`/` (Electron app)** — a TypeScript + React + Vite + Electron wrapper around the same pipeline, styled to match Digital Porters' Media Transfer.

The log below is a broad-strokes walkthrough, not a prompt replay.

---

## 1. The original ask

> Capture my whole screen and my camera. Output an mp4/mov that overlays the screen with the camera as a tiny picture-in-picture in the bottom right. Capture AirPods mic audio.

Platform: macOS 24.4 on Apple Silicon, `ffmpeg 7.1` from Homebrew (built with `videotoolbox` + `audiotoolbox`).

---

## 2. CLI — `screenrec`

One `ffmpeg` invocation, three AVFoundation inputs (screen, camera, audio), one filter graph, one output (or three — see §4).

```
ffmpeg
  -f avfoundation -capture_cursor 1 -pixel_format nv12                    -i "3:none"
  -f avfoundation -framerate 30 -video_size 1280x720 -pixel_format nv12   -i "0:none"
  -f avfoundation -itsoffset 0.100                                         -i ":0"
  -filter_complex_threads 4
  -filter_complex "
     [0:v]scale=1920:-2,fps=30[scr];
     [1:v]fps=30,scale=320:-2,setsar=1,format=yuva420p,
          geq=a='rounded-rect SDF'[cam];
     [scr][cam]overlay=W-w-24:H-h-24[v]
  "
  -map [v] -map 2:a -fps_mode cfr -r 30 -pix_fmt nv12
  -c:v h264_videotoolbox -b:v 6M -c:a aac -b:a 96k -movflags +faststart OUT.mov
```

Key ingredients and the reason for each:

- `-pixel_format nv12` on both video inputs. AVFoundation's default (`yuv420p`) is rejected for screen capture, which silently breaks the whole per-input config (including `-framerate`). `nv12` is in AVFoundation's supported list *and* is the native format of `h264_videotoolbox`, so it also removes a software pixel conversion.
- `fps=30` on both video branches **before** overlay. Screen comes in at 30.000 fps, camera at 29.970 fps — the tiny drift makes `overlay` stall waiting for a matching frame. Forcing both to integer 30 lets overlay run freely.
- `-filter_complex_threads 4`. The overlay was single-threaded and the bottleneck; parallelizing the filter graph was the single biggest speedup.
- Scale the screen to 1920-wide before the overlay. Smaller working set = fewer memory ops per frame for the overlay filter.
- `-itsoffset 0.100` on audio. Bluetooth/AirPods mic latency means audio arrives slightly ahead of video. Shift it 100 ms later.
- Stopping: the CLI wraps `ffmpeg` so `q` on stdin or Ctrl-C cleanly finalizes the `.mov`. If the app ever wedges before frames start flowing, `pkill -INT ffmpeg` from another terminal is the escape hatch.

Flags worth knowing: `-l` (list devices), `-a N` (mic index), `-D MS` (audio offset), `-R N` (camera corner radius), `-W N` (max screen width; 0 = native), `-o FILE`.

Plus one more subcommand that saved a lot of guessing:

```
./screenrec diag 0
```

Runs four 5-second probes — screen to /dev/null, screen+encode, screen+camera+overlay+encode, full pipeline with audio — and reports real fps for each. That's how the overlay was identified as the bottleneck (2.4 fps) vs. capture or encoding (both fine at 30 fps).

---

## 3. Electron app

Same stack as Digital Porters' Media Transfer, on purpose (TypeScript + React + Vite + Electron, esbuild for the main process). Shared brand palette and header style, different motif.

Structure:

```
electron/
  main.ts        BrowserWindow, IPC, recorder lifecycle
  preload.ts     contextBridge → window.api
  recorder.ts    spawns ffmpeg, writes 'q\n' on stop
  settings.ts    persists to app.getPath('userData')/settings.json
src/
  App.tsx        header, destination picker, mic, audio-offset, big Start button
  styles.css     navy/gold/cream, Koulen display font, responsive clamp()s
build/
  logo.svg       new logo (see §5)
scripts/
  build-icons.sh SVG → 1024 PNG → iconset → .icns
```

### Persisted settings

```ts
{
  destination:    string | null,   // native folder picker, remembered
  audioIdx:       number | null,   // chosen mic
  audioOffsetMs:  number,          // default 100
  airpods:        boolean,         // hint only
  saveScreenOnly: boolean,         // advanced toggle (default off)
  saveCameraOnly: boolean,         // advanced toggle (default off)
  saveLog:        boolean,         // advanced toggle (default off)
}
```

### UI

- **Default output:** one file — `recording_<ts>.mov` (combined PiP).
- **Cog icon (top-right)** opens an Advanced modal with the three toggles. When "Also save screen-only / camera-only" is on, the filter graph inserts `split=2` on that branch and an extra `-map` output is appended — the default single-output path pays no extra cost.
- **Window locked to 9:16 portrait** via `win.setAspectRatio(9/16)` (IG Stories are 9:16). Default 450×800, min 360×640. Layout uses `clamp()` for padding and type sizes so the app reads cleanly at any drag.

### Shipping a DMG

```
npm run package        # icons → vite → esbuild → electron-builder --mac
```

Drops a `.dmg` in `release/`. Unsigned by default — right-click → Open on first launch. Bundling ffmpeg is left out for personal use; the app looks in `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, then `$PATH`.

---

## 4. Three outputs from one capture

When the Advanced toggles are on, a single `ffmpeg` pass produces:

- `recording_<ts>_combined.mov` — screen + PiP camera, the main artifact.
- `recording_<ts>_screen.mov` — just the screen (pre-overlay, pre-scale-for-PiP).
- `recording_<ts>_camera.mov` — just the camera (native resolution, no alpha mask).

All three share the same timestamp prefix and the same audio track. The filter graph does this cheaply with `split=2` nodes; the only cost is three `h264_videotoolbox` encode sessions — Apple Silicon handles that easily.

---

## 5. Logo

Starts from Digital Porters' mountain silhouette, then spins it the same way Media Transfer did:

- Rounded navy card (`#001C36`) with an inner lighter band.
- Digital Porters mountain in cream (`#FBF9F7`), 4× scaled.
- Small gold sun (`#F3C055`) top-right.
- Bottom motif: three concentric gold pulse rings + solid gold dot + small cream inner dot — a "REC" indicator, mirroring Media Transfer's "flowing dots" motif in the same anchor spot.

`scripts/build-icons.sh` turns `build/logo.svg` into an iconset and `.icns` using `rsvg-convert`, `sips`, and `iconutil`.

---

## 6. Debugging highlights (what surprised me)

Worth keeping these for anyone copying this approach.

- **"Configuration of video device failed, falling back to default"** comes from asking AVFoundation for a pixel format it doesn't support. The failure is silent-but-total: the per-input config is dropped, taking `-framerate` with it. Always pass a format AVFoundation lists as supported.
- **"Cannot use &lt;Mic&gt;"** is a TCC permission error, not a format error. macOS needs Microphone permission on the process that's calling the capture — Terminal for the CLI, the Electron app for the DMG. `tccutil reset Microphone <bundle-id>` re-triggers the prompt.
- **AirPods specifically** only expose their mic when they're the system input (HFP mode). If another app holds them, or they're only in A2DP, ffmpeg gets refused.
- **Audio a little ahead of video** is the normal shape on Bluetooth — positive `-itsoffset` on the audio input fixes it. 100 ms is a good default for AirPods.
- **`-realtime 1` on `h264_videotoolbox` drops frames** under backpressure. That looked like "the camera stutters." Removed it.
- **The overlay filter was the bottleneck, not the encoder.** Tiny PTS drift between screen and camera inputs made `overlay` stall; the diag harness made that obvious.
- **avfoundation's demuxer has no `-ar` / `-ac` option.** An earlier "AirPods mode" that passed `-ac 1 -ar 16000` caused ffmpeg to exit immediately in the Electron app (button blipped back to idle). Removed — AirPods auto-negotiate fine.
- **Electron error dialog storm**: a 500 ms `setInterval` calling `webContents.send` after the window was destroyed. Fix: guard with `isDestroyed()`, wrap in `try/catch`, clear the interval on `window-all-closed`, and catch top-level `uncaughtException` / `unhandledRejection` so any future throw logs instead of pops.

---

## 7. Permissions

First launch prompts for **Screen Recording**, **Camera**, and **Microphone** against whichever process calls `ffmpeg`. Approve all three in System Settings → Privacy & Security, then **quit and relaunch** — TCC grants only take effect for newly-launched processes.
