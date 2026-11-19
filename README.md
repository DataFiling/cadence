# CADENCE

A local music desk: transport, a 10-band equalizer that actually filters the signal, a playlist, and a frequency scope.

This is an original player. It is not Winamp, not affiliated with it, and it does not use that project's source. The official Winamp repository was pulled in 2024 under a license that blocks distributing modified builds, and the tree is a Windows-only Visual Studio project. CADENCE keeps the useful desk layout and runs in the browser.

Audio files stay in this browser (IndexedDB). Nothing is uploaded.

## Play

- Drop audio onto the desk, or use the upload button. mp3, wav, ogg, flac, m4a.
- Three short original pieces are generated the first time the library is empty.
- Space plays and pauses. Arrow keys seek; shift-arrows change tracks. Up and down change volume. `M` mutes, `S` shuffles, `R` cycles repeat.

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080.
