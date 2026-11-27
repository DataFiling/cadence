import { useId, type CSSProperties } from "react";
import { useDesk } from "@/lib/cadence/store";

export const CADENCE_VIEWS = {
  player: { label: "Player", titleSize: 88 },
  eq: { label: "EQ", titleSize: 108 },
  playlist: { label: "Playlist", titleSize: 73 },
} as const;

export type CadenceView = keyof typeof CADENCE_VIEWS;

const EQ_LEVELS = [0.62, 0.88, 0.7, 0.96, 0.78, 0.55, 0.86, 1, 0.7, 0.85, 0.57, 0.94, 0.78, 0.64];
const EQ_SEGMENTS = Array.from({ length: 9 }, (_, index) => index);
const NOTES = ["♪", "♫", "♩", "♬", "♪", "♩", "♫", "♬", "♩", "♪", "♫", "♩", "♬", "♫", "♪", "♩"];
const TICKER_OFFSETS = [0, 180, 360, 540];

export function ViewTitle({ view, active }: { view: CadenceView; active: boolean }) {
  const id = useId();
  const glyph = `${id}-glyph`;
  const clip = `${id}-clip`;
  const outline = `${id}-outline`;
  const { label, titleSize } = CADENCE_VIEWS[view];

  return (
    <h2 className="cadence-view-title" data-active={active}>
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        className="cadence-title-art"
        viewBox="0 0 360 104"
        style={{ "--title-size": `${titleSize}px` } as CSSProperties}
      >
        <defs>
          <text id={glyph} className="cadence-title-glyph" x="180" y="84" textAnchor="middle">
            {label}
          </text>
          <clipPath id={clip}>
            <use href={`#${glyph}`} />
          </clipPath>
          <filter id={outline} colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="silhouette" />
            <feFlood className="cadence-title-outline" />
            <feComposite in2="silhouette" operator="in" result="edge" />
            <feMerge>
              <feMergeNode in="edge" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <use href={`#${glyph}`} className="cadence-title-base" filter={`url(#${outline})`} />
        <g clipPath={`url(#${clip})`}>
          {view === "eq" && <EqualizerArtwork />}
          {view === "player" && <PlayerArtwork />}
          {view === "playlist" && <PlaylistArtwork />}
        </g>
      </svg>
    </h2>
  );
}

function EqualizerArtwork() {
  return EQ_LEVELS.map((level, column) => (
    <g
      key={column}
      className="cadence-title-eq-column"
      style={{
        "--bar-level": level,
        "--bar-offset": `calc(var(--view-duration) * ${column * -0.25})`,
      } as CSSProperties}
    >
      {EQ_SEGMENTS.map((segment) => (
        <rect
          key={segment}
          x={91 + column * 13}
          y={83 - segment * 9}
          width="10"
          height="6"
          rx="1"
          fill={segment < 4 ? "var(--color-copper)" : "var(--color-fg)"}
          opacity={segment < 4 ? 0.9 : 0.85}
        />
      ))}
    </g>
  ));
}

function PlayerArtwork() {
  return (
    <g fontFamily="system-ui, sans-serif" fill="var(--color-fg)">
      <g className="cadence-title-notes" fontSize="18">
        {NOTES.map((note, index) => (
          <text key={index} x={index * 23 - 18} y={index % 2 ? 47 : 41} opacity="0.96">
            {note}
          </text>
        ))}
      </g>
      <g className="cadence-title-notes cadence-title-notes-offset" fontSize="17">
        {NOTES.map((note, index) => (
          <text key={index} x={index * 24 - 27} y={index % 2 ? 81 : 71} opacity="0.82">
            {note}
          </text>
        ))}
      </g>
    </g>
  );
}

function PlaylistArtwork() {
  const tracks = useDesk((state) => state.tracks);
  const rows = ["NOW PLAYING", "UP NEXT", "QUEUE"].map((fallback, index) => {
    const title = tracks[index]?.title || fallback;
    return `0${index + 1} / ${Array.from(title.toUpperCase()).slice(0, 20).join("")}`;
  });

  return (
    <g fontFamily="var(--font-mono)" fontSize="11" fontWeight="700" fill="var(--color-fg)">
      {rows.map((row, index) => (
        <g key={index} className={`cadence-title-ticker${index === 1 ? " cadence-title-ticker-reverse" : ""}`}>
          {TICKER_OFFSETS.map((offset) => (
            <text key={offset} x={offset + index * 12} y={39 + index * 21} opacity="0.94">
              {row}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
}
