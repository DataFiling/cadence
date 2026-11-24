import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import {
  Minus,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { engine } from "@/lib/cadence/engine";
import { useDesk } from "@/lib/cadence/store";
import { BAND_LABELS, BANDS, PRESETS, formatTime, type Finish, type TransitionSpeed } from "@/lib/cadence/types";

type View = "player" | "eq" | "playlist";

declare global {
  interface Window {
    cadenceWindow?: {
      minimize: () => void;
      close: () => void;
    };
  }
}

const VIEW_INDEX: Record<View, number> = { player: 0, eq: 1, playlist: 2 };
const EQ_PROFILES = Object.entries(PRESETS);
const subscribeToWindowControls = () => () => {};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tag)
    || target.isContentEditable
    || Boolean(target.closest('[role="slider"]'));
}

export function Desk({ desktop = false }: { desktop?: boolean }) {
  const windowControls = useSyncExternalStore(
    subscribeToWindowControls,
    () => window.cadenceWindow,
    () => undefined,
  );
  const desktopLayout = desktop || Boolean(windowControls);
  const ready = useDesk((s) => s.ready);
  const busy = useDesk((s) => s.busy);
  const error = useDesk((s) => s.error);
  const hydrate = useDesk((s) => s.hydrate);
  const addFiles = useDesk((s) => s.addFiles);
  const toggle = useDesk((s) => s.toggle);
  const next = useDesk((s) => s.next);
  const prev = useDesk((s) => s.prev);
  const seek = useDesk((s) => s.seek);
  const setVolume = useDesk((s) => s.setVolume);
  const toggleMute = useDesk((s) => s.toggleMute);
  const toggleShuffle = useDesk((s) => s.toggleShuffle);
  const cycleRepeat = useDesk((s) => s.cycleRepeat);
  const transitionSpeed = useDesk((s) => s.transitionSpeed);
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState<View>("player");
  const fileRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const settingsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const switchView = useCallback((target: View) => {
    setView((current) => current === target && target !== "player" ? "player" : target);
    if (settingsRef.current) settingsRef.current.open = false;
  }, []);

  useEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('.cadence-view[inert]')) {
      navRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    }
  }, [view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (settingsRef.current?.open) {
          settingsRef.current.open = false;
          settingsRef.current.querySelector("summary")?.focus();
        } else {
          switchView("player");
        }
        return;
      }
      if (isTypingTarget(event.target)) return;
      // Let Space activate a focused button or settings disclosure once.
      if (event.key === " " && event.target instanceof Element && event.target.closest("button, summary")) return;
      if (event.key === " ") {
        event.preventDefault();
        void toggle();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (event.shiftKey) void next();
        else seek(useDesk.getState().currentTime + 5);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (event.shiftKey) void prev();
        else seek(useDesk.getState().currentTime - 5);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setVolume(Math.min(1, useDesk.getState().volume + 0.05));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setVolume(Math.max(0, useDesk.getState().volume - 0.05));
      } else if (event.key === "m") {
        toggleMute();
      } else if (event.key === "s") {
        toggleShuffle();
      } else if (event.key === "r") {
        cycleRepeat();
      } else if (event.key === "e" && !event.repeat) {
        switchView("eq");
      } else if (event.key === "p" && !event.repeat) {
        switchView("playlist");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleRepeat, next, prev, seek, setVolume, switchView, toggle, toggleMute, toggleShuffle]);

  const deskLayout = desktopLayout ? "bg-panel" : "mx-auto max-w-[34rem] px-2 py-3 sm:px-4 sm:py-6";
  const panelFrame = desktopLayout ? "" : "rounded-lg border border-line shadow-2xl";
  const dropOutlineOffset = desktopLayout ? "-outline-offset-2" : "outline-offset-2";

  return (
    <main
      data-transition-speed={transitionSpeed}
      className={`flex h-dvh w-full flex-col overflow-hidden ${deskLayout}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void addFiles([...event.dataTransfer.files]);
      }}
    >
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-panel ${panelFrame} ${dragOver ? `outline outline-2 outline-copper ${dropOutlineOffset}` : ""}`}>
        <header className={`flex h-12 shrink-0 items-center gap-2 border-b border-line bg-raised px-3 ${desktopLayout ? "cadence-titlebar" : ""}`}>
          <span className="size-2 shrink-0 rounded-full bg-copper" aria-hidden="true" />
          <h1 className="font-mono text-sm tracking-[0.18em] text-fg">CADENCE</h1>
          <div className="cadence-titlebar-controls ml-auto flex shrink-0 items-center gap-2">
            <FinishToggle />
            <AppearanceMenu refElement={settingsRef} />
            {windowControls && (
              <div role="group" aria-label="Window controls" className="flex items-center border-l border-line pl-1">
                <button type="button" aria-label="Minimize window" title="Minimize" onClick={windowControls.minimize} className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-fg">
                  <Minus className="size-3.5" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Close window" title="Close" onClick={windowControls.close} className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-fg">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </header>

        <nav ref={navRef} aria-label="Player views" className="flex shrink-0 gap-1 border-b border-line bg-lcd px-2 pt-2">
          {(["player", "eq", "playlist"] as const).map((target) => (
            <button
              key={target}
              type="button"
              aria-controls={`view-${target}`}
              aria-pressed={view === target}
              onClick={() => switchView(target)}
              className={`min-h-10 flex-1 border-b-2 px-1 font-mono text-xs uppercase tracking-widest transition-colors ${view === target ? "border-copper text-copper" : "border-transparent text-muted hover:text-fg"}`}
            >
              {target === "eq" ? "EQ" : target}
            </button>
          ))}
        </nav>

        <div className="cadence-viewport min-h-0 flex-1 overflow-clip bg-panel">
          <div className="cadence-view-track flex h-full" style={{ transform: `translateX(-${VIEW_INDEX[view] * 100}%)` }}>
            <section id="view-player" aria-hidden={view !== "player"} inert={view !== "player"} className="cadence-view">
              <div className="mb-4 border-b border-line pb-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">01 / Transport</p>
                <h2 className="mt-1 text-2xl font-semibold">Player</h2>
              </div>
              <Transport
                onToggleEq={() => switchView("eq")}
                onTogglePl={() => switchView("playlist")}
                onOpen={() => fileRef.current?.click()}
              />
              <p className="mt-auto pt-5 font-mono text-xs text-muted">Drop audio anywhere on the desk to add it.</p>
            </section>

            <section id="view-eq" aria-label="Equalizer" aria-hidden={view !== "eq"} inert={view !== "eq"} className={`cadence-view ${view === "eq" ? "is-active" : ""}`}>
              <div className={`eq-mark mb-5 border-b border-line pb-3 ${view === "eq" ? "is-active" : ""}`}>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">02 / Sound</p>
                <div className="relative inline-flex items-center py-1" aria-label="Equalizer">
                  <span className="eq-note eq-note-left" aria-hidden="true">♪</span>
                  <h2 className="eq-wordmark">EQ</h2>
                  <span className="eq-note eq-note-right" aria-hidden="true">♫</span>
                </div>
                <p className="text-sm text-muted">Shape the sound with ten live bands.</p>
              </div>
              <div className="eq-controls"><Equalizer /></div>
            </section>

            <section id="view-playlist" aria-hidden={view !== "playlist"} inert={view !== "playlist"} className="cadence-view">
              <div className="mb-4 border-b border-line pb-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">03 / Queue</p>
                <h2 className="mt-1 text-2xl font-semibold">Playlist</h2>
              </div>
              <Playlist />
            </section>
          </div>
        </div>
      </div>

      <div className={desktopLayout ? "shrink-0 px-4 [&>p:last-child]:pb-2" : "shrink-0"}>
        {(busy || !desktopLayout) && (
          <p className="mt-2 font-mono text-xs text-muted">
            {busy ? "Working the library…" : "One desk · E for EQ · P for playlist · Esc for player"}
          </p>
        )}
        {error ? <p className="mt-1 text-sm text-copper">{error}</p> : null}
        {!ready ? <p className="mt-1 text-sm text-muted">Opening the desk…</p> : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm,.opus"
        multiple
        className="hidden"
        onChange={(event) => {
          const list = event.target.files;
          if (list) void addFiles([...list]);
          event.target.value = "";
        }}
      />
    </main>
  );
}

function AppearanceMenu({ refElement }: { refElement: RefObject<HTMLDetailsElement | null> }) {
  const transitionSpeed = useDesk((s) => s.transitionSpeed);
  const setTransitionSpeed = useDesk((s) => s.setTransitionSpeed);
  return (
    <details ref={refElement} className="relative z-10">
      <summary aria-label="Appearance settings" title="Appearance settings" className="flex size-9 list-none items-center justify-center rounded-sm border border-line text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <Settings2 className="size-4" />
      </summary>
      <div className="absolute right-0 top-10 w-64 rounded-md border border-line bg-raised p-4 shadow-xl">
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-copper">Appearance</p>
        <label htmlFor="transition-speed" className="block text-sm font-medium">Transition speed</label>
        <p className="mb-2 text-xs leading-5 text-muted">Choose how quickly Cadence moves between Player, Playlist, and EQ.</p>
        <select
          id="transition-speed"
          value={transitionSpeed}
          onChange={(event) => setTransitionSpeed(event.target.value as TransitionSpeed)}
          className="min-h-10 w-full rounded-sm border border-line bg-lcd px-2 text-sm text-fg"
        >
          <option value="off">Off — instant</option>
          <option value="quick">Quick — 120 ms</option>
          <option value="normal">Normal — 240 ms (default)</option>
          <option value="smooth">Smooth — 400 ms</option>
        </select>
        <p className="mt-2 text-xs leading-5 text-muted">Your device’s reduced motion setting turns these animations off.</p>
      </div>
    </details>
  );
}

function FinishToggle() {
  const finish = useDesk((s) => s.finish);
  const setFinish = useDesk((s) => s.setFinish);
  const options: Finish[] = ["carbon", "brass"];
  return (
    <div className="flex" onDoubleClick={(event) => event.stopPropagation()}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={finish === option}
          onClick={() => setFinish(option)}
          className={`px-1.5 font-mono text-[10px] uppercase tracking-wider ${finish === option ? "text-copper" : "text-muted"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Transport({
  onOpen,
  onToggleEq,
  onTogglePl,
}: {
  onOpen: () => void;
  onToggleEq: () => void;
  onTogglePl: () => void;
}) {
  const tracks = useDesk((s) => s.tracks);
  const currentId = useDesk((s) => s.currentId);
  const playing = useDesk((s) => s.playing);
  const currentTime = useDesk((s) => s.currentTime);
  const duration = useDesk((s) => s.duration);
  const volume = useDesk((s) => s.volume);
  const muted = useDesk((s) => s.muted);
  const shuffle = useDesk((s) => s.shuffle);
  const repeat = useDesk((s) => s.repeat);
  const toggle = useDesk((s) => s.toggle);
  const next = useDesk((s) => s.next);
  const prev = useDesk((s) => s.prev);
  const seek = useDesk((s) => s.seek);
  const setVolume = useDesk((s) => s.setVolume);
  const toggleMute = useDesk((s) => s.toggleMute);
  const toggleShuffle = useDesk((s) => s.toggleShuffle);
  const cycleRepeat = useDesk((s) => s.cycleRepeat);
  const current = tracks.find((track) => track.id === currentId);
  const shownDuration = duration || current?.duration || 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="rounded-sm bg-lcd px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-2xl text-copper">{formatTime(currentTime)}</p>
          <p className="font-mono text-xs text-muted">{formatTime(shownDuration)}</p>
        </div>
        <p className="truncate text-sm">{current?.title ?? "Nothing queued"}</p>
        <Scope active={playing} />
      </div>

      <input
        className="seek"
        type="range"
        min={0}
        max={shownDuration || 0}
        step={0.1}
        value={Math.min(currentTime, shownDuration || 0)}
        aria-label="Position"
        disabled={!shownDuration}
        onChange={(event) => seek(Number(event.target.value))}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <IconButton label="Previous" onClick={() => void prev()}>
          <SkipBack />
        </IconButton>
        <IconButton label={playing ? "Pause" : "Play"} onClick={() => void toggle()} primary>
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton
          label="Stop"
          onClick={() => {
            engine.pause();
            engine.seek(0);
            useDesk.setState({ playing: false, currentTime: 0 });
          }}
        >
          <Square />
        </IconButton>
        <IconButton label="Next" onClick={() => void next()}>
          <SkipForward />
        </IconButton>
        <IconButton label={shuffle ? "Shuffle on" : "Shuffle off"} pressed={shuffle} onClick={toggleShuffle}>
          <Shuffle />
        </IconButton>
        <IconButton
          label={repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off"}
          pressed={repeat !== "off"}
          onClick={cycleRepeat}
        >
          {repeat === "one" ? <Repeat1 /> : <Repeat />}
        </IconButton>
        <IconButton label="Open equalizer" onClick={onToggleEq}>
          <span className="font-mono text-[11px] tracking-wide">EQ</span>
        </IconButton>
        <IconButton label="Open playlist" onClick={onTogglePl}>
          <span className="font-mono text-[11px] tracking-wide">PL</span>
        </IconButton>
        <IconButton label="Add audio" onClick={onOpen}>
          <Upload />
        </IconButton>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="text-muted" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
          {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </button>
        <input
          className="vol"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          aria-label="Volume"
          onChange={(event) => setVolume(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
  primary,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line [&_svg]:size-4 ${primary ? "bg-copper text-lcd" : pressed ? "bg-raised text-copper" : "bg-raised text-fg"}`}
    >
      {children}
    </button>
  );
}

function Scope({ active }: { active: boolean }) {
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.08));

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!reduce) frame = requestAnimationFrame(tick);
      if (now - last < 80 && !reduce) return;
      last = now;
      const data = active ? engine.bars() : null;
      setLevels(
        Array.from({ length: 24 }, (_, i) => {
          if (!data) return 0.08;
          return (data[Math.floor((i / 24) * data.length)] ?? 0) / 255;
        }),
      );
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className="mt-2 flex h-12 items-end gap-px" aria-hidden="true">
      {levels.map((level, index) => (
        <span
          key={index}
          className="min-w-0 flex-1 bg-copper"
          style={{ height: `${Math.max(8, level * 100)}%`, opacity: 0.35 + level * 0.65 }}
        />
      ))}
    </div>
  );
}

