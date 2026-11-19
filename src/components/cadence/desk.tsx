import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
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
import { BAND_LABELS, BANDS, PRESETS, formatTime, type Finish } from "@/lib/cadence/types";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function Desk() {
  const ready = useDesk((s) => s.ready);
  const busy = useDesk((s) => s.busy);
  const activity = useDesk((s) => s.activity);
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
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleRepeat, next, prev, seek, setVolume, toggle, toggleMute, toggleShuffle]);

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-3 py-4 md:px-6 md:py-8"
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
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.22em] text-copper">DESK</p>
          <h1 className="text-3xl font-semibold tracking-tight">CADENCE</h1>
        </div>
        <FinishToggle />
      </header>

      <div
        className={`grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.8fr)] ${dragOver ? "outline outline-2 outline-offset-4 outline-copper" : ""}`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <Transport onOpen={() => fileRef.current?.click()} />
          <Equalizer />
        </div>
        <Playlist />
      </div>

      {activity ? (
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <p className="font-mono text-xs text-copper">{activity.label}</p>
          <div
            className="h-1 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label={activity.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={activity.progress ?? undefined}
          >
            <div
              className={`h-full bg-copper ${activity.progress == null ? "w-1/3 animate-pulse" : ""}`}
              style={activity.progress == null ? undefined : { width: `${activity.progress}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="font-mono text-xs text-muted">
          {busy
            ? "Working the library…"
            : "Files stay in this browser. Space plays. Arrows seek and set volume."}
        </p>
      )}
      {error ? <p className="text-sm text-copper">{error}</p> : null}
      {!ready ? <p className="text-sm text-muted">Opening the desk…</p> : null}

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

function FinishToggle() {
  const finish = useDesk((s) => s.finish);
  const setFinish = useDesk((s) => s.setFinish);
  const options: Finish[] = ["carbon", "brass"];
  return (
    <div className="flex rounded-full border border-line bg-panel p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={finish === option}
          onClick={() => setFinish(option)}
          className={`min-h-11 rounded-full px-4 text-sm capitalize ${finish === option ? "bg-raised text-fg" : "text-muted"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Transport({ onOpen }: { onOpen: () => void }) {
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
    <section className="min-w-0 rounded-xl border border-line bg-panel p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-fg)_8%,transparent)]">
      <div className="grid gap-3 md:grid-cols-[7.5rem_minmax(0,1fr)]">
        <div className="flex h-16 items-center justify-center rounded-lg bg-lcd font-mono text-2xl text-copper">
          {formatTime(currentTime)}
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <p className="truncate text-lg font-medium">{current?.title ?? "Nothing queued"}</p>
          <p className="font-mono text-xs text-muted">{formatTime(shownDuration)}</p>
        </div>
      </div>

      <Scope active={playing} />

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

      <div className="mt-2 flex flex-wrap items-center gap-2">
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
        <IconButton
          label={shuffle ? "Shuffle on" : "Shuffle off"}
          pressed={shuffle}
          onClick={toggleShuffle}
        >
          <Shuffle />
        </IconButton>
        <IconButton
          label={repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off"}
          pressed={repeat !== "off"}
          onClick={cycleRepeat}
        >
          {repeat === "one" ? <Repeat1 /> : <Repeat />}
        </IconButton>
        <IconButton label="Add audio" onClick={onOpen}>
          <Upload />
        </IconButton>
        <div className="ml-auto flex min-w-36 flex-1 items-center gap-2 md:max-w-48">
          <button
            type="button"
            className="text-muted"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={toggleMute}
          >
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
    </section>
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
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line [&_svg]:size-5 ${primary ? "bg-copper text-lcd" : pressed ? "bg-raised text-copper" : "bg-raised text-fg"}`}
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
    <div className="mt-3 flex h-16 items-end gap-1" aria-hidden="true">
      {levels.map((level, index) => (
        <span
          key={index}
          className="min-w-0 flex-1 rounded-sm bg-copper"
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

  return (
    <section className="min-w-0 rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xs tracking-[0.18em] text-muted">EQUALIZER</h2>
        <div className="flex flex-wrap gap-1">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => applyPreset(name)}
              className="min-h-11 rounded-full px-3 text-sm text-muted hover:text-fg"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1 md:grid-cols-10">
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
    </section>
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
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-orientation="vertical"
        className="relative h-28 w-11 touch-none md:h-36"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fromClientY(event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromClientY(event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight")
            onChange(Math.min(max, value + 1));
          if (event.key === "ArrowDown" || event.key === "ArrowLeft")
            onChange(Math.max(min, value - 1));
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
          className="absolute left-1/2 size-4 -translate-x-1/2 rounded-full bg-copper"
          style={{ bottom: `calc(${percent}% - 0.5rem)` }}
        />
      </div>
      <span className="font-mono text-xs text-muted">{caption}</span>
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
  const shown = tracks.filter((track) =>
    track.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <section className="flex min-h-80 min-w-0 flex-col rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs tracking-[0.18em] text-muted">PLAYLIST</h2>
        <span className="font-mono text-xs text-muted">{tracks.length}</span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter"
        aria-label="Filter playlist"
        className="mb-3 min-h-11 rounded-lg border border-line px-3"
      />
      {shown.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted">
          {tracks.length === 0
            ? "Drop audio onto the desk, or use the upload button."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <ul className="max-h-[50vh] overflow-y-auto md:max-h-[36rem]">
          {shown.map((track, index) => {
            const active = track.id === currentId;
            return (
              <li
                key={track.id}
                className={`flex items-center gap-2 border-t border-line ${active ? "bg-raised" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => void playId(track.id)}
                  className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 px-2 text-left ${active ? "text-copper" : "text-fg"}`}
                >
                  <span className="w-6 font-mono text-xs text-muted">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{track.title}</span>
                  <span className="font-mono text-xs text-muted">{formatTime(track.duration)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${track.title}`}
                  onClick={() => void remove(track.id)}
                  className="inline-flex h-11 w-11 items-center justify-center text-muted"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
