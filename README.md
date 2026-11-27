# CADENCE

A local music desk: transport, a 10-band equalizer that actually filters the signal, a playlist, and a frequency scope. Player, EQ, and Playlist are views of one window; changing views does not interrupt playback.

This is an original player. It is not Winamp, not affiliated with it, and it does not use that project's source. The official Winamp repository was pulled in 2024 under a license that blocks distributing modified builds, and the tree is a Windows-only Visual Studio project. CADENCE keeps the useful desk layout and runs in the browser.

Audio files stay in this browser (IndexedDB). Nothing is uploaded.

## Play

- Drop audio onto the desk or use **Open audio**. Use **Add to playlist** in the playlist to queue tracks directly.
- Three short original pieces are generated the first time the library is empty.
- Space plays and pauses. Arrow keys seek; shift-arrows change tracks. Up and down change volume. `M` mutes, `S` shuffles, `R` cycles repeat. `E` and `P` switch to the EQ and Playlist views; press the same key again or `Esc` to return to Player. The view buttons work the same way.
- Appearance settings (gear icon) control the view animation: Off, Quick (120 ms), Normal (240 ms, default), or Smooth (400 ms). The preference is saved locally. Reduced motion settings turn off the animation automatically.
- Each view animates its title when it opens. Equalizer bars bounce inside **EQ**, musical notes drift inside **Player**, and track names scroll inside **Playlist**. The effects follow the selected transition speed.
- Select **Compact mode** in the title bar for a slim player with track progress and playback buttons. Use the speaker button to adjust volume or mute. The **EQ** and **PL** buttons open panels that you can close independently. Select **Expand player** to return to the full view.
- In **Player settings**, **Play opened files immediately** is on by default. **Automatically add opened files to the playlist** is off by default. With auto-queue off, opened files play as a temporary selection. Use **Add to playlist** to keep tracks in the playlist.
- Choose an EQ profile for speech, a music genre, or a bass or treble boost. Select Flat to reset all ten bands. Adjusting a slider shows Custom when the settings differ from a built-in profile, and Cadence remembers the band settings.

## Run

Use Node.js 24 and npm. Extract the source ZIP, or clone this branch, then open a terminal in the folder containing `package.json`.

```bash
npm ci
npm run dev
```

The dev server listens on port 8080.

## Desktop (Windows, Linux, Mac)

Windows setup installs Cadence for the current user and adds it to Start. On Debian or Ubuntu, open the `.deb` in your software installer. On Fedora Workstation, run `sudo dnf install ./cadence-0.1.6-fedora-x86_64.rpm` from the download directory. For portable use on Linux, mark the `.AppImage` executable and open it directly.

Drag the CADENCE header to move the desktop window. The minimize and close buttons are at the top right.

To build from a source ZIP or Git checkout, run `npm ci` and then the command for your operating system.

```bash
npm ci
npm run dist:linux   # Debian package, AppImage, and ZIP
npm run dist:fedora  # x86_64 RPM (requires rpmbuild, provided by rpm-build on Fedora)
npm run dist:win     # Windows setup EXE and ZIP
npm run dist:mac     # zip
npm run dist         # ZIP archives for all three platforms
```

Output lands in `release/`. `npm run desktop` opens the packaged UI after `npm run build:desktop`. `npm run desktop:dev` opens a window on the local dev server. You can also run `npm run build:desktop` alone to compile the UI without packaging it.

The Windows setup is unsigned unless you configure a code-signing certificate.

## Verification of the animated views

The desktop UI built with `npm run build:desktop` was tested in Chrome. Player, EQ, and Playlist slide within the same frame. All four transition speeds were checked, and the selected speed survived a reload. Opening Playlist, immediately tabbing into its search field, then pressing Escape returns to a centered Player. Imported MP3 and AAC (.m4a) tracks kept their place and continued advancing while switching views.

The web and desktop UI builds and the TypeScript check pass with Node.js 24. The x64 Windows installer, Debian package, and AppImage were unpacked and checked against the tested desktop bundle. The Linux Electron runtime was started from both Linux packages. A full desktop install-and-launch test is still pending on Windows and Linux.

