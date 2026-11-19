# CADENCE

A local music desk: transport, a 10-band equalizer that actually filters the signal, a playlist, and a frequency scope.

This is an original player. It is not Winamp, not affiliated with it, and it does not use that project's source. The official Winamp repository was pulled in 2024 under a license that blocks distributing modified builds, and the tree is a Windows-only Visual Studio project. CADENCE keeps the useful desk layout and runs in the browser.

Audio files stay in this browser (IndexedDB). Nothing is uploaded.

## Play

- Drop audio onto the desk, or use the upload button. mp3, wav, ogg, flac, m4a play directly. Anything the browser cannot decode is converted on this machine to 16-bit WAV and then added under the original name.
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

## FFmpeg

When the built-in player cannot decode a file, CADENCE converts it with [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (`@ffmpeg/ffmpeg` and `@ffmpeg/util`, both MIT). The WebAssembly core shipped with the app is a single-thread build of FFmpeg licensed under the **GNU Lesser General Public License, version 2.1 or later**. It is not the GPL build published as `@ffmpeg/core`. Configure flags are `--disable-gpl`, `--disable-nonfree`, and `--disable-postproc`, with no GPL libraries linked (no libx264, libx265, or libxvid). The only encoder is `pcm_s16le`, and the only muxer is WAV.

The core is loaded only after a file fails the native decode check, and the `ffmpeg-core.js` / `ffmpeg-core.wasm` files are served by the app itself so conversion works offline and in the desktop build.

- FFmpeg n5.1.4 source: https://github.com/FFmpeg/FFmpeg/releases/tag/n5.1.4
- ffmpeg.wasm v0.12.10 glue: https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v0.12.10
- Rebuild: `scripts/build-ffmpeg-lgpl.sh` (Emscripten 3.1.40)
- License text: `vendor/ffmpeg-lgpl/COPYING.LGPLv2.1`

