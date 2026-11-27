import { create } from "zustand";
import { clearTracks, deleteTrack, getTrackBlob, listTracks, putTrack } from "./db";
import { makeDemos } from "./demos";
import { engine } from "./engine";
import { applySkin, isSkinId, parseTokens, resolveTokens, type SkinId, type SkinTokens } from "./skins";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  stripExt,
  type RepeatMode,
  type Settings,
  type StoredTrack,
  type TrackMeta,
  type TransitionSpeed,
  type WindowSizing,
} from "./types";

const SETTINGS_KEY = "cadence-settings";
const PLAY_OPENED_FILES_KEY = "cadence-play-opened-files";
const QUEUE_OPENED_FILES_KEY = "cadence-queue-opened-files";
const PLAYLIST_CLEARED_KEY = "cadence-playlist-cleared";
const SEEDED_KEY = "cadence-seeded-v2";

let hydrating: Promise<void> | null = null;

type DeskState = {
  tracks: TrackMeta[];
  openedTracks: StoredTrack[];
  openedOrder: string[];
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
  skin: SkinId;
  custom: SkinTokens | null;
  transitionSpeed: TransitionSpeed;
  windowSizing: WindowSizing;
  playOpenedFiles: boolean;
  queueOpenedFiles: boolean;
  query: string;
  ready: boolean;
  busy: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  addFiles: (files: File[], action?: "open" | "queue") => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearPlaylist: () => Promise<boolean>;
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
  setSkin: (skin: SkinId) => void;
  paint: (key: keyof SkinTokens, value: string) => void;
  setTransitionSpeed: (speed: TransitionSpeed) => void;
  setWindowSizing: (sizing: WindowSizing) => void;
  setPlayOpenedFiles: (enabled: boolean) => void;
  setQueueOpenedFiles: (enabled: boolean) => void;
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, bands: DEFAULT_SETTINGS.bands.slice() };
    const parsed = JSON.parse(raw) as Partial<Settings> & { finish?: string };
    const bands = Array.isArray(parsed.bands) && parsed.bands.length === 10
      ? parsed.bands.map((n) => Number(n) || 0)
      : DEFAULT_SETTINGS.bands.slice();
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_SETTINGS.volume,
      muted: Boolean(parsed.muted),
      shuffle: Boolean(parsed.shuffle),
      repeat: parsed.repeat === "all" || parsed.repeat === "one" ? parsed.repeat : "off",
      bands,
      skin: isSkinId(parsed.skin) ? parsed.skin : parsed.finish === "brass" ? "brass" : "carbon",
      custom: parseTokens(parsed.custom),
      transitionSpeed: parsed.transitionSpeed === "off" || parsed.transitionSpeed === "quick" || parsed.transitionSpeed === "smooth"
        ? parsed.transitionSpeed
        : "normal",
      windowSizing: parsed.windowSizing === "fill" ? "fill" : "fit",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, bands: DEFAULT_SETTINGS.bands.slice() };
  }
}

