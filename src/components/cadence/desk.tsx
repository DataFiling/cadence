import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import {
  Minus,
  PanelTopClose,
  PanelTopOpen,
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
import { BAND_LABELS, BANDS, PRESETS, formatTime, type TransitionSpeed } from "@/lib/cadence/types";
import { SkinMenu } from "./skin-menu";
import { CADENCE_VIEWS, ViewTitle, type CadenceView } from "./view-title";

type CompactPanels = { equalizer: boolean; playlist: boolean };

const COMPACT_PANELS = [
  { key: "equalizer", label: "Equalizer", short: "EQ" },
  { key: "playlist", label: "Playlist", short: "PL" },
] as const;

type DesktopWindowControls = {
  minimize: () => void;
  close: () => void;
  setCompactMode?: (compact: boolean, panels?: CompactPanels) => void;
  getOpenFilesInExistingPlayer?: () => Promise<boolean>;
  setOpenFilesInExistingPlayer?: (enabled: boolean) => Promise<boolean>;
  onOpenFiles?: (listener: (files: { name: string; url: string }[]) => void) => () => void;
};

declare global {
  interface Window {
    cadenceWindow?: DesktopWindowControls;
  }
}

const VIEW_INDEX: Record<CadenceView, number> = { player: 0, eq: 1, playlist: 2 };
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
  const [view, setView] = useState<CadenceView>("player");
  const [compact, setCompact] = useState(false);
  const [compactPanels, setCompactPanels] = useState<CompactPanels>({ equalizer: false, playlist: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const fileActionRef = useRef<"open" | "queue">("open");
  const navRef = useRef<HTMLElement>(null);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const skinsRef = useRef<HTMLDetailsElement>(null);
  const compactToggleRef = useRef<HTMLButtonElement>(null);
  const compactPanelButtons = useRef<Partial<Record<keyof CompactPanels, HTMLButtonElement | null>>>({});
  const desktopImports = useRef(Promise.resolve());

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    return windowControls?.onOpenFiles?.((openedFiles) => {
      desktopImports.current = desktopImports.current.then(async () => {
        const files: File[] = [];
        for (const { name, url } of openedFiles) {
          try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const blob = await response.blob();
            files.push(new File([blob], name, { type: blob.type }));
          } catch {
            // Other files in the selection may still open successfully.
          }
        }
        if (files.length) await addFiles(files);
        if (files.length < openedFiles.length && !useDesk.getState().error) {
          useDesk.setState({ error: "Cadence couldn’t open some of the selected audio files." });
        }
      });
    });
  }, [addFiles, windowControls]);

  useEffect(() => {
    windowControls?.setCompactMode?.(compact, compactPanels);
  }, [compact, compactPanels, windowControls]);

  const switchView = useCallback((target: CadenceView) => {
    setView((current) => current === target && target !== "player" ? "player" : target);
    if (settingsRef.current) settingsRef.current.open = false;
    if (skinsRef.current) skinsRef.current.open = false;
  }, []);

  const changeCompactMode = useCallback((enabled: boolean) => {
    setCompact(enabled);
    if (settingsRef.current) settingsRef.current.open = false;
    if (skinsRef.current) skinsRef.current.open = false;
    compactToggleRef.current?.focus({ preventScroll: true });
  }, []);

  function setCompactPanel(panel: keyof CompactPanels, open: boolean) {
    setCompactPanels((current) => ({ ...current, [panel]: open }));
    if (!open) compactPanelButtons.current[panel]?.focus({ preventScroll: true });
  }

  function chooseAudio(action: "open" | "queue") {
    fileActionRef.current = action;
    fileRef.current?.click();
  }

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
        const openMenu = [settingsRef.current, skinsRef.current].find((menu) => menu?.open);
        if (openMenu) {
          openMenu.open = false;
          openMenu.querySelector("summary")?.focus();
        } else if (compact) {
          changeCompactMode(false);
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
      } else if (!compact && event.key === "e" && !event.repeat) {
        switchView("eq");
      } else if (!compact && event.key === "p" && !event.repeat) {
        switchView("playlist");
      } else if (!compact && event.key === "k" && !event.repeat && skinsRef.current) {
        skinsRef.current.open = !skinsRef.current.open;
        skinsRef.current.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeCompactMode, compact, cycleRepeat, next, prev, seek, setVolume, switchView, toggle, toggleMute, toggleShuffle]);

  const deskLayout = desktopLayout ? "bg-panel" : "mx-auto max-w-[34rem] px-2 py-3 sm:px-4 sm:py-6";
  const panelFrame = desktopLayout ? "" : "rounded-lg border border-line shadow-2xl";
  const dropOutlineOffset = desktopLayout ? "-outline-offset-2" : "outline-offset-2";
  const compactToggleLabel = compact ? "Expand player" : "Compact mode";
  const compactStatus = error ?? (busy || !ready ? "Working the library…" : undefined);

  return (
    <main
      data-transition-speed={transitionSpeed}
      className={`flex w-full flex-col overflow-hidden ${!compact || desktopLayout ? "h-dvh" : ""} ${deskLayout}`}
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
        <header className={`relative flex shrink-0 items-center gap-2 border-b border-line bg-raised px-3 ${compact ? "h-9" : "h-12"} ${desktopLayout ? "cadence-titlebar" : ""}`}>
          <span className="size-2 shrink-0 rounded-full bg-copper" aria-hidden="true" />
          <h1 className="font-mono text-sm tracking-[0.18em] text-fg">CADENCE</h1>
          <div className="cadence-titlebar-controls ml-auto flex shrink-0 items-center gap-2">
            {compact ? (
              <div role="group" aria-label="Compact panels" className="flex items-center gap-1">
                {COMPACT_PANELS.map(({ key, label, short }) => (
                  <button
                    key={key}
                    ref={(button) => { compactPanelButtons.current[key] = button; }}
                    type="button"
                    aria-label={label}
                    aria-controls={`compact-${key}`}
                    aria-expanded={compactPanels[key]}
                    title={label}
                    onClick={() => setCompactPanel(key, !compactPanels[key])}
                    className="h-7 w-8 rounded-sm border border-line bg-panel font-mono text-[11px] text-muted hover:text-fg aria-expanded:border-copper aria-expanded:text-copper"
                  >
                    {short}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <SkinMenu refElement={skinsRef} onOpen={() => {
                  if (settingsRef.current) settingsRef.current.open = false;
                }} />
                <PlayerSettings refElement={settingsRef} windowControls={windowControls} onOpen={() => {
                  if (skinsRef.current) skinsRef.current.open = false;
                }} />
              </>
            )}
            <button
              ref={compactToggleRef}
              type="button"
              aria-label={compactToggleLabel}
              title={compactToggleLabel}
              onClick={() => changeCompactMode(!compact)}
              className={`flex ${compact ? "size-7" : "size-9 border border-line"} items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-fg`}
            >
              {compact ? <PanelTopOpen className="size-4" aria-hidden="true" /> : <PanelTopClose className="size-4" aria-hidden="true" />}
            </button>
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

        {compact ? (
          <>
            <Transport compact status={compactStatus} />
            <div className="min-h-0 overflow-y-auto">
              {COMPACT_PANELS.map(({ key, label }) => (
                <CompactPanel key={key} panel={key} label={label} open={compactPanels[key]} onClose={() => setCompactPanel(key, false)}>
                  {key === "equalizer" ? <Equalizer /> : <Playlist onAdd={() => chooseAudio("queue")} />}
                </CompactPanel>
              ))}
            </div>
          </>
        ) : (
          <>
            <nav ref={navRef} aria-label="Player views" className="flex shrink-0 gap-1 border-b border-line bg-lcd px-2 pt-2">
              {(["player", "eq", "playlist"] as const).map((target) => (
                <button
                  key={target}
                  type="button"
                  aria-controls={`view-${target}`}
                  aria-pressed={view === target}
                  onClick={() => switchView(target)}
                  className={`min-h-10 flex-1 border-b-2 px-1 font-mono text-xs uppercase tracking-widest text-lcd-ink transition-colors ${view === target ? "border-copper" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  {CADENCE_VIEWS[target].label}
                </button>
              ))}
            </nav>

            <div className="cadence-viewport min-h-0 flex-1 overflow-clip bg-panel">
              <div className="cadence-view-track flex h-full" style={{ transform: `translateX(-${VIEW_INDEX[view] * 100}%)` }}>
                <section id="view-player" aria-hidden={view !== "player"} inert={view !== "player"} className="cadence-view">
                  <ViewTitle view="player" active={view === "player"} />
                  <Transport
                    onToggleEq={() => switchView("eq")}
                    onTogglePl={() => switchView("playlist")}
                    onOpen={() => chooseAudio("open")}
                  />
                  <p className="mt-auto pt-5 font-mono text-xs text-muted">Drop audio anywhere on the desk to open it.</p>
                </section>

                <section id="view-eq" aria-label="Equalizer" aria-hidden={view !== "eq"} inert={view !== "eq"} className="cadence-view">
                  <ViewTitle view="eq" active={view === "eq"} />
                  <Equalizer />
                </section>

                <section id="view-playlist" aria-hidden={view !== "playlist"} inert={view !== "playlist"} className="cadence-view">
                  <ViewTitle view="playlist" active={view === "playlist"} />
                  <Playlist onAdd={() => chooseAudio("queue")} />
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {!compact && (
        <div className={desktopLayout ? "shrink-0 px-4 [&>p:last-child]:pb-2" : "shrink-0"}>
          {(busy || !desktopLayout) && (
            <p className="mt-2 font-mono text-xs text-muted">
              {busy ? "Working the library…" : "One desk · E for EQ · P for playlist · Esc for player"}
            </p>
          )}
          {error ? <p className="mt-1 text-sm text-copper">{error}</p> : null}
          {!ready ? <p className="mt-1 text-sm text-muted">Opening the desk…</p> : null}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm,.opus"
        multiple
        className="hidden"
        onChange={(event) => {
          const list = event.target.files;
          if (list?.length) void addFiles([...list], fileActionRef.current);
          event.target.value = "";
        }}
      />
    </main>
  );
}

function CompactPanel({
  panel,
  label,
  open,
  onClose,
  children,
}: {
  panel: keyof CompactPanels;
  label: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      id={`compact-${panel}`}
      aria-label={label}
      hidden={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {open && (
        <div className={`flex flex-col border-t border-line ${panel === "equalizer" ? "h-[232px]" : "h-[252px]"}`}>
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-raised px-3">
            <h2 className="font-mono text-xs uppercase tracking-wider text-fg">{label}</h2>
            <button
              type="button"
              aria-label={`Close ${label.toLowerCase()}`}
              title={`Close ${label.toLowerCase()}`}
              className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-fg"
              onClick={onClose}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3 py-2">{children}</div>
        </div>
      )}
    </section>
  );
}

function PlayerSettings({
  refElement,
  windowControls,
  onOpen,
}: {
  refElement: RefObject<HTMLDetailsElement | null>;
  windowControls?: DesktopWindowControls;
  onOpen: () => void;
}) {
  const playOpenedFiles = useDesk((s) => s.playOpenedFiles);
  const setPlayOpenedFiles = useDesk((s) => s.setPlayOpenedFiles);
  const queueOpenedFiles = useDesk((s) => s.queueOpenedFiles);
  const setQueueOpenedFiles = useDesk((s) => s.setQueueOpenedFiles);
  const transitionSpeed = useDesk((s) => s.transitionSpeed);
  const setTransitionSpeed = useDesk((s) => s.setTransitionSpeed);
  const { getOpenFilesInExistingPlayer, setOpenFilesInExistingPlayer } = windowControls ?? {};
  const [reuseWindow, setReuseWindow] = useState<boolean | null>(null);
  const [reusePending, setReusePending] = useState(false);
  const [reuseError, setReuseError] = useState("");

  async function syncFileWindowSetting(enabled?: boolean) {
    if (!getOpenFilesInExistingPlayer || !setOpenFilesInExistingPlayer || reusePending) return;
    setReusePending(true);
    setReuseError("");
    try {
      const current = enabled === undefined
        ? await getOpenFilesInExistingPlayer()
        : await setOpenFilesInExistingPlayer(enabled);
      setReuseWindow(current);
    } catch {
      setReuseError(enabled === undefined ? "Couldn’t read the file setting." : "Couldn’t save the file setting.");
    } finally {
      setReusePending(false);
    }
  }

  return (
    <details ref={refElement} className="z-10" onToggle={(event) => {
      if (event.currentTarget.open) {
        onOpen();
        void syncFileWindowSetting();
      }
    }}>
      <summary aria-label="Player settings" title="Player settings" className="flex size-9 list-none items-center justify-center rounded-sm border border-line text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <Settings2 className="size-4" />
      </summary>
      <div className="absolute right-3 top-full max-h-[calc(100dvh-4rem)] w-72 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-md border border-line bg-raised p-4 shadow-xl">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-copper">Opening files</p>
        {getOpenFilesInExistingPlayer && setOpenFilesInExistingPlayer && (
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-copper"
              disabled={reusePending || reuseWindow === null}
              checked={reuseWindow ?? true}
              onChange={(event) => void syncFileWindowSetting(event.currentTarget.checked)}
            />
            Open files in existing player
          </label>
        )}
        {reuseError && <p role="status" className="text-xs text-copper">{reuseError}</p>}
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-copper"
            checked={playOpenedFiles}
            onChange={(event) => setPlayOpenedFiles(event.currentTarget.checked)}
          />
          Play opened files immediately
        </label>
        <label className="mb-4 flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-copper"
            checked={queueOpenedFiles}
            onChange={(event) => setQueueOpenedFiles(event.currentTarget.checked)}
          />
          Automatically add opened files to the playlist
        </label>
        <div className="mb-4 border-t border-line" />
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-copper">Appearance</p>
        <label htmlFor="transition-speed" className="block text-sm font-medium">Transition speed</label>
        <p className="mb-2 text-xs leading-5 text-muted">Choose how quickly Cadence moves between Player, Playlist, and EQ.</p>
        <select
          id="transition-speed"
          value={transitionSpeed}
          onChange={(event) => setTransitionSpeed(event.target.value as TransitionSpeed)}
          className="min-h-10 w-full rounded-sm border border-line bg-lcd px-2 text-sm text-lcd-ink scheme-dark"
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

type TransportProps = { compact: true; status?: string } | {
  compact?: false;
  onOpen: () => void;
  onToggleEq: () => void;
  onTogglePl: () => void;
};

function Transport(props: TransportProps) {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumePanelId = useId();
  const volumeButtonRef = useRef<HTMLButtonElement>(null);
  const current = useDesk((s) =>
    s.openedTracks.find((track) => track.id === s.currentId) ?? s.tracks.find((track) => track.id === s.currentId),
  );
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
  const shownDuration = duration || current?.duration || 0;
  const position = Math.min(currentTime, shownDuration || 0);
  const volumePercent = Math.round((muted ? 0 : volume) * 100);

  const playbackButtons = (
    <>
      <IconButton compact={props.compact} label="Previous" onClick={() => void prev()}>
        <SkipBack />
      </IconButton>
      <IconButton compact={props.compact} label={playing ? "Pause" : "Play"} onClick={() => void toggle()} primary>
        {playing ? <Pause /> : <Play />}
      </IconButton>
      <IconButton
        compact={props.compact}
        label="Stop"
        onClick={() => {
          engine.pause();
          engine.seek(0);
          useDesk.setState({ playing: false, currentTime: 0 });
        }}
      >
        <Square />
      </IconButton>
      <IconButton compact={props.compact} label="Next" onClick={() => void next()}>
        <SkipForward />
      </IconButton>
    </>
  );

  if (props.compact) {
    const title = props.status ?? current?.title ?? "Nothing queued";
    return (
      <div
        className="flex h-[68px] shrink-0 items-center gap-2 bg-panel px-2"
        onKeyDown={(event) => {
          if (volumeOpen && event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            setVolumeOpen(false);
            volumeButtonRef.current?.focus({ preventScroll: true });
          }
        }}
      >
        <div className="relative h-12 min-w-0 flex-1 overflow-hidden rounded-sm border border-line bg-lcd">
          <div hidden={volumeOpen} className="px-2 py-1.5">
            <p className="truncate text-sm leading-tight text-lcd-ink" title={title} role={props.status ? "status" : undefined}>
              {title}
            </p>
            <p className="font-mono text-[11px] leading-4 tabular-nums text-lcd-ink">
              <span>{formatTime(currentTime)}</span>
              {shownDuration > 0 && ` / ${formatTime(shownDuration)}`}
            </p>
            <progress className="cadence-compact-progress" aria-label="Playback progress" value={position} max={shownDuration || 1} />
          </div>
          <div id={volumePanelId} hidden={!volumeOpen}>
            {volumeOpen && (
              <div className="flex h-[46px] items-center gap-1.5 px-2">
                <button
                  type="button"
                  className="flex size-7 shrink-0 items-center justify-center rounded-sm text-lcd-ink opacity-75 hover:opacity-100"
                  aria-label={muted ? "Unmute" : "Mute"}
                  title={muted ? "Unmute" : "Mute"}
                  onClick={toggleMute}
                >
                  {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-1 font-mono text-[10px] leading-3 text-lcd-ink" aria-hidden="true">
                    <span>VOL</span>
                    <span className="tabular-nums">{volumePercent}%</span>
                  </div>
                  <input
                    autoFocus
                    type="range"
                    className="vol block"
                    aria-label="Volume"
                    aria-valuetext={`${volumePercent}%`}
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(event) => setVolume(Number(event.currentTarget.value))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Playback controls">
          {playbackButtons}
          <IconButton
            ref={volumeButtonRef}
            compact
            label="Volume controls"
            expanded={volumeOpen}
            controls={volumePanelId}
            onClick={() => setVolumeOpen(!volumeOpen)}
          >
            {muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="rounded-sm bg-lcd px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-2xl text-lcd-ink">{formatTime(currentTime)}</p>
          <p className="font-mono text-xs text-lcd-ink opacity-70">{formatTime(shownDuration)}</p>
        </div>
        <p className="truncate text-sm text-lcd-ink">{current?.title ?? "Nothing queued"}</p>
        <Scope active={playing} />
      </div>

      <input
        className="seek"
        type="range"
        min={0}
        max={shownDuration || 0}
        step={0.1}
        value={position}
        aria-label="Position"
        disabled={!shownDuration}
        onChange={(event) => seek(Number(event.target.value))}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {playbackButtons}
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
        <IconButton label="Open equalizer" onClick={props.onToggleEq}>
          <span className="font-mono text-[11px] tracking-wide">EQ</span>
        </IconButton>
        <IconButton label="Open playlist" onClick={props.onTogglePl}>
          <span className="font-mono text-[11px] tracking-wide">PL</span>
        </IconButton>
        <IconButton label="Open audio" onClick={props.onOpen}>
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
  compact,
  expanded,
  controls,
  ref,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  primary?: boolean;
  compact?: boolean;
  expanded?: boolean;
  controls?: string;
  ref?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      title={label}
      onClick={onClick}
      className={`inline-flex h-10 ${compact ? "w-9 hover:border-copper sm:w-10" : "w-10"} items-center justify-center rounded-sm border border-line [&_svg]:size-4 ${primary ? "bg-copper text-lcd" : pressed || expanded ? "bg-raised text-copper" : "bg-raised text-fg"}`}
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
          className="min-h-10 min-w-0 flex-1 rounded-sm border border-line bg-lcd px-2 text-sm text-lcd-ink scheme-dark"
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

function Playlist({ onAdd }: { onAdd: () => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const tracks = useDesk((s) => s.tracks);
  const currentId = useDesk((s) => s.currentId);
  const query = useDesk((s) => s.query);
  const setQuery = useDesk((s) => s.setQuery);
  const playId = useDesk((s) => s.playId);
  const remove = useDesk((s) => s.remove);
  const clearPlaylist = useDesk((s) => s.clearPlaylist);
  const busy = useDesk((s) => s.busy);
  const shown = tracks.filter((track) => track.title.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (tracks.length === 0) setConfirmClear(false);
  }, [tracks.length]);

  function cancelClear() {
    setConfirmClear(false);
    clearButtonRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <input
          ref={filterRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter"
          aria-label="Filter playlist"
          className="min-h-9 min-w-0 flex-1 rounded-sm border border-line px-2 text-sm"
        />
        <span className="font-mono text-xs text-muted">{tracks.length}</span>
        <button
          type="button"
          aria-label="Add to playlist"
          title="Add to playlist"
          onClick={onAdd}
          className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line text-muted hover:text-fg"
        >
          <Upload className="size-3.5" aria-hidden="true" />
        </button>
        <button
          ref={clearButtonRef}
          type="button"
          disabled={!tracks.length || busy}
          aria-expanded={confirmClear}
          onClick={() => confirmClear ? cancelClear() : setConfirmClear(true)}
          className="min-h-9 shrink-0 rounded-sm border border-line px-2 text-xs text-muted hover:text-fg disabled:opacity-40"
        >
          Clear playlist
        </button>
      </div>
      {confirmClear && tracks.length > 0 && (
        <div
          role="group"
          aria-label="Confirm clearing playlist"
          className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-sm border border-line bg-raised px-2 py-2"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelClear();
            }
          }}
        >
          <p className="text-xs text-fg">Remove all {tracks.length} {tracks.length === 1 ? "track" : "tracks"}?</p>
          <div className="flex items-center gap-1.5">
            <button autoFocus type="button" onClick={cancelClear} className="min-h-8 rounded-sm border border-line px-2 text-xs text-muted hover:text-fg">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await clearPlaylist()) {
                  setConfirmClear(false);
                  filterRef.current?.focus({ preventScroll: true });
                }
              }}
              className="min-h-8 rounded-sm bg-copper px-2 text-xs font-semibold text-lcd disabled:opacity-40"
            >
              Clear all tracks
            </button>
          </div>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="px-1 py-4 text-sm text-muted">
          {tracks.length === 0 ? "Use Add to playlist to queue audio files." : "Nothing matches that filter."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto bg-pl-bg">
          {shown.map((track, index) => {
            const active = track.id === currentId;
            return (
              <li key={track.id} className={`flex items-center gap-1 border-t border-line ${active ? "bg-pl-selected text-pl-current" : "text-pl"}`}>
                <button
                  type="button"
                  onClick={() => void playId(track.id)}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-1 text-left text-sm text-inherit"
                >
                  <span className="w-5 font-mono text-[10px] opacity-75">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{track.title}</span>
                  <span className="font-mono text-[10px] opacity-75">{formatTime(track.duration)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${track.title}`}
                  onClick={() => void remove(track.id)}
                  className="inline-flex h-10 w-8 items-center justify-center opacity-75 hover:opacity-100"
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
