# CADENCE

A local music desk: transport, a 10-band equalizer that actually filters the signal, a playlist, and a frequency scope.

This is an original player. It is not Winamp, not affiliated with it, and it does not use that project's source. The official Winamp repository was pulled in 2024 under a license that blocks distributing modified builds, and the tree is a Windows-only Visual Studio project. CADENCE keeps the useful desk layout and runs in the browser.

Audio files stay in this browser (IndexedDB). Nothing is uploaded.

## Play

- Drop audio onto the desk, or use the upload button. The desk lists every format it can use. **Native** formats play directly. **FFmpeg** formats are converted on this machine to 16-bit WAV and added under the original name. A converted track is marked in the playlist. Anything outside that list is refused, and the message names the format.
- Three short original pieces are generated the first time the library is empty.
- Space plays and pauses. Arrow keys seek; shift-arrows change tracks. Up and down change volume. `M` mutes, `S` shuffles, `R` cycles repeat.

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080.

## Desktop (Windows, Linux, Mac)

The desk also packages as a desktop app with Electron. Archives are unsigned zip builds, so they compile on any of the three systems:

```bash
npm install
npm run dist:linux   # zip + AppImage
npm run dist:win     # zip
npm run dist:mac     # zip
npm run dist         # all three
```

Output lands in `release/`. `npm run desktop` opens the packaged UI after `npm run build:desktop`. `npm run desktop:dev` opens a window on the local dev server.

Mac and Windows archives do not need that OS to compile. A signed Mac disk image or a Windows installer (NSIS) still has to be made on that platform.

## Supported formats

The desk builds one list at startup. A format is **native** when this browser's `HTMLAudioElement.canPlayType` or `MediaSource.isTypeSupported` accepts one of its MIME types. Every other format in the list is **converted through FFmpeg** before it is stored. The FFmpeg side is not a guess: it is the audio demuxers enabled in the bundled LGPL build, and only when at least one of that container's audio decoders is enabled too. The per-file decode check still decides whether a particular file can be added.

In Chromium, including the desktop build, these play natively:

- AAC (`.aac`)
- FLAC (`.flac`)
- M4A (`.m4a`, `.m4b`, `.mp4`, `.mov`)
- MP3 (`.mp3`, `.mp2`, `.m2a`, `.mpa`)
- Ogg (`.ogg`, `.oga`, `.opus`, `.spx`)
- WAV (`.wav`)
- WebM (`.webm`, `.mka`)

These are converted with FFmpeg:

- AC-3 (`.ac3`), E-AC-3 (`.eac3`), TrueHD (`.thd`), MLP (`.mlp`)
- AIFF (`.aiff`, `.aif`, `.aifc`), AU (`.au`), CAF (`.caf`), WAV64 (`.w64`)
- AMR (`.amr`), GSM (`.gsm`), G.722 (`.g722`), G.723.1, G.729, iLBC
- APE (`.ape`), WavPack (`.wv`), TTA (`.tta`), Shorten (`.shn`), TAK (`.tak`)
- WMA (`.wma`, `.asf`)
- aptX, aptX HD, SBC, ADX, HCA, DFPWM, DSD (`.wsd`), OMA, AST, VOC, Westwood AUD, and Asterisk raw PCM (`.sln`)

Other browsers can move a format between the two columns. A file that matches neither column is refused, and the message names that format.

## FFmpeg

When the built-in player cannot decode a file, CADENCE converts it with [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (`@ffmpeg/ffmpeg` and `@ffmpeg/util`, both MIT). The WebAssembly core shipped with the app is a single-thread build of FFmpeg licensed under the **GNU Lesser General Public License, version 2.1 or later**. It is not the GPL build published as `@ffmpeg/core`. Configure flags are `--disable-gpl`, `--disable-nonfree`, and `--disable-postproc`, with no GPL libraries linked (no libx264, libx265, or libxvid). The only encoder is `pcm_s16le`, and the only muxer is WAV.

The core is loaded only after a file fails the native decode check, and the `ffmpeg-core.js` / `ffmpeg-core.wasm` files are served by the app itself so conversion works offline and in the desktop build.

- FFmpeg n5.1.4 source: https://github.com/FFmpeg/FFmpeg/releases/tag/n5.1.4
- ffmpeg.wasm v0.12.10 glue: https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v0.12.10
- Rebuild: `scripts/build-ffmpeg-lgpl.sh` (Emscripten 3.1.40)
- License text: `vendor/ffmpeg-lgpl/COPYING.LGPLv2.1`

