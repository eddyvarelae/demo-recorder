# Demo Recorder

macOS screen + camera + mic recorder by Digital Porters. Produces an mp4/mov with the camera as a picture-in-picture over the screen, captured in one `ffmpeg` pass.

Two entry points:

- **`screenrec`** — bash CLI around `ffmpeg` + AVFoundation.
- **`/` (Electron app)** — TypeScript + React + Vite + Electron wrapper around the same pipeline.

See `conversation.md` for the full walkthrough of how the pipeline was designed, why each setting is there, and the debugging traps AVFoundation sets.

## Requirements

- macOS on Apple Silicon
- `ffmpeg 7.x` with `videotoolbox` + `audiotoolbox` (from Homebrew: `brew install ffmpeg`)
- Node 20+ (only for the Electron app)
- For the icon / DMG pipeline: `rsvg-convert` (`brew install librsvg`)

## Running

### CLI

```
./screenrec -l          # list AVFoundation devices
./screenrec -a 1        # record with mic at index 1 (MacBook mic)
./screenrec diag 0      # 4-stage pipeline diagnostic (useful if fps drops)
```

Press `q` in the terminal to stop and finalize the file.

### Electron app (dev)

```
npm install
npm start
```

### Electron app (DMG)

```
npm run package
```

DMG lands in `release/`. Unsigned by default — right-click → Open on first launch.

## Permissions

First launch prompts for **Screen Recording**, **Camera**, and **Microphone**. Approve all three in *System Settings → Privacy & Security*, then quit and relaunch — TCC grants only take effect for newly-launched processes.

## Highlights

- 9:16 portrait window (Instagram Story-ready)
- Camera shape: Rectangle / Square / Circle
- Camera corner: top-left / top-right / bottom-left / bottom-right
- Camera size presets: 0.5× / 0.75× / 1× / 1.5× / 2×
- Audio offset for Bluetooth latency (default +100 ms)
- Advanced toggles: also save screen-only / camera-only / ffmpeg log
- Destination folder is persisted between launches