function Equalizer() {
  const bands = useDesk((s) => s.bands);
  const setBand = useDesk((s) => s.setBand);
  const applyPreset = useDesk((s) => s.applyPreset);
  const activeProfile = EQ_PROFILES.find(([, gains]) =>
    gains.length === bands.length && gains.every((gain, index) => gain === bands[index]),
  )?.[0] ?? "";

  return (
    <div className="min-w-0">
      <label className="mb-4 flex items-center gap-3">
        <span className="shrink-0 text-sm text-muted">EQ profile</span>
        <select
          value={activeProfile}
          onChange={(event) => applyPreset(event.currentTarget.value)}
          className="min-h-10 min-w-0 flex-1 rounded-sm border border-line bg-lcd px-2 text-sm text-fg scheme-dark"
        >
          <option value="" disabled>Custom</option>
          {EQ_PROFILES.map(([name]) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-10 gap-px">
        {BANDS.map((freq, index) => (
          <VSlider
            key={freq}
            label={`${BAND_LABELS[index]} hertz`}
            caption={BAND_LABELS[index] ?? ""}
            value={bands[index] ?? 0}
            onChange={(gain) => setBand(index, gain)}
          />
        ))}
      </div>
    </div>
  );
}

function VSlider({
  value,
  onChange,
  label,
  caption,
}: {
  value: number;
  onChange: (gain: number) => void;
  label: string;
  caption: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const min = -12;
  const max = 12;

  function fromClientY(clientY: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = 1 - (clientY - rect.top) / rect.height;
    const next = min + Math.min(1, Math.max(0, ratio)) * (max - min);
    onChange(Math.round(next));
  }

  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-1">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} dB`}
        aria-orientation="vertical"
        className="relative h-24 w-full touch-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fromClientY(event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromClientY(event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            onChange(Math.min(max, value + 1));
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            onChange(Math.max(min, value - 1));
          }
        }}
      >
        <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-lcd" />
        <span
          className="absolute left-1/2 w-1 -translate-x-1/2 bg-copper"
          style={{
            bottom: `${Math.min(percent, 50)}%`,
            height: `${Math.abs(percent - 50)}%`,
          }}
        />
        <span
          className="absolute left-1/2 size-3.5 -translate-x-1/2 rounded-full bg-copper"
          style={{ bottom: `calc(${percent}% - 0.4375rem)` }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted">{caption}</span>
    </div>
  );
}

