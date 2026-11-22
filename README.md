# CADENCE

A local music desk: transport, a 10-band equalizer that actually filters the signal, a playlist, and a frequency scope. Player, EQ, and Playlist are views of one window; changing views does not interrupt playback.

This is an original player. It is not Winamp, not affiliated with it, and it does not use that project's source. The official Winamp repository was pulled in 2024 under a license that blocks distributing modified builds, and the tree is a Windows-only Visual Studio project. CADENCE keeps the useful desk layout and runs in the browser.

Audio files stay in this browser (IndexedDB). Nothing is uploaded.

## Play

- Drop audio onto the desk, or use the upload button. mp3, wav, ogg, flac, m4a.
- Three short original pieces are generated the first time the library is empty.
- Space plays and pauses. Arrow keys seek; shift-arrows change tracks. Up and down change volume. `M` mutes, `S` shuffles, `R` cycles repeat. `E` and `P` switch to the EQ and Playlist views; press the same key again or `Esc` to return to Player. The view buttons work the same way.
- Appearance settings (gear icon) control the view animation: Off, Quick (120 ms), Normal (240 ms, default), or Smooth (400 ms). The preference is saved locally. Reduced motion settings turn off the animation automatically.
- When EQ opens, the title straightens, the musical notes drift into place, and the sliders rise together. All of these effects use the selected transition speed.

## Run

Use Node.js 24 and npm. Extract the source ZIP, or clone this branch, then open a terminal in the folder containing `package.json`.

```bash
npm ci
npm run dev
```

The dev server listens on port 8080.

## Desktop (Windows, Linux, Mac)

Windows setup installs Cadence for the current user and adds it to Start. On Debian or Ubuntu, open the `.deb` in your software installer. On other Linux systems, mark the `.AppImage` executable and open it directly.

To build from a source ZIP or Git checkout, run `npm ci` and then the command for your operating system.

```bash
npm ci
npm run dist:linux   # Debian package, AppImage, and ZIP
npm run dist:win     # Windows setup EXE and ZIP
npm run dist:mac     # zip
npm run dist         # ZIP archives for all three platforms
```

Output lands in `release/`. `npm run desktop` opens the packaged UI after `npm run build:desktop`. `npm run desktop:dev` opens a window on the local dev server. You can also run `npm run build:desktop` alone to compile the UI without packaging it.

The Windows setup is unsigned unless you configure a code-signing certificate.

## Verification of the animated views

The desktop UI built with `npm run build:desktop` was tested in Chrome. Player, EQ, and Playlist slide within the same frame. All four transition speeds were checked, and the selected speed survived a reload. Opening Playlist, immediately tabbing into its search field, then pressing Escape returns to a centered Player. Imported MP3 and AAC (.m4a) tracks kept their place and continued advancing while switching views.

The web and desktop UI builds and the TypeScript check pass with Node.js 24. The x64 Windows installer, Debian package, and AppImage were unpacked and checked against the tested desktop bundle. The Linux Electron runtime was started from both Linux packages. A full desktop install-and-launch test is still pending on Windows and Linux.

