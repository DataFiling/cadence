import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FFMPEG_AUDIO_FORMATS } from "./ffmpeg-build.ts";
import {
  acceptAttribute,
  matchFormat,
  playableFormats,
  unknownFormatMessage,
  type PlayableFormat,
} from "./codecs.ts";

const nativeMimes = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/mp4",
  "audio/webm",
  "audio/aac",
]);

function supports(mime: string): boolean {
  const base = mime.split(";")[0]?.trim() ?? mime;
  return nativeMimes.has(base);
}

describe("playableFormats", () => {
  const formats = playableFormats(supports);

  it("marks browser-decodable formats as native and the rest as FFmpeg", () => {
    const via = Object.fromEntries(formats.map((format) => [format.id, format.via]));
    assert.equal(via.mp3, "native");
    assert.equal(via.wav, "native");
    assert.equal(via.ogg, "native");
    assert.equal(via.flac, "native");
    assert.equal(via.mov, "native");
    assert.equal(via.matroska, "native");
    assert.equal(via.aac, "native");
    assert.equal(via.au, "ffmpeg");
    assert.equal(via.asf, "ffmpeg");
    assert.equal(via.aiff, "ffmpeg");
  });

  it("only lists containers whose demuxer and an audio decoder are in this build", () => {
    const ids = new Set(FFMPEG_AUDIO_FORMATS.map((format) => format.id));
    assert.equal(ids.has("dts"), false);
    assert.equal(ids.has("wav"), true);
    assert.ok(
      FFMPEG_AUDIO_FORMATS.find((format) => format.id === "asf")?.decoders.includes("wmav2"),
    );
    assert.ok(
      FFMPEG_AUDIO_FORMATS.find((format) => format.id === "ogg")?.extensions.includes("opus"),
    );
  });
});

describe("matchFormat", () => {
  const formats: PlayableFormat[] = playableFormats(supports);

  it("matches an extension or a MIME type from the shared list", () => {
    assert.equal(matchFormat({ name: "clip.WMA", type: "" }, formats)?.id, "asf");
    assert.equal(matchFormat({ name: "song.bin", type: "audio/flac" }, formats)?.id, "flac");
    assert.equal(matchFormat({ name: "notes.txt", type: "text/plain" }, formats), null);
    assert.equal(matchFormat({ name: "cover.png", type: "image/png" }, formats), null);
  });

  it("builds the file picker accept list from those formats", () => {
    const accept = acceptAttribute(formats);
    assert.match(accept, /\.mp3/);
    assert.match(accept, /\.wma/);
    assert.match(accept, /\.au/);
    assert.doesNotMatch(accept, /\.txt/);
  });
});

describe("unknownFormatMessage", () => {
  it("names the file and the format the player cannot use", () => {
    assert.equal(
      unknownFormatMessage([{ name: "song.mid", type: "audio/midi" }]),
      `Can't add "song.mid" — .mid isn't a format this player can use.`,
    );
    assert.equal(
      unknownFormatMessage([
        { name: "a.mid", type: "" },
        { name: "b.exe", type: "" },
      ]),
      `Can't add "a.mid" and "b.exe" — .mid and .exe aren't formats this player can use.`,
    );
  });
});