function Playlist() {
  const tracks = useDesk((s) => s.tracks);
  const currentId = useDesk((s) => s.currentId);
  const query = useDesk((s) => s.query);
  const setQuery = useDesk((s) => s.setQuery);
  const playId = useDesk((s) => s.playId);
  const remove = useDesk((s) => s.remove);
  const shown = tracks.filter((track) => track.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter"
          aria-label="Filter playlist"
          className="min-h-9 min-w-0 flex-1 rounded-sm border border-line px-2 text-sm"
        />
        <span className="font-mono text-xs text-muted">{tracks.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="px-1 py-4 text-sm text-muted">
          {tracks.length === 0 ? "Drop audio onto the desk, or use the upload button." : "Nothing matches that filter."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((track, index) => {
            const active = track.id === currentId;
            return (
              <li key={track.id} className={`flex items-center gap-1 border-t border-line ${active ? "bg-raised" : ""}`}>
                <button
                  type="button"
                  onClick={() => void playId(track.id)}
                  className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 px-1 text-left text-sm ${active ? "text-copper" : "text-fg"}`}
                >
                  <span className="w-5 font-mono text-[10px] text-muted">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{track.title}</span>
                  <span className="font-mono text-[10px] text-muted">{formatTime(track.duration)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${track.title}`}
                  onClick={() => void remove(track.id)}
                  className="inline-flex h-10 w-8 items-center justify-center text-muted"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
