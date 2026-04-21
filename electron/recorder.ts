import { spawn, execFile, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

export type Device = { idx: number; name: string };
export type DeviceList = { video: Device[]; audio: Device[] };

const FFMPEG_CANDIDATES = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
];

export function findFfmpeg(): string {
  for (const p of FFMPEG_CANDIDATES) if (fs.existsSync(p)) return p;
  return 'ffmpeg';
}

export async function listDevices(): Promise<DeviceList> {
  const bin = findFfmpeg();
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
      (_err, _stdout, stderr) => {
        const out: DeviceList = { video: [], audio: [] };
        let mode: 'video' | 'audio' | null = null;
        for (const line of (stderr || '').split('\n')) {
          if (/AVFoundation video devices/.test(line)) {
            mode = 'video';
            continue;
          }
          if (/AVFoundation audio devices/.test(line)) {
            mode = 'audio';
            continue;
          }
          const m = line.match(/\[(\d+)\]\s+(.+?)\s*$/);
          if (m && mode) out[mode].push({ idx: Number(m[1]), name: m[2] });
        }
        resolve(out);
      },
    );
  });
}

export type CamShape = 'rectangle' | 'square' | 'circle';
export type CamCorner = 'tl' | 'tr' | 'bl' | 'br';

export type StartArgs = {
  destination: string;
  screenIdx: number;
  cameraIdx: number;
  audioIdx: number;
  airpods: boolean;
  audioOffsetMs: number;
  fps?: number;
  bitrate?: string;
  screenWidth?: number;
  camWidth?: number;
  margin?: number;
  cornerRadius?: number;
  saveScreenOnly?: boolean;
  saveCameraOnly?: boolean;
  saveLog?: boolean;
  camShape?: CamShape;
  camCorner?: CamCorner;
  camSizeMult?: number;
};

export type StartResult = {
  combined: string;
  screen?: string;
  camera?: string;
  log?: string;
};

export type RecorderEvents = {
  onElapsed?: (elapsedMs: number) => void;
  onExit?: (code: number, output: string) => void;
  onError?: (msg: string) => void;
};

export class Recorder {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private startedAt = 0;
  private elapsedTimer: NodeJS.Timeout | null = null;
  private outputs: StartResult | null = null;
  private logStream: fs.WriteStream | null = null;
  private events: RecorderEvents = {};

  isRecording(): boolean {
    return this.proc !== null;
  }
  output(): string | null {
    return this.outputs?.combined ?? null;
  }
  outputs_(): StartResult | null {
    return this.outputs;
  }
  elapsedMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  async start(args: StartArgs, events: RecorderEvents = {}): Promise<StartResult> {
    if (this.proc) throw new Error('already recording');
    this.events = events;

    await fsp.mkdir(args.destination, { recursive: true });
    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '_');
    const base = path.join(args.destination, `recording_${ts}`);
    const saveScreen = !!args.saveScreenOnly;
    const saveCamera = !!args.saveCameraOnly;
    const saveLog = !!args.saveLog;
    const outs: StartResult = {
      combined: saveScreen || saveCamera ? `${base}_combined.mov` : `${base}.mov`,
      screen: saveScreen ? `${base}_screen.mov` : undefined,
      camera: saveCamera ? `${base}_camera.mov` : undefined,
      log: saveLog ? `${base}.log` : undefined,
    };
    this.outputs = outs;

    const fps = String(args.fps ?? 30);
    const bitrate = args.bitrate ?? '6M';
    const screenW = args.screenWidth ?? 1920;
    const baseCamW = args.camWidth ?? 320;
    const sizeMult = args.camSizeMult ?? 1.0;
    // Round to even so scale=W:-2 and the center-crop keep chroma subsampling happy.
    const camW = Math.max(80, Math.round((baseCamW * sizeMult) / 2) * 2);
    const margin = args.margin ?? 24;
    const cornerR = args.cornerRadius ?? 24;
    const shape: CamShape = args.camShape ?? 'rectangle';
    const corner: CamCorner = args.camCorner ?? 'br';
    const screenScale = screenW > 0 ? `scale=${screenW}:-2:flags=fast_bilinear` : 'null';
    const offsetSec = (args.audioOffsetMs / 1000).toFixed(3);