function saveSettings(state: Pick<DeskState, "volume" | "muted" | "shuffle" | "repeat" | "bands" | "skin" | "custom" | "transitionSpeed" | "windowSizing">) {
  const settings: Settings = {
    volume: state.volume,
    muted: state.muted,
    shuffle: state.shuffle,
    repeat: state.repeat,
    bands: state.bands,
    skin: state.skin,
    custom: state.custom,
    transitionSpeed: state.transitionSpeed,
    windowSizing: state.windowSizing,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadOpeningPreference(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function saveOpeningPreference(key: string, enabled: boolean) {
  try {
    localStorage.setItem(key, String(enabled));
  } catch {
    // The current window can still use the setting for this session.
  }
}

function shuffleIds(ids: string[], currentId: string | null): string[] {
  const first = currentId && ids.includes(currentId) ? currentId : null;
  const rest = ids.filter((id) => id !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = rest[i]!;
    rest[i] = rest[j]!;
    rest[j] = swap;
  }
  return first ? [first, ...rest] : rest;
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
  let playlistWrites = Promise.resolve();
  let playbackGeneration = 0;
  const applyAudio = () => {
    const { bands, volume, muted } = get();
    engine.setBands(bands);
    engine.setVolume(volume, muted);
  };

  const playbackOrder = () => {
    const { tracks, openedTracks, openedOrder, currentId, shuffle, order } = get();
    if (openedTracks.some((track) => track.id === currentId)) return openedOrder;
    return shuffle ? order : tracks.map((track) => track.id);
  };

  const playStored = async (id: string, playImmediately = true) => {
    const generation = ++playbackGeneration;
    if (playImmediately) engine.unlock();
    const openedTrack = get().openedTracks.find((track) => track.id === id);
    const blob = openedTrack?.blob ?? await getTrackBlob(id);
    if (generation !== playbackGeneration) return;
    if (!blob) {
      set({ error: "That track is missing from the library.", playing: false });
      return;
    }
    if (!openedTrack) set({ openedTracks: [], openedOrder: [] });
    set({ currentId: id, error: null, playing: playImmediately, currentTime: 0, duration: 0 });
    if (!playImmediately) {
      engine.load(blob);
      return;
    }
    try {
      await engine.loadAndPlay(blob);
      if (generation === playbackGeneration) set({ playing: true });
    } catch {
      if (generation === playbackGeneration) set({ playing: false, error: "Playback was blocked. Press play again." });
    }
  };

  const resetPlaylist = (tracks: TrackMeta[] = []) => {
    playbackGeneration += 1;
    engine.unload();
    const ids = tracks.map((track) => track.id);
    set({
      tracks,
      order: get().shuffle ? shuffleIds(ids, null) : ids,
      openedTracks: [],
      openedOrder: [],
      currentId: null,
      playing: false,
      currentTime: 0,
      duration: 0,
      query: "",
      error: null,
    });
  };

  const importAudio = async (files: File[], playImmediately: boolean, queue: boolean) => {
    const audioFiles = files.filter(
      (file) => file.type.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac|webm|opus)$/i.test(file.name),
    );
    if (audioFiles.length === 0) {
      set({ error: "Choose an audio file such as MP3, WAV, Ogg, FLAC, or M4A." });
      return;
    }
    try {
      await get().hydrate();
      set({ busy: true, error: null });
      let added = Date.now();
      const opened: StoredTrack[] = [];
      for (const file of audioFiles) {
        const duration = await readDuration(file);
        const track = {
          id: crypto.randomUUID(),
          title: stripExt(file.name),
          duration,
          added: added++,
          blob: file,
        };
        if (queue) await putTrack(track);
        opened.push(track);
      }
      const first = opened[0]!;
      if (!queue) {
        const ids = opened.map((track) => track.id);
        set({ openedTracks: opened, openedOrder: get().shuffle ? shuffleIds(ids, first.id) : ids });
        await playStored(first.id, playImmediately);
        return;
      }
      const tracks = await listTracks();
      const ids = tracks.map((track) => track.id);
      const { shuffle, currentId } = get();
      set({ tracks, order: shuffle ? shuffleIds(ids, currentId) : ids });
      if (playImmediately) await playStored(first.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Could not add those files." });
    } finally {
      set({ busy: false });
    }
  };

  return {
    tracks: [],
    openedTracks: [],
    openedOrder: [],
    order: [],
    currentId: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    ...DEFAULT_SETTINGS,
    bands: DEFAULT_SETTINGS.bands.slice(),
    playOpenedFiles: true,
    queueOpenedFiles: false,
    query: "",
    ready: false,
    busy: false,
    error: null,

    hydrate: () => {
      if (hydrating) return hydrating;
      hydrating = (async () => {
      if (!bound) {
        bound = true;
        window.addEventListener("storage", (event) => {
          if (event.key === PLAY_OPENED_FILES_KEY) {
            set({ playOpenedFiles: event.newValue !== "false" });
          } else if (event.key === QUEUE_OPENED_FILES_KEY) {
            set({ queueOpenedFiles: event.newValue === "true" });
          } else if (event.key === PLAYLIST_CLEARED_KEY && event.newValue) {
            playlistWrites = playlistWrites.then(async () => {
              const tracks = await listTracks();
              const { currentId, openedTracks, shuffle } = get();
              if (![...tracks, ...openedTracks].some((track) => track.id === currentId)) {
                resetPlaylist(tracks);
              } else {
                const ids = tracks.map((track) => track.id);
                set({ tracks, order: shuffle ? shuffleIds(ids, currentId) : ids });
              }
            }).catch(() => set({ error: "Could not refresh the playlist." }));
          }
        });
        engine.bind(
          (currentTime, duration) => set({ currentTime, duration: duration || get().duration }),
          () => {
            void get().next(true);
          },
        );
      }
      const settings = loadSettings();
      set({
        ...settings,
        playOpenedFiles: loadOpeningPreference(PLAY_OPENED_FILES_KEY, true),
        queueOpenedFiles: loadOpeningPreference(QUEUE_OPENED_FILES_KEY, false),
        busy: true,
        error: null,
      });
      applyAudio();
      applySkin(resolveTokens(settings.skin, settings.custom));
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

    addFiles: (files, action = "open") => {
      const { playOpenedFiles, queueOpenedFiles } = get();
      const playImmediately = action === "open" && playOpenedFiles;
      const queue = action === "queue" || queueOpenedFiles;
      if (playImmediately) engine.unlock();
      playlistWrites = playlistWrites.then(() => importAudio(files, playImmediately, queue));
      return playlistWrites;
    },

    clearPlaylist: () => {
      const clearing = playlistWrites.then(async () => {
        set({ busy: true, error: null });
        try {
          await clearTracks();
          resetPlaylist();
          try {
            localStorage.setItem(PLAYLIST_CLEARED_KEY, crypto.randomUUID());
          } catch {
            // The library has already been cleared even if other windows cannot be notified.
          }
          return true;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Could not clear the playlist." });
          return false;
        } finally {
          set({ busy: false });
        }
      });
      playlistWrites = clearing.then(() => {});
      return clearing;
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
      const generation = playbackGeneration;
      if (!currentId) {
        const first = tracks[0];
        if (first) await playStored(first.id);
        return;
      }
      if (!playing) {
        engine.unlock();
        try {
          const nextPlaying = await engine.toggle();
          if (generation !== playbackGeneration) return;
          if (!nextPlaying && !engine.playing()) {
            await playStored(currentId);
            return;
          }
          set({ playing: nextPlaying, error: null });
        } catch {
          if (generation === playbackGeneration) await playStored(currentId);
        }
        return;
      }
      const nextPlaying = await engine.toggle();
      if (generation === playbackGeneration) set({ playing: nextPlaying });
    },

    next: async (fromEnd = false) => {
      const { currentId, repeat } = get();
      const ids = playbackOrder();
      if (ids.length === 0) return;
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
      const { currentId, currentTime } = get();
      if (currentTime > 3) {
        engine.seek(0);
        set({ currentTime: 0 });
        return;
      }
      const ids = playbackOrder();
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
      const { shuffle, tracks, openedTracks, currentId } = get();
      const playlistIds = tracks.map((track) => track.id);
      const openedIds = openedTracks.map((track) => track.id);
      set({
        shuffle: !shuffle,
        order: shuffle ? playlistIds : shuffleIds(playlistIds, currentId),
        openedOrder: shuffle ? openedIds : shuffleIds(openedIds, currentId),
      });
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
      if (!Object.hasOwn(PRESETS, name)) return;
      const bands = PRESETS[name].slice();
      set({ bands });
      engine.setBands(bands);
      saveSettings(get());
    },

    setQuery: (query) => set({ query }),

    setSkin: (skin) => {
      const { skin: currentSkin, custom: saved } = get();
      const custom = skin === "custom" && !saved ? resolveTokens(currentSkin, null) : saved;
      applySkin(resolveTokens(skin, custom));
      set({ skin, custom });
      saveSettings(get());
    },

    paint: (key, value) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
      const { skin, custom: saved } = get();
      const custom = { ...resolveTokens(skin, saved), [key]: value };
      applySkin(custom);
      set({ skin: "custom", custom });
      saveSettings(get());
    },

    setTransitionSpeed: (transitionSpeed) => {
      set({ transitionSpeed });
      saveSettings(get());
    },

    setWindowSizing: (windowSizing) => {
      set({ windowSizing });
      saveSettings(get());
    },

    setPlayOpenedFiles: (playOpenedFiles) => {
      saveOpeningPreference(PLAY_OPENED_FILES_KEY, playOpenedFiles);
      set({ playOpenedFiles });
    },

    setQueueOpenedFiles: (queueOpenedFiles) => {
      saveOpeningPreference(QUEUE_OPENED_FILES_KEY, queueOpenedFiles);
      set({ queueOpenedFiles });
    },
  };
});
