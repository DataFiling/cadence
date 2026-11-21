import { create } from "zustand";
import { deleteTrack, getTrackBlob, listTracks, putTrack } from "./db";
import { makeDemos } from "./demos";
import { engine } from "./engine";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  stripExt,
  type Finish,
  type RepeatMode,
  type Settings,
  type TrackMeta,
  type TransitionSpeed,
} from "./types";

const SETTINGS_KEY = "cadence-settings";
const SEEDED_KEY = "cadence-seeded-v2";

let hydrating: Promise<void> | null = null;

type DeskState = {
  tracks: TrackMeta[];
  order: string[];
  currentId: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  bands: number[];
  finish: Finish;
  transitionSpeed: TransitionSpeed;
  query: string;
  ready: boolean;
  busy: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  playId: (id: string) => Promise<void>;
  toggle: () => Promise<void>;
  next: (fromEnd?: boolean) => Promise<void>;
  prev: () => Promise<void>;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setBand: (index: number, gain: number) => void;
  applyPreset: (name: string) => void;
  setQuery: (query: string) => void;
  setFinish: (finish: Finish) => void;
  setTransitionSpeed: (speed: TransitionSpeed) => void;
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, bands: DEFAULT_SETTINGS.bands.slice() };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const bands = Array.isArray(parsed.bands) && parsed.bands.length === 10
      ? parsed.bands.map((n) => Number(n) || 0)
      : DEFAULT_SETTINGS.bands.slice();
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_SETTINGS.volume,
      muted: Boolean(parsed.muted),
      shuffle: Boolean(parsed.shuffle),
      repeat: parsed.repeat === "all" || parsed.repeat === "one" ? parsed.repeat : "off",
      bands,
      finish: parsed.finish === "brass" ? "brass" : "carbon",
      transitionSpeed: parsed.transitionSpeed === "off" || parsed.transitionSpeed === "quick" || parsed.transitionSpeed === "smooth"
        ? parsed.transitionSpeed
        : "normal",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, bands: DEFAULT_SETTINGS.bands.slice() };
  }
}

