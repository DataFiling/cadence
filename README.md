# CADENCE

A local music desk: transport, a 10-band equalizer that actually filters the signal, a playlist, and a frequency scope.

This is an original player. It is not Winamp, not affiliated with it, and it does not use that project's source. The official Winamp repository was pulled in 2024 under a license that blocks distributing modified builds, and the tree is a Windows-only Visual Studio project. CADENCE keeps the useful desk layout and runs in the browser.

Audio files stay in this browser (IndexedDB). Nothing is uploaded.

## Play

- Drop audio onto the desk, or use the upload button. mp3, wav, ogg, flac, m4a.
- Three short original pieces are generated the first time the library is empty.
- Space plays and pauses. Arrow keys seek; shift-arrows change tracks. Up and down change volume. `M` mutes, `S` shuffles, `R` cycles repeat. `E` and `P` open the equalizer and playlist windows. `K` opens skins. Double-click a window bar to shade it.

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

