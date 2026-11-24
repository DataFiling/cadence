export const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const BAND_LABELS = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"] as const;

export type RepeatMode = "off" | "all" | "one";

export type Finish = "carbon" | "brass";

export type TransitionSpeed = "off" | "quick" | "normal" | "smooth";

export type TrackMeta = {
  id: string;
  title: string;
  duration: number;
  added: number;
};

export type StoredTrack = TrackMeta & {
  blob: Blob;
};

export type Settings = {
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  bands: number[];
  finish: Finish;
  transitionSpeed: TransitionSpeed;
};

export const PRESETS: Readonly<Record<string, readonly number[]>> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [6, 5, 3, 1, 0, -1, -1, 0, 1, 2],
  "Treble Boost": [0, 0, 0, 0, 0, 0, 1, 2, 3, 4],
  "Voice / Podcasts": [-2, -1, 0, 2, 4, 4, 2, 1, 0, -1],
  Night: [3, 2, 0, -1, -2, -2, -1, 1, 2, 3],
  Acoustic: [0, 1, 1, 0, 1, 2, 2, 2, 1, 0],
  Classical: [1, 1, 0, 0, 0, 0, 1, 2, 2, 1],
  Electronic: [4, 4, 2, 0, -1, -2, 0, 2, 3, 3],
  Jazz: [1, 2, 2, 1, 0, 0, 1, 1, 2, 2],
  Pop: [-1, 1, 2, 0, 0, 2, 3, 2, 1, 0],
  Rock: [3, 4, 2, 0, -1, -1, 1, 3, 3, 2],
};

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.85,
  muted: false,
  shuffle: false,
  repeat: "off",
  bands: PRESETS.Flat.slice(),
  finish: "carbon",
  transitionSpeed: "normal",
};

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "") || name;
}
