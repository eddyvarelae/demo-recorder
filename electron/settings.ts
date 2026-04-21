import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

export type CamShape = 'rectangle' | 'square' | 'circle';
export type CamCorner = 'tl' | 'tr' | 'bl' | 'br';

export type Settings = {
  destination: string | null;
  audioIdx: number | null;
  airpods: boolean;
  audioOffsetMs: number;
  saveScreenOnly: boolean;
  saveCameraOnly: boolean;
  saveLog: boolean;
  camShape: CamShape;
  camCorner: CamCorner;
  camSizeMult: number; // 1.0 = base 320px wide
};

const DEFAULT: Settings = {
  destination: null,
  audioIdx: null,
  airpods: false,
  audioOffsetMs: 100,
  saveScreenOnly: false,
  saveCameraOnly: false,
  saveLog: false,
  camShape: 'rectangle',
  camCorner: 'br',
  camSizeMult: 1.0,
};

function filePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export async function loadSettings(): Promise<Settings> {
  const p = filePath();
  if (!fs.existsSync(p)) {
    await fsp.writeFile(p, JSON.stringify(DEFAULT, null, 2));
    return { ...DEFAULT };
  }
  try {
    const raw = await fsp.readFile(p, 'utf8');
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await fsp.writeFile(filePath(), JSON.stringify(next, null, 2));
  return next;
}
