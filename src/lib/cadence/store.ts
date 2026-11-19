import { create } from "zustand";
import { deleteTrack, getTrackBlob, listTracks, putTrack } from "./db";
import { makeDemos } from "./demos";
import { engine } from "./engine";
import { convertToWav, type LibraryActivity } from "./ffmpeg";
import {
  describePlaybackFailure,
  isAudioCandidate,
  playbackFailureMessage,
  unsupportedFilesMessage,
} from "./playback";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  stripExt,
  type Finish,
  type RepeatMode,
  type Settings,
  type TrackMeta,
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
  query: string;
  ready: boolean;
  busy: boolean;
  activity: LibraryActivity | null;
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
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, bands: DEFAULT_SETTINGS.bands.slice() };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const bands =
      Array.isArray(parsed.bands) && parsed.bands.length === 10
        ? parsed.bands.map((n) => Number(n) || 0)
        : DEFAULT_SETTINGS.bands.slice();
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_SETTINGS.volume,
      muted: Boolean(parsed.muted),
      shuffle: Boolean(parsed.shuffle),
      repeat: parsed.repeat === "all" || parsed.repeat === "one" ? parsed.repeat : "off",
      bands,
      finish: parsed.finish === "brass" ? "brass" : "carbon",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, bands: DEFAULT_SETTINGS.bands.slice() };
  }
}

function saveSettings(
  state: Pick<DeskState, "volume" | "muted" | "shuffle" | "repeat" | "bands" | "finish">,
) {
  const settings: Settings = {
    volume: state.volume,
    muted: state.muted,
    shuffle: state.shuffle,
    repeat: state.repeat,
    bands: state.bands,
    finish: state.finish,
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

let bound = false;

export const useDesk = create<DeskState>((set, get) => {
  const applyAudio = () => {
    const { bands, volume, muted } = get();
    engine.setBands(bands);
    engine.setVolume(volume, muted);
  };

  const titleFor = (id: string | null) =>
    get().tracks.find((track) => track.id === id)?.title ?? null;

  const playStored = async (id: string) => {
    const blob = await getTrackBlob(id);
    if (!blob) {
      set({ error: "That track is missing from the library.", playing: false });
      return;
    }
    const title = titleFor(id);
    set({ currentId: id, error: null, playing: true });
    try {
      engine.unlock();
      await engine.loadAndPlay(blob);
      set({ playing: true, error: null });
    } catch (err) {
      set({ playing: false, error: playbackFailureMessage(err, title) });
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
    activity: null,
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
            (failure) => {
              const { currentId } = get();
              set({
                playing: false,
                error: playbackFailureMessage(failure, titleFor(currentId)),
              });
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
      const audioFiles = files.filter((file) => isAudioCandidate(file));
      if (audioFiles.length === 0) {
        set({ error: "Drop audio files — mp3, wav, ogg, flac, m4a.", activity: null });
        return;
      }
      set({ busy: true, error: null, activity: null });
      let converterBroken = false;
      try {
        const accepted: { file: File; duration: number; title: string }[] = [];
        const rejected: string[] = [];
        for (const file of audioFiles) {
          const probed = await engine.probe(file);
          const title = stripExt(file.name);
          if (probed.ok) {
            accepted.push({ file, duration: probed.duration, title });
            continue;
          }
          if (converterBroken) {
            rejected.push(file.name);
            continue;
          }
          const converted = await convertToWav(file, (activity) => set({ activity }));
          if (!converted.ok) {
            rejected.push(file.name);
            if (converted.fatal) converterBroken = true;
            continue;
          }
          const wav = new File([converted.blob], `${title || "audio"}.wav`, { type: "audio/wav" });
          const again = await engine.probe(wav);
          if (!again.ok) {
            rejected.push(file.name);
            continue;
          }
          accepted.push({ file: wav, duration: again.duration, title });
        }
        let added = Date.now();
        for (const item of accepted) {
          await putTrack({
            id: crypto.randomUUID(),
            title: item.title,
            duration: item.duration,
            added: added++,
            blob: item.file,
          });
        }
        const rejection = rejected.length > 0 ? unsupportedFilesMessage(rejected) : null;
        if (accepted.length === 0) {
          set({ error: rejection });
          return;
        }
        const tracks = await listTracks();
        const ids = tracks.map((track) => track.id);
        const { shuffle, currentId } = get();
        set({
          tracks,
          order: shuffle ? shuffleIds(ids, currentId) : ids,
          error: rejection,
        });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : "Could not add those files.",
        });
      } finally {
        set({ busy: false, activity: null });
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
      const title = titleFor(currentId);
      try {
        if (!playing) engine.unlock();
        const nextPlaying = await engine.toggle();
        if (!playing && !nextPlaying && !engine.playing()) {
          await playStored(currentId);
          return;
        }
        set({ playing: nextPlaying, ...(nextPlaying ? { error: null } : {}) });
      } catch (err) {
        const failure = describePlaybackFailure(err, null);
        // Reloading won't lift a permission block. Other failures go through
        // playStored once so a stale element can recover, and so the message
        // matches the bytes that are actually in the library.
        if (!playing && failure.kind !== "blocked") {
          await playStored(currentId);
          return;
        }
        set({ playing: engine.playing(), error: playbackFailureMessage(failure, title) });
      }
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
      const repeat: RepeatMode =
        get().repeat === "off" ? "all" : get().repeat === "all" ? "one" : "off";
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
  };
});
