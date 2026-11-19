import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversionActivity, ffmpegInputName } from "./ffmpeg.ts";

describe("conversionActivity", () => {
  it("describes loading without a percentage until bytes start arriving", () => {
    assert.deepEqual(conversionActivity("clip.wma", "preparing", null), {
      label: `Preparing to convert "clip.wma"…`,
      progress: null,
    });
    assert.deepEqual(conversionActivity("clip.wma", "preparing", 40.2), {
      label: `Preparing to convert "clip.wma"… 40%`,
      progress: 40,
    });
  });

  it("describes conversion progress and clamps it", () => {
    assert.deepEqual(conversionActivity("song.au", "converting", 12.4), {
      label: `Converting "song.au"… 12%`,
      progress: 12,
    });
    assert.equal(conversionActivity("song.au", "converting", 140).progress, 100);
    assert.equal(
      conversionActivity("  ", "converting", Number.NaN).label,
      `Converting "Untitled"… 0%`,
    );
  });
});

describe("ffmpegInputName", () => {
  it("keeps a short safe extension and drops directories", () => {
    assert.equal(ffmpegInputName("Album/clip.WMA"), "input.wma");
    assert.equal(ffmpegInputName("..\\notes.mp3"), "input.mp3");
    assert.equal(ffmpegInputName("noext"), "input.bin");
    assert.equal(ffmpegInputName("weird.toolongext"), "input.bin");
  });
});
