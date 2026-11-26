import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Minus,
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
import { BAND_LABELS, BANDS, PRESETS, formatTime } from "@/lib/cadence/types";
import { SKINS, resolveTokens, type SkinTokens } from "@/lib/cadence/skins";

const PANES_KEY = "cadence-panes";

type Panes = {
  eq: boolean;
  pl: boolean;
  sk: boolean;
  shadeMain: boolean;
  shadeEq: boolean;
  shadePl: boolean;
  shadeSk: boolean;
};

function loadPanes(): Panes {
  const base: Panes = { eq: true, pl: true, sk: false, shadeMain: false, shadeEq: false, shadePl: false, shadeSk: false };
  try {
    const raw = JSON.parse(localStorage.getItem(PANES_KEY) || "") as Partial<Panes>;
    return {
      eq: raw.eq !== false,
      pl: raw.pl !== false,
      sk: Boolean(raw.sk),
      shadeMain: Boolean(raw.shadeMain),
      shadeEq: Boolean(raw.shadeEq),
      shadePl: Boolean(raw.shadePl),
      shadeSk: Boolean(raw.shadeSk),
    };
  } catch {
    return base;
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function Desk() {
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
  const [dragOver, setDragOver] = useState(false);
  const [panes, setPanes] = useState<Panes>({
    eq: true,
    pl: true,
    sk: false,
    shadeMain: false,
    shadeEq: false,
    shadePl: false,
    shadeSk: false,
  });
  const panesLoaded = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setPanes(loadPanes());
    panesLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!panesLoaded.current) return;
    localStorage.setItem(PANES_KEY, JSON.stringify(panes));
  }, [panes]);

  function patch(nextPanes: Partial<Panes>) {
    setPanes((current) => ({ ...current, ...nextPanes }));
  }

  function toggleEq() {
    setPanes((current) => ({ ...current, eq: !current.eq, shadeEq: current.eq ? current.shadeEq : false }));
  }

  function togglePl() {
    setPanes((current) => ({ ...current, pl: !current.pl, shadePl: current.pl ? current.shadePl : false }));
  }

  function toggleSk() {
    setPanes((current) => ({ ...current, sk: !current.sk, shadeSk: current.sk ? current.shadeSk : false }));
  }

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
      } else if (event.key === "e") {
        toggleEq();
      } else if (event.key === "p") {
        togglePl();
      } else if (event.key === "k") {
        toggleSk();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleRepeat, next, prev, seek, setVolume, toggle, toggleMute, toggleShuffle]);

  return (
    <main
      className="mx-auto flex h-dvh w-full max-w-[30rem] flex-col overflow-hidden px-2 py-3 sm:px-4 sm:py-6"
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
      <div className={`flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-md bg-lcd p-1 ${dragOver ? "outline outline-2 outline-offset-2 outline-copper" : ""}`}>
        <Compartment
          title="CADENCE"
          shaded={panes.shadeMain}
          onToggleShade={() => patch({ shadeMain: !panes.shadeMain })}
          extra={<SkinButton open={panes.sk} onClick={toggleSk} />}
        >
          <Transport
            eqOpen={panes.eq}
            plOpen={panes.pl}
            onToggleEq={toggleEq}
            onTogglePl={togglePl}
            onOpen={() => fileRef.current?.click()}
          />
        </Compartment>

        {panes.eq ? (
          <Compartment
            title="EQUALIZER"
            shaded={panes.shadeEq}
            onToggleShade={() => patch({ shadeEq: !panes.shadeEq })}
            onClose={() => patch({ eq: false })}
          >
            <Equalizer />
          </Compartment>
        ) : null}

        {panes.sk ? (
          <Compartment
            title="SKINS"
            shaded={panes.shadeSk}
            onToggleShade={() => patch({ shadeSk: !panes.shadeSk })}
            onClose={() => patch({ sk: false })}
          >
            <SkinBrowser />
          </Compartment>
        ) : null}

        {panes.pl ? (
          <Compartment
            title="PLAYLIST"
            shaded={panes.shadePl}
            onToggleShade={() => patch({ shadePl: !panes.shadePl })}
            onClose={() => patch({ pl: false })}
            className={panes.shadePl ? "" : "min-h-0 flex-1"}
          >
            <Playlist />
          </Compartment>
        ) : null}
      </div>

      <p className="mt-2 shrink-0 font-mono text-xs text-muted">
        {busy ? "Working the library…" : "EQ and PL open their own windows. Double-click a bar to shade it."}
      </p>
      {error ? <p className="mt-1 text-sm text-copper">{error}</p> : null}
      {!ready ? <p className="mt-1 text-sm text-muted">Opening the desk…</p> : null}

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

function Compartment({
  title,
  shaded,
  onToggleShade,
  onClose,
  extra,
  className,
  children,
}: {
  title: string;
  shaded: boolean;
  onToggleShade: () => void;
  onClose?: () => void;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col border border-line bg-panel ${className ?? ""}`}>
      <header
        className="flex h-8 shrink-0 select-none items-center gap-2 border-b border-line bg-raised px-2"
        onDoubleClick={onToggleShade}
      >
        <span className="size-2 shrink-0 rounded-full bg-copper" aria-hidden />
        <h2 className="font-mono text-[11px] tracking-[0.18em] text-muted">{title}</h2>
        {extra}
        <div className="ml-auto flex items-center">
          <button
            type="button"
            aria-label={shaded ? `Expand ${title}` : `Shade ${title}`}
            title={shaded ? "Expand" : "Shade"}
            onClick={onToggleShade}
            onDoubleClick={(event) => event.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center text-muted"
          >
            {shaded ? <ChevronDown className="size-3.5" /> : <Minus className="size-3.5" />}
          </button>
          {onClose ? (
            <button
              type="button"
              aria-label={`Close ${title}`}
              title="Close"
              onClick={onClose}
              onDoubleClick={(event) => event.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center text-muted"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </header>
      {shaded ? null : <div className="flex min-h-0 flex-1 flex-col p-3">{children}</div>}
    </section>
  );
}

function SkinButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onClick}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`ml-1 font-mono text-[10px] uppercase tracking-wider ${open ? "text-copper" : "text-muted"}`}
    >
      Skin
    </button>
  );
}

const PAINTS: { key: keyof SkinTokens; label: string }[] = [
  { key: "accent", label: "Accent" },
  { key: "lcd", label: "LCD" },
  { key: "lcdText", label: "Digits" },
  { key: "pl", label: "List" },
  { key: "plCurrent", label: "Now" },
  { key: "visLo", label: "Vis low" },
  { key: "visHi", label: "Vis high" },
];

function SkinBrowser() {
  const skin = useDesk((s) => s.skin);
  const custom = useDesk((s) => s.custom);
  const setSkin = useDesk((s) => s.setSkin);
  const paint = useDesk((s) => s.paint);
  const tokens = resolveTokens(skin, custom);

  return (
    <div className="flex flex-col gap-3">
      <div>
        {SKINS.map((entry) => (
          <SkinRow key={entry.id} name={entry.name} tokens={entry.tokens} pressed={skin === entry.id} onClick={() => setSkin(entry.id)} />
        ))}
        <SkinRow name="Custom" tokens={custom ?? tokens} pressed={skin === "custom"} onClick={() => setSkin("custom")} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PAINTS.map((field) => (
          <label key={field.key} className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-mono text-[10px] uppercase tracking-wide text-muted">{field.label}</span>
            <input
              type="color"
              aria-label={field.label}
              value={tokens[field.key]}
              onChange={(event) => paint(field.key, event.target.value)}
              className="h-8 w-full cursor-pointer border border-line bg-transparent"
            />
          </label>
        ))}
      </div>
      <p className="font-mono text-[10px] leading-4 text-muted">
        A classic skin was a zip of window art plus two text files: playlist colors, and the 24 analyzer colors. These controls are those files. The pictures are not loaded.
      </p>
    </div>
  );
}

function SkinRow({
  name,
  tokens,
  pressed,
  onClick,
}: {
  name: string;
  tokens: SkinTokens;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex min-h-9 w-full items-center gap-3 border-t border-line px-1 text-left ${pressed ? "bg-raised" : ""}`}
    >
      <span className={`w-20 font-mono text-[11px] uppercase tracking-wide ${pressed ? "text-copper" : "text-fg"}`}>{name}</span>
      <span className="flex h-3 min-w-0 flex-1 overflow-hidden" aria-hidden>
        {[tokens.panel, tokens.lcd, tokens.lcdText, tokens.accent, tokens.visLo, tokens.visHi, tokens.plBg, tokens.plCurrent].map((color, index) => (
          <span key={index} className="h-full flex-1" style={{ background: color }} />
        ))}
      </span>
    </button>
  );
}

