/** How the desk's media element classifies a failed play(). */
export type PlaybackFailureKind =
  "blocked" | "unsupported" | "decode" | "network" | "interrupted" | "unknown";

export type ProbeResult = { ok: true; duration: number } | { ok: false };

export const MEDIA_ERR_ABORTED = 1;
export const MEDIA_ERR_NETWORK = 2;
export const MEDIA_ERR_DECODE = 3;
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

const AUDIO_NAME = /\.(mp3|wav|ogg|flac|m4a|aac|webm|opus)$/i;

/** Types the media element actually answers for each extension we accept. */
const EXTENSION_TYPES: Record<string, readonly string[]> = {
  mp3: ["audio/mpeg"],
  wav: ["audio/wav", "audio/x-wav"],
  ogg: ["audio/ogg", "audio/ogg; codecs=vorbis"],
  flac: ["audio/flac"],
  m4a: ["audio/mp4", "audio/mp4; codecs=mp4a.40.2", "audio/x-m4a"],
  aac: ["audio/aac", "audio/mp4; codecs=mp4a.40.2"],
  webm: ["audio/webm", "audio/webm; codecs=opus"],
  opus: ["audio/ogg; codecs=opus", "audio/webm; codecs=opus"],
};

/**
 * canPlayType is picky about aliases (`audio/x-flac` is "", `audio/flac` is
 * "probably"). Asking the alias as well keeps the fast check from rejecting a
 * file the element can still decode.
 */
const MIME_ALIASES: Record<string, readonly string[]> = {
  "audio/mp3": ["audio/mpeg"],
  "audio/mpeg": ["audio/mp3"],
  "audio/wave": ["audio/wav", "audio/x-wav"],
  "audio/wav": ["audio/x-wav"],
  "audio/x-wav": ["audio/wav"],
  "audio/x-flac": ["audio/flac"],
  "audio/flac": ["audio/x-flac"],
  "audio/m4a": ["audio/mp4", "audio/mp4; codecs=mp4a.40.2", "audio/x-m4a"],
  "audio/x-m4a": ["audio/mp4", "audio/mp4; codecs=mp4a.40.2"],
  "audio/mp4": ["audio/mp4; codecs=mp4a.40.2", "audio/x-m4a"],
  "audio/opus": ["audio/ogg; codecs=opus", "audio/webm; codecs=opus"],
  "audio/ogg": ["audio/ogg; codecs=vorbis", "audio/ogg; codecs=opus"],
  "audio/webm": ["audio/webm; codecs=opus"],
  "audio/aac": ["audio/mp4; codecs=mp4a.40.2"],
};

export class PlaybackFailure extends Error {
  readonly kind: PlaybackFailureKind;

  constructor(kind: PlaybackFailureKind, message: string) {
    super(message);
    this.name = "PlaybackFailure";
    this.kind = kind;
  }
}

export function isAudioCandidate(file: { name: string; type: string }): boolean {
  return file.type.toLowerCase().startsWith("audio/") || AUDIO_NAME.test(file.name);
}

export function mediaTypeCandidates(name: string, mime: string): string[] {
  const types: string[] = [];
  const add = (type: string | undefined) => {
    if (!type) return;
    const value = type.trim().toLowerCase();
    if (!value.startsWith("audio/") || types.includes(value)) return;
    types.push(value);
  };

  const raw = mime.trim().toLowerCase();
  const base = raw.split(";")[0]?.trim() ?? "";
  add(raw);
  if (base !== raw) add(base);
  for (const alias of MIME_ALIASES[base] ?? []) add(alias);

  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  for (const type of EXTENSION_TYPES[ext] ?? []) add(type);
  return types;
}

export type CanPlayVerdict = "playable" | "unplayable" | "unknown";

/** `unknown` means there was no type to ask about, so the byte probe still runs. */
export function verdictFromCanPlayType(results: readonly string[]): CanPlayVerdict {
  if (results.length === 0) return "unknown";
  const supported = results.some((value) => {
    const answer = value.trim().toLowerCase();
    return answer === "probably" || answer === "maybe";
  });
  return supported ? "playable" : "unplayable";
}

function quote(name: string): string {
  return `"${name.trim() || "Untitled"}"`;
}

export function unsupportedFilesMessage(names: readonly string[]): string {
  const cleaned = names.length > 0 ? names : ["Untitled"];
  const shown = cleaned.slice(0, 4).map(quote);
  const extra = cleaned.length - shown.length;
  let subject: string;
  if (extra > 0) subject = `${shown.join(", ")}, and ${extra} more`;
  else if (shown.length === 1) subject = shown[0] ?? "that file";
  else if (shown.length === 2) subject = `${shown[0]} and ${shown[1]}`;
  else subject = `${shown.slice(0, -1).join(", ")}, and ${shown[shown.length - 1]}`;
  const reason =
    cleaned.length === 1
      ? "that format can't be played here"
      : "those formats can't be played here";
  return `Can't add ${subject} — ${reason}.`;
}

function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && typeof err.name === "string")
    return err.name;
  return "";
}

/**
 * Media error codes win over NotAllowedError. A blocked autoplay check can be
 * the exception even when the element has already flagged the source as
 * unsupported, and that case is not a permission problem.
 */
export function describePlaybackFailure(
  err: unknown,
  mediaError?: { code?: number } | null,
): PlaybackFailure {
  if (err instanceof PlaybackFailure) return err;
  const name = errorName(err);
  const code = mediaError?.code ?? 0;

  if (code === MEDIA_ERR_DECODE) {
    return new PlaybackFailure("decode", "This file can't be decoded — it may be damaged.");
  }
  if (name === "NotSupportedError" || code === MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return new PlaybackFailure("unsupported", "This format can't be played here.");
  }
  if (code === MEDIA_ERR_NETWORK) {
    return new PlaybackFailure("network", "Couldn't read this track for playback.");
  }
  if (name === "NotAllowedError") {
    return new PlaybackFailure("blocked", "Playback was blocked. Press play again.");
  }
  if (name === "AbortError" || code === MEDIA_ERR_ABORTED) {
    return new PlaybackFailure("interrupted", "Playback was interrupted. Press play again.");
  }
  return new PlaybackFailure("unknown", "Couldn't play this track.");
}

export function playbackFailureMessage(
  err: unknown,
  title?: string | null,
  mediaError?: { code?: number } | null,
): string {
  const failure = describePlaybackFailure(err, mediaError);
  const name = title?.trim();
  if (!name) return failure.message;
  if (failure.kind === "unsupported") {
    return `Can't play "${name}" — that format can't be played here.`;
  }
  if (failure.kind === "decode") {
    return `Can't play "${name}" — the file is damaged and can't be decoded.`;
  }
  if (failure.kind === "network") {
    return `Can't play "${name}" — the audio data couldn't be read.`;
  }
  if (failure.kind === "unknown") return `Couldn't play "${name}".`;
  return failure.message;
}
