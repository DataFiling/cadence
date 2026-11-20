import { FFMPEG_AUDIO_FORMATS } from "./ffmpeg-build.ts";

export type CodecPath = "native" | "ffmpeg";

export type PlayableFormat = {
  id: string;
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  /** Native means the browser can decode it. FFmpeg means we convert it first. */
  via: CodecPath;
};

export function fileExtension(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** The extension or MIME the rejection message should name. */
export function formatKey(file: { name: string; type: string }): string {
  const ext = fileExtension(file.name);
  if (ext) return `.${ext}`;
  const mime = file.type.trim().toLowerCase();
  return mime || "unknown";
}

function unique(values: string[]): string[] {
  const seen: string[] = [];
  for (const value of values) {
    const clean = value.trim().toLowerCase();
    if (clean && !seen.includes(clean)) seen.push(clean);
  }
  return seen;
}

function mimeBase(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function mimeCandidatesFor(name: string, mime: string): string[] {
  const ext = fileExtension(name);
  const declared = mime.trim().toLowerCase();
  const format =
    (ext ? FFMPEG_AUDIO_FORMATS.find((item) => item.extensions.includes(ext)) : undefined) ??
    (declared
      ? FFMPEG_AUDIO_FORMATS.find((item) =>
          item.mimeTypes.some((type) => mimeBase(type) === mimeBase(declared)),
        )
      : undefined);
  return unique([declared, ...(format?.mimeTypes ?? [])]);
}

function browserSupports(mime: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const audio = new Audio();
    const answer = audio.canPlayType(mime).trim().toLowerCase();
    if (answer === "probably" || answer === "maybe") return true;
  } catch {
    // A missing media element means nothing here is native.
  }
  const mediaSource = (
    globalThis as { MediaSource?: { isTypeSupported?: (type: string) => boolean } }
  ).MediaSource;
  if (!mediaSource || typeof mediaSource.isTypeSupported !== "function") return false;
  try {
    return mediaSource.isTypeSupported(mime);
  } catch {
    return false;
  }
}

/** Formats this runtime can play directly, or convert with the bundled FFmpeg build. */
export function playableFormats(
  supports: (mime: string) => boolean = browserSupports,
): PlayableFormat[] {
  const formats: PlayableFormat[] = FFMPEG_AUDIO_FORMATS.map((format) => ({
    id: format.id,
    label: format.label,
    extensions: format.extensions,
    mimeTypes: format.mimeTypes,
    via: format.mimeTypes.some((mime) => supports(mime)) ? "native" : "ffmpeg",
  }));
  formats.sort((a, b) => {
    if (a.via !== b.via) return a.via === "native" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return formats;
}

export function acceptAttribute(formats: readonly PlayableFormat[]): string {
  const parts: string[] = [];
  for (const format of formats) {
    for (const mime of format.mimeTypes) {
      if (mime.startsWith("video/")) continue;
      if (!parts.includes(mime)) parts.push(mime);
    }
    for (const ext of format.extensions) {
      const token = `.${ext}`;
      if (!parts.includes(token)) parts.push(token);
    }
  }
  return parts.join(",");
}

export function matchFormat(
  file: { name: string; type: string },
  formats: readonly PlayableFormat[],
): PlayableFormat | null {
  const ext = fileExtension(file.name);
  if (ext) {
    const byExt = formats.find((format) => format.extensions.includes(ext));
    if (byExt) return byExt;
  }
  const mime = mimeBase(file.type);
  if (!mime || mime === "application/octet-stream") return null;
  return formats.find((format) => format.mimeTypes.some((type) => mimeBase(type) === mime)) ?? null;
}

function quote(name: string): string {
  return `"${name.trim() || "Untitled"}"`;
}

function join(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

/** Files that match neither the browser nor the FFmpeg build. */
export function unknownFormatMessage(files: readonly { name: string; type: string }[]): string {
  const shown = files.slice(0, 4).map((file) => quote(file.name));
  const extra = files.length - shown.length;
  const subject = extra > 0 ? `${shown.join(", ")}, and ${extra} more` : join(shown);
  const formats = unique(files.map((file) => formatKey(file)));
  const named = formats.length === 1 ? formats[0] : join(formats);
  const verb = formats.length === 1 ? "isn't a format" : "aren't formats";
  return `Can't add ${subject} — ${named} ${verb} this player can use.`;
}
