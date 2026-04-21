/// <reference types="vite/client" />

type CamShape = 'rectangle' | 'square' | 'circle';
type CamCorner = 'tl' | 'tr' | 'bl' | 'br';

type AppSettings = {
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

interface Window {
  api: {
    getSettings: () => Promise<AppSettings>;
    chooseDestination: () => Promise<string | null>;
    setAudioIdx: (idx: number) => Promise<void>;
    setAirpods: (on: boolean) => Promise<void>;
    setAudioOffset: (ms: number) => Promise<void>;
    setSaveScreen: (on: boolean) => Promise<void>;
    setSaveCamera: (on: boolean) => Promise<void>;
    setSaveLog: (on: boolean) => Promise<void>;
    setCamShape: (shape: CamShape) => Promise<void>;
    setCamCorner: (corner: CamCorner) => Promise<void>;
    setCamSize: (mult: number) => Promise<void>;
    listDevices: () => Promise<{ video: { idx: number; name: string }[]; audio: { idx: number; name: string }[] }>;
    startRecording: () => Promise<{ ok: boolean; output?: string; error?: string }>;
    stopRecording: () => Promise<{ ok: boolean; output?: string; error?: string }>;
    revealInFinder: (filePath: string) => Promise<void>;
    onStatus: (cb: (s: { state: 'idle' | 'recording' | 'finalizing'; elapsedMs: number; output?: string; lastFile?: string; lastError?: string; lastExitCode?: number }) => void) => () => void;
  };
}

declare module '*.svg' {
  const src: string;
  export default src;
}