function saveSettings(state: Pick<DeskState, "volume" | "muted" | "shuffle" | "repeat" | "bands" | "finish" | "transitionSpeed">) {
  const settings: Settings = {
    volume: state.volume,
    muted: state.muted,
    shuffle: state.shuffle,
    repeat: state.repeat,
    bands: state.bands,
    finish: state.finish,
    transitionSpeed: state.transitionSpeed,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function shuffleIds(ids: string[], currentId: string | null): string[] {
  const rest = ids.filter((id) => id !== currentId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = rest[i]!;
    rest[i] = rest[j]!;
    rest[j] = swap;
  }
  return currentId ? [currentId, ...rest] : rest;
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.src = url;
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

let bound = false;

export const useDesk = create<DeskState>((set, get) => {
  const applyAudio = () => {
    const { bands, volume, muted } = get();
    engine.setBands(bands);
    engine.setVolume(volume, muted);
  };

  const playStored = async (id: string) => {
    engine.unlock();
    const blob = await getTrackBlob(id);
    if (!blob) {
      set({ error: "That track is missing from the library.", playing: false });
      return;
    }
    set({ currentId: id, error: null, playing: true });
    try {
      await engine.loadAndPlay(blob);
      set({ playing: true });
    } catch {
      set({ playing: false, error: "Playback was blocked. Press play again." });
    }
  };

  return {
    tracks: [],
    order: [],
    currentId: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    ...DEFAULT_SETTINGS,
    bands: DEFAULT_SETTINGS.bands.slice(),
    query: "",
    ready: false,
    busy: false,
    error: null,

    hydrate: () => {
      if (hydrating) return hydrating;
      hydrating = (async () => {
      if (!bound) {
        bound = true;
        engine.bind(
          (currentTime, duration) => set({ currentTime, duration: duration || get().duration }),
          () => {
            void get().next(true);
          },
        );
      }
      const settings = loadSettings();
      set({ ...settings, busy: true, error: null });
      applyAudio();
      document.documentElement.dataset.finish = settings.finish;
      try {
        let tracks = await listTracks();
        if (tracks.length === 0 && !localStorage.getItem(SEEDED_KEY)) {
          const demos = await makeDemos();
          for (const demo of demos) await putTrack(demo);
          localStorage.setItem(SEEDED_KEY, "1");
          tracks = await listTracks();
        }
        const ids = tracks.map((track) => track.id);
        set({
          tracks,
          order: settings.shuffle ? shuffleIds(ids, null) : ids,
          ready: true,
          busy: false,
        });
      } catch (err) {
        set({
          ready: true,
          busy: false,
          error: err instanceof Error ? err.message : "Could not open the library.",
        });
      }
      })();
      return hydrating;
    },

    addFiles: async (files) => {
      const audioFiles = files.filter(
        (file) => file.type.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac|webm|opus)$/i.test(file.name),
      );
      if (audioFiles.length === 0) {
        set({ error: "Drop audio files — mp3, wav, ogg, flac, m4a." });
        return;
      }
      set({ busy: true, error: null });
      try {
        let added = Date.now();
        for (const file of audioFiles) {
          const duration = await readDuration(file);
          await putTrack({
            id: crypto.randomUUID(),
            title: stripExt(file.name),
            duration,
            added: added++,
            blob: file,
          });
        }
        const tracks = await listTracks();
        const ids = tracks.map((track) => track.id);
        const { shuffle, currentId } = get();
        set({
          tracks,
          order: shuffle ? shuffleIds(ids, currentId) : ids,
          busy: false,
        });
      } catch (err) {
        set({
          busy: false,
          error: err instanceof Error ? err.message : "Could not add those files.",
        });
      }
    },

    remove: async (id) => {
      await deleteTrack(id);
      const tracks = get().tracks.filter((track) => track.id !== id);
      const order = get().order.filter((trackId) => trackId !== id);
      const current = get().currentId === id ? null : get().currentId;
      if (get().currentId === id) {
        engine.pause();
        set({ playing: false, currentTime: 0, duration: 0 });
      }
      set({ tracks, order, currentId: current });
    },

    playId: async (id) => {
      await playStored(id);
    },

    toggle: async () => {
      const { currentId, tracks, playing } = get();
      if (!currentId) {
        const first = tracks[0];
        if (first) await playStored(first.id);
        return;
      }
      if (!playing) {
        engine.unlock();
        try {
          const nextPlaying = await engine.toggle();
          if (!nextPlaying && !engine.playing()) {
            await playStored(currentId);
            return;
          }
          set({ playing: nextPlaying, error: null });
        } catch {
          await playStored(currentId);
        }
        return;
      }
      const nextPlaying = await engine.toggle();
      set({ playing: nextPlaying });
    },

    next: async (fromEnd = false) => {
      const { tracks, order, shuffle, currentId, repeat } = get();
      if (tracks.length === 0) return;
      const ids = shuffle ? order : tracks.map((track) => track.id);
      if (fromEnd && repeat === "one" && currentId) {
        engine.seek(0);
        await playStored(currentId);
        return;
      }
      const index = ids.indexOf(currentId ?? "");
      const following = index >= 0 ? ids[index + 1] : ids[0];
      if (following) {
        await playStored(following);
        return;
      }
      if (repeat === "all" && ids[0]) {
        await playStored(ids[0]);
        return;
      }
      engine.pause();
      engine.seek(0);
      set({ playing: false, currentTime: 0 });
    },

    prev: async () => {
      const { tracks, order, shuffle, currentId, currentTime } = get();
      if (currentTime > 3) {
        engine.seek(0);
        set({ currentTime: 0 });
        return;
      }
      const ids = shuffle ? order : tracks.map((track) => track.id);
      const index = ids.indexOf(currentId ?? "");
      const previous = index > 0 ? ids[index - 1] : ids[ids.length - 1];
      if (previous) await playStored(previous);
    },

    seek: (time) => {
      engine.seek(time);
      set({ currentTime: time });
    },

    setVolume: (volume) => {
      set({ volume, muted: false });
      engine.setVolume(volume, false);
      saveSettings(get());
    },

    toggleMute: () => {
      const muted = !get().muted;
      set({ muted });
      engine.setVolume(get().volume, muted);
      saveSettings(get());
    },

    toggleShuffle: () => {
      const shuffle = !get().shuffle;
      const ids = get().tracks.map((track) => track.id);
      const order = shuffle ? shuffleIds(ids, get().currentId) : ids;
      set({ shuffle, order });
      saveSettings(get());
    },

    cycleRepeat: () => {
      const repeat: RepeatMode = get().repeat === "off" ? "all" : get().repeat === "all" ? "one" : "off";
      set({ repeat });
      saveSettings(get());
    },

    setBand: (index, gain) => {
      const bands = get().bands.slice();
      bands[index] = Math.max(-12, Math.min(12, gain));
      set({ bands });
      engine.setBands(bands);
      saveSettings(get());
    },

    applyPreset: (name) => {
      const preset = PRESETS[name];
      if (!preset) return;
      const bands = preset.slice();
      set({ bands });
      engine.setBands(bands);
      saveSettings(get());
    },

    setQuery: (query) => set({ query }),

    setFinish: (finish) => {
      document.documentElement.dataset.finish = finish;
      set({ finish });
      saveSettings(get());
    },

    setTransitionSpeed: (transitionSpeed) => {
      set({ transitionSpeed });
      saveSettings(get());
    },
  };
});
