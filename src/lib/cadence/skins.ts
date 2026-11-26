export type SkinId = "carbon" | "brass" | "phosphor" | "mercury" | "ember" | "custom";

export type SkinTokens = {
  bg: string;
  panel: string;
  raised: string;
  fg: string;
  muted: string;
  accent: string;
  line: string;
  lcd: string;
  lcdText: string;
  pl: string;
  plCurrent: string;
  plBg: string;
  plSelected: string;
  visLo: string;
  visHi: string;
};

export type SkinDef = {
  id: Exclude<SkinId, "custom">;
  name: string;
  tokens: SkinTokens;
};

export const SKINS: SkinDef[] = [
  {
    id: "carbon",
    name: "Carbon",
    tokens: {
      bg: "#14120f",
      panel: "#221f1a",
      raised: "#2e2923",
      fg: "#f3ece2",
      muted: "#a39888",
      accent: "#e07840",
      line: "#3d362e",
      lcd: "#100e0c",
      lcdText: "#e07840",
      pl: "#f3ece2",
      plCurrent: "#e07840",
      plBg: "#100e0c",
      plSelected: "#2a2118",
      visLo: "#6a3018",
      visHi: "#ffb080",
    },
  },
  {
    id: "brass",
    name: "Brass",
    tokens: {
      bg: "#16130e",
      panel: "#261f16",
      raised: "#342a1c",
      fg: "#f6efe2",
      muted: "#b1a288",
      accent: "#d4a054",
      line: "#4a3c28",
      lcd: "#120e09",
      lcdText: "#e2b76a",
      pl: "#f6efe2",
      plCurrent: "#e2b76a",
      plBg: "#120e09",
      plSelected: "#3a2c16",
      visLo: "#6a4a16",
      visHi: "#ffe0a0",
    },
  },
  {
    id: "phosphor",
    name: "Phosphor",
    tokens: {
      bg: "#0c100c",
      panel: "#141a14",
      raised: "#1c261c",
      fg: "#d7efd0",
      muted: "#7d9a78",
      accent: "#3dff6a",
      line: "#243024",
      lcd: "#061208",
      lcdText: "#7dff9a",
      pl: "#c8e6c0",
      plCurrent: "#7dff9a",
      plBg: "#061208",
      plSelected: "#16301c",
      visLo: "#0b3a18",
      visHi: "#d8ffb0",
    },
  },
  {
    id: "mercury",
    name: "Mercury",
    tokens: {
      bg: "#d5dae1",
      panel: "#eef1f5",
      raised: "#e2e6eb",
      fg: "#1c2128",
      muted: "#5c6770",
      accent: "#2f6fed",
      line: "#c5ccd4",
      lcd: "#10151c",
      lcdText: "#d5e4ff",
      pl: "#d5e2f4",
      plCurrent: "#9ec0ff",
      plBg: "#10151c",
      plSelected: "#1a2740",
      visLo: "#1a3f8a",
      visHi: "#d6e6ff",
    },
  },
  {
    id: "ember",
    name: "Ember",
    tokens: {
      bg: "#140e0e",
      panel: "#241616",
      raised: "#321c1c",
      fg: "#f6e8e4",
      muted: "#a88880",
      accent: "#ff5a36",
      line: "#4a2c28",
      lcd: "#120808",
      lcdText: "#ffb4a2",
      pl: "#f6e0da",
      plCurrent: "#ffb4a2",
      plBg: "#120808",
      plSelected: "#3a1814",
      visLo: "#6a180c",
      visHi: "#ffd0a8",
    },
  },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isSkinId(value: unknown): value is SkinId {
  return value === "carbon" || value === "brass" || value === "phosphor" || value === "mercury" || value === "ember" || value === "custom";
}

export function parseTokens(value: unknown): SkinTokens | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const base = SKINS[0].tokens;
  const next = { ...base };
  for (const key of Object.keys(base) as (keyof SkinTokens)[]) {
    const raw = source[key];
    if (typeof raw === "string" && HEX.test(raw)) next[key] = raw;
    else return null;
  }
  return next;
}

export function skinById(id: Exclude<SkinId, "custom">): SkinDef {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}

export function resolveTokens(id: SkinId, custom: SkinTokens | null): SkinTokens {
  if (id === "custom" && custom) return custom;
  if (id === "custom") return SKINS[0].tokens;
  return skinById(id).tokens;
}

const VARS: [keyof SkinTokens, string][] = [
  ["bg", "--color-bg"],
  ["panel", "--color-panel"],
  ["raised", "--color-raised"],
  ["fg", "--color-fg"],
  ["muted", "--color-muted"],
  ["accent", "--color-copper"],
  ["line", "--color-line"],
  ["lcd", "--color-lcd"],
  ["lcdText", "--color-lcd-ink"],
  ["pl", "--color-pl"],
  ["plCurrent", "--color-pl-current"],
  ["plBg", "--color-pl-bg"],
  ["plSelected", "--color-pl-selected"],
  ["visLo", "--vis-lo"],
  ["visHi", "--vis-hi"],
];

export function applySkin(tokens: SkinTokens) {
  const root = document.documentElement;
  for (const [key, name] of VARS) root.style.setProperty(name, tokens[key]);
}