    // Build camera filter chain by shape.
    //   rectangle: 16:9 scaled to camW wide, optional rounded-corner alpha mask.
    //   square:    center-crop input to square, scale to camW×camW, optional rounded-corner mask.
    //   circle:    same as square, but alpha mask is a circle.
    let camChain: string;
    if (shape === 'rectangle') {
      const roundedMask =
        cornerR > 0
          ? `,format=yuva420p,geq=lum=lum(X\\,Y):cb=cb(X\\,Y):cr=cr(X\\,Y):a=if(lt(hypot(max(0\\,abs(X-W/2)-(W/2-${cornerR}))\\,max(0\\,abs(Y-H/2)-(H/2-${cornerR})))\\,${cornerR})\\,255\\,0)`
          : '';
      camChain = `scale=${camW}:-2:flags=fast_bilinear,setsar=1${roundedMask}`;
    } else if (shape === 'square') {
      const roundedMask =
        cornerR > 0
          ? `,format=yuva420p,geq=lum=lum(X\\,Y):cb=cb(X\\,Y):cr=cr(X\\,Y):a=if(lt(hypot(max(0\\,abs(X-W/2)-(W/2-${cornerR}))\\,max(0\\,abs(Y-H/2)-(H/2-${cornerR})))\\,${cornerR})\\,255\\,0)`
          : '';
      camChain = `crop=ih:ih,scale=${camW}:${camW}:flags=fast_bilinear,setsar=1${roundedMask}`;
    } else {
      // circle
      const circleMask = `,format=yuva420p,geq=lum=lum(X\\,Y):cb=cb(X\\,Y):cr=cr(X\\,Y):a=if(lt(hypot(X-W/2\\,Y-H/2)\\,W/2)\\,255\\,0)`;
      camChain = `crop=ih:ih,scale=${camW}:${camW}:flags=fast_bilinear,setsar=1${circleMask}`;
    }

    // Only split the screen / camera streams if we're going to emit extra files.
    const screenSplit = saveScreen ? `,split=2[scr_full][scr_pip]` : `[scr_pip]`;
    const cameraSplit = saveCamera ? `,split=2[cam_full][cam_src]` : `[cam_src]`;

    // Overlay position by corner choice.
    const overlayXY: Record<CamCorner, string> = {
      tl: `${margin}:${margin}`,
      tr: `W-w-${margin}:${margin}`,
      bl: `${margin}:H-h-${margin}`,
      br: `W-w-${margin}:H-h-${margin}`,
    };

    const filter =
      `[0:v]${screenScale},fps=${fps}${screenSplit};` +
      `[1:v]fps=${fps}${cameraSplit};` +
      `[cam_src]${camChain}[cam_pip];` +
      `[scr_pip][cam_pip]overlay=${overlayXY[corner]}:shortest=0:repeatlast=1:eof_action=pass[v]`;

    const ffArgs: string[] = [
      '-hide_banner',
      '-loglevel', 'info',
      '-stats',
      '-thread_queue_size', '4096', '-probesize', '50M', '-analyzeduration', '2M',
      '-f', 'avfoundation', '-capture_cursor', '1', '-pixel_format', 'nv12',
      '-i', `${args.screenIdx}:none`,

      '-thread_queue_size', '4096',
      '-f', 'avfoundation', '-framerate', '30', '-video_size', '1280x720', '-pixel_format', 'nv12',
      '-i', `${args.cameraIdx}:none`,

      '-thread_queue_size', '4096',
      '-itsoffset', offsetSec,
      '-f', 'avfoundation',
      '-i', `:${args.audioIdx}`,
    ];

    ffArgs.push('-filter_complex_threads', '4', '-filter_complex', filter);

    const encArgs = (label: string, file: string) => [
      '-map', label, '-map', '2:a',
      '-fps_mode', 'cfr', '-r', fps,
      '-pix_fmt', 'nv12',
      '-c:v', 'h264_videotoolbox', '-b:v', bitrate,
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      file,
    ];
    ffArgs.push(...encArgs('[v]', outs.combined));
    if (outs.screen) ffArgs.push(...encArgs('[scr_full]', outs.screen));
    if (outs.camera) ffArgs.push(...encArgs('[cam_full]', outs.camera));

    const bin = findFfmpeg();
    const proc = spawn(bin, ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    this.startedAt = Date.now();

    if (outs.log) {
      this.logStream = fs.createWriteStream(outs.log);
      this.logStream.write(`# command\n${bin} ${ffArgs.map(quoteArg).join(' ')}\n\n`);
      proc.stderr.on('data', (chunk) => this.logStream?.write(chunk));
      proc.stdout.on('data', (chunk) => this.logStream?.write(chunk));
    } else {
      // Swallow output to avoid filling the pipe buffer (which would stall ffmpeg).
      proc.stderr.on('data', () => {});
      proc.stdout.on('data', () => {});
    }

    this.elapsedTimer = setInterval(() => {
      this.events.onElapsed?.(this.elapsedMs());
    }, 250);

    proc.on('exit', (code) => {
      if (this.elapsedTimer) {
        clearInterval(this.elapsedTimer);
        this.elapsedTimer = null;
      }
      const finalOut = this.outputs?.combined || '';
      this.proc = null;
      this.startedAt = 0;
      this.logStream?.end();
      this.logStream = null;
      this.events.onExit?.(code ?? -1, finalOut);
    });

    proc.on('error', (err) => {
      this.events.onError?.(String(err?.message || err));
    });

    return outs;
  }

  async stop(timeoutMs = 8000): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    try {
      proc.stdin.write('q\n');
    } catch {}
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          proc.kill('SIGINT');
        } catch {}
        const t2 = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {}
          resolve();
        }, 2500);
        proc.once('exit', () => {
          clearTimeout(t2);
          resolve();
        });
      }, timeoutMs);
      proc.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}

function quoteArg(a: string): string {
  if (/^[A-Za-z0-9_./:=,@%+\-]+$/.test(a)) return a;
  return `'${a.replace(/'/g, `'\\''`)}'`;
}
