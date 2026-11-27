import type { RefObject } from "react";
import { SKINS, resolveTokens, type SkinTokens } from "@/lib/cadence/skins";
import { useDesk } from "@/lib/cadence/store";

const PAINTS: { key: keyof SkinTokens; label: string }[] = [
  { key: "accent", label: "Accent" },
  { key: "lcd", label: "LCD" },
  { key: "lcdText", label: "Digits" },
  { key: "pl", label: "Playlist text" },
  { key: "plCurrent", label: "Current track" },
  { key: "visLo", label: "Spectrum low" },
  { key: "visHi", label: "Spectrum high" },
];

export function SkinMenu({
  refElement,
  onOpen,
}: {
  refElement: RefObject<HTMLDetailsElement | null>;
  onOpen: () => void;
}) {
  const skin = useDesk((state) => state.skin);
  const custom = useDesk((state) => state.custom);
  const setSkin = useDesk((state) => state.setSkin);
  const paint = useDesk((state) => state.paint);
  const tokens = resolveTokens(skin, custom);

  return (
    <details
      ref={refElement}
      className="z-10"
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen();
      }}
    >
      <summary className="flex h-9 list-none items-center rounded-sm border border-line px-2 font-mono text-[11px] text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        Skins
      </summary>
      <div className="absolute right-3 top-full max-h-[calc(100dvh-4rem)] w-72 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-md border border-line bg-raised p-3 shadow-xl">
        <div role="group" aria-label="Skin presets">
          {SKINS.map((entry) => (
            <SkinRow key={entry.id} name={entry.name} tokens={entry.tokens} pressed={skin === entry.id} onClick={() => setSkin(entry.id)} />
          ))}
          <SkinRow name="Custom" tokens={custom ?? tokens} pressed={skin === "custom"} onClick={() => setSkin("custom")} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PAINTS.map((field) => (
            <label key={field.key} className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[10px] text-muted">{field.label}</span>
              <input
                type="color"
                value={tokens[field.key]}
                onChange={(event) => paint(field.key, event.currentTarget.value)}
                className="h-8 w-full border border-line bg-transparent"
              />
            </label>
          ))}
        </div>
      </div>
    </details>
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
  const swatches = [tokens.panel, tokens.lcd, tokens.lcdText, tokens.accent, tokens.visLo, tokens.visHi, tokens.plBg, tokens.plCurrent];

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="flex min-h-9 w-full items-center gap-2 border-b border-line px-1 text-left hover:bg-panel aria-pressed:bg-panel"
    >
      <span className="w-20 font-mono text-[11px] text-fg">{name}</span>
      <span className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-sm" aria-hidden="true">
        {swatches.map((color, index) => <span key={index} className="flex-1" style={{ background: color }} />)}
      </span>
    </button>
  );
}
