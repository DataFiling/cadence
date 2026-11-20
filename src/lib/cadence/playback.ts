import { mimeCandidatesFor } from "./codecs.ts";

/** How the desk's media element classifies a failed play(). */
export type PlaybackFailureKind =
  "blocked" | "unsupported" | "decode" | "network" | "interrupted" | "unknown";

export type ProbeResult = { ok: true; duration: number } | { ok: false };

export const MEDIA_ERR_ABORTED = 1;
export const MEDIA_ERR_NETWORK = 2;
export const MEDIA_ERR_DECODE = 3;
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export class PlaybackFailure extends Error {
  readonly kind: PlaybackFailureKind;

  constructor(kind: PlaybackFailureKind, message: string) {
    super(message);
    this.name = "PlaybackFailure";
    this.kind = kind;
  }
}

/** MIME types to ask canPlayType about, from the shared codec list. */
export function mediaTypeCandidates(name: string, mime: string): string[] {
  return mimeCandidatesFor(name, mime).filter(
    (type) => type.startsWith("audio/") || type.startsWith("application/ogg"),
  );
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