function Transport({
  onOpen,
  eqOpen,
  plOpen,
  onToggleEq,
  onTogglePl,
}: {
  onOpen: () => void;
  eqOpen: boolean;
  plOpen: boolean;
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
          <p className="font-mono text-2xl" style={{ color: "var(--color-lcd-ink)" }}>{formatTime(currentTime)}</p>
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
        <IconButton label={eqOpen ? "Close equalizer" : "Open equalizer"} pressed={eqOpen} onClick={onToggleEq}>
          <span className="font-mono text-[11px] tracking-wide">EQ</span>
        </IconButton>
        <IconButton label={plOpen ? "Close playlist" : "Open playlist"} pressed={plOpen} onClick={onTogglePl}>
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
          className="min-w-0 flex-1"
          style={{
            height: `${Math.max(8, level * 100)}%`,
            opacity: 0.45 + level * 0.55,
            background: "linear-gradient(to top, var(--vis-lo), var(--vis-hi))",
          }}
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
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap gap-1">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => applyPreset(name)}
            className="min-h-9 rounded-sm px-2 font-mono text-[11px] uppercase tracking-wide text-muted hover:text-fg"
          >
            {name}
          </button>
        ))}
      </div>
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
          if (event.key === "ArrowUp" || event.key === "ArrowRight") onChange(Math.min(max, value + 1));
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") onChange(Math.max(min, value - 1));
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
        <ul className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--color-pl-bg)" }}>
          {shown.map((track, index) => {
            const active = track.id === currentId;
            return (
              <li
                key={track.id}
                className="flex items-center gap-1 border-t border-line"
                style={{
                  background: active ? "var(--color-pl-selected)" : "transparent",
                  color: active ? "var(--color-pl-current)" : "var(--color-pl)",
                }}
              >
                <button
                  type="button"
                  onClick={() => void playId(track.id)}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-1 text-left text-sm text-inherit"
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
