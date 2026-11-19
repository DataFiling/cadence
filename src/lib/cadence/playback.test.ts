import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MEDIA_ERR_ABORTED,
  MEDIA_ERR_DECODE,
  MEDIA_ERR_NETWORK,
  MEDIA_ERR_SRC_NOT_SUPPORTED,
  describePlaybackFailure,
  isAudioCandidate,
  mediaTypeCandidates,
  playbackFailureMessage,
  unsupportedFilesMessage,
  verdictFromCanPlayType,
} from "./playback.ts";

describe("isAudioCandidate", () => {
  it("accepts audio mime types and known extensions", () => {
    assert.equal(isAudioCandidate({ name: "a.MP3", type: "" }), true);
    assert.equal(isAudioCandidate({ name: "a.bin", type: "audio/flac" }), true);
    assert.equal(isAudioCandidate({ name: "notes.txt", type: "text/plain" }), false);
    assert.equal(isAudioCandidate({ name: "cover.png", type: "image/png" }), false);
  });
});

describe("mediaTypeCandidates", () => {
  it("adds aliases canPlayType understands", () => {
    assert.deepEqual(mediaTypeCandidates("song.flac", "audio/x-flac"), [
      "audio/x-flac",
      "audio/flac",
    ]);
    assert.deepEqual(mediaTypeCandidates("voice.opus", ""), [
      "audio/ogg; codecs=opus",
      "audio/webm; codecs=opus",
    ]);
    assert.deepEqual(mediaTypeCandidates("take.wav", "audio/wave"), [
      "audio/wave",
      "audio/wav",
      "audio/x-wav",
    ]);
  });

  it("keeps an unsupported mime so the fast check can reject it", () => {
    assert.deepEqual(mediaTypeCandidates("clip.wma", "audio/x-ms-wma"), ["audio/x-ms-wma"]);
  });
});

describe("verdictFromCanPlayType", () => {
  it("treats maybe and probably as playable", () => {
    assert.equal(verdictFromCanPlayType(["", "maybe"]), "playable");
    assert.equal(verdictFromCanPlayType(["probably"]), "playable");
  });

  it("rejects only when every answer is empty", () => {
    assert.equal(verdictFromCanPlayType(["", ""]), "unplayable");
    assert.equal(verdictFromCanPlayType([]), "unknown");
  });
});

describe("unsupportedFilesMessage", () => {
  it("names the rejected file and says the format can't be played here", () => {
    assert.equal(
      unsupportedFilesMessage(["broken.mp3"]),
      `Can't add "broken.mp3" — that format can't be played here.`,
    );
  });

  it("names every rejected file in a batch", () => {
    assert.equal(
      unsupportedFilesMessage(["a.wma", "b.mid"]),
      `Can't add "a.wma" and "b.mid" — those formats can't be played here.`,
    );
    assert.equal(
      unsupportedFilesMessage(["a.wma", "b.mid", "c.xyz"]),
      `Can't add "a.wma", "b.mid", and "c.xyz" — those formats can't be played here.`,
    );
  });

  it("caps a long batch", () => {
    assert.equal(
      unsupportedFilesMessage(["a.wma", "b.mid", "c.xyz", "d.aac", "e.wav"]),
      `Can't add "a.wma", "b.mid", "c.xyz", "d.aac", and 1 more — those formats can't be played here.`,
    );
  });
});

describe("describePlaybackFailure", () => {
  it("keeps a real autoplay block distinct from a bad source", () => {
    const blocked = describePlaybackFailure(new DOMException("gesture", "NotAllowedError"), null);
    assert.equal(blocked.kind, "blocked");
    assert.equal(blocked.message, "Playback was blocked. Press play again.");

    const masked = describePlaybackFailure(new DOMException("gesture", "NotAllowedError"), {
      code: MEDIA_ERR_SRC_NOT_SUPPORTED,
    });
    assert.equal(masked.kind, "unsupported");
    assert.equal(masked.message, "This format can't be played here.");
  });

  it("classifies format, decode, network, and interrupted failures separately", () => {
    assert.equal(
      describePlaybackFailure(new DOMException("no source", "NotSupportedError"), null).kind,
      "unsupported",
    );
    assert.equal(
      describePlaybackFailure(new Error("decode"), { code: MEDIA_ERR_DECODE }).kind,
      "decode",
    );
    assert.equal(
      describePlaybackFailure(new Error("net"), { code: MEDIA_ERR_NETWORK }).kind,
      "network",
    );
    assert.equal(
      describePlaybackFailure(new DOMException("aborted", "AbortError"), null).kind,
      "interrupted",
    );
    assert.equal(
      describePlaybackFailure(new Error("stopped"), { code: MEDIA_ERR_ABORTED }).kind,
      "interrupted",
    );
    assert.equal(describePlaybackFailure(new Error("huh"), null).kind, "unknown");
  });

  it("names the track in playback messages without rewriting a permission block", () => {
    const blocked = new DOMException("gesture", "NotAllowedError");
    assert.equal(
      playbackFailureMessage(blocked, "Night Bus"),
      "Playback was blocked. Press play again.",
    );
    assert.equal(
      playbackFailureMessage(new DOMException("no source", "NotSupportedError"), "Night Bus"),
      `Can't play "Night Bus" — that format can't be played here.`,
    );
    assert.equal(
      playbackFailureMessage(new Error("bad frames"), "Night Bus", { code: MEDIA_ERR_DECODE }),
      `Can't play "Night Bus" — the file is damaged and can't be decoded.`,
    );
    assert.equal(
      playbackFailureMessage(new Error("missing"), "Night Bus", { code: MEDIA_ERR_NETWORK }),
      `Can't play "Night Bus" — the audio data couldn't be read.`,
    );
    assert.equal(
      playbackFailureMessage(new DOMException("aborted", "AbortError"), "Night Bus"),
      "Playback was interrupted. Press play again.",
    );
  });
});
