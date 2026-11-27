const { app, BrowserWindow, protocol, net, screen, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { AUDIO_PATH, audioPaths, selectedAudioFiles, createFilePreferences, createAudioTransfer } = require("./open-files.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "cadence",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const distDir = path.resolve(__dirname, "..", "desktop-dist");
const appPage = new URL(process.env.CADENCE_DEV_URL || "cadence://app/");
const COMPACT_HEIGHT = 104;
const COMPACT_EQ_HEIGHT = 232;
const COMPACT_PLAYLIST_HEIGHT = 252;
const MIN_WINDOW_WIDTH = 360;
const DEFAULT_WINDOW_WIDTH = 460;
const localDevelopment = ["http:", "https:"].includes(appPage.protocol)
  && ["127.0.0.1", "[::1]", "localhost"].includes(appPage.hostname);
const fileOpeningOrigin = appPage.href === "cadence://app/" ? "cadence://app" : localDevelopment ? appPage.origin : null;
const filePreferences = createFilePreferences(app.getPath("userData"));
const audioTransfer = createAudioTransfer(net, fileOpeningOrigin);
const windowFiles = new WeakMap();
let lastFocusedWindow;

function isAppPage(url) {
  const page = URL.parse(url);
  return page?.protocol === appPage.protocol && page.host === appPage.host;
}

function registerWindowControls(win) {
  const isTrusted = (event) => {
    const frame = event.senderFrame;
    return frame && frame === win.webContents.mainFrame && isAppPage(frame.url);
  };
  let compactHeight = 0;
  let expandedWindow;

  function resizeInWorkArea(width, height, bounds, workArea) {
    const x = Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width));
    const y = Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height));
    win.setBounds({ x, y, width, height });
  }

  function syncCompactMode() {
    if (win.isDestroyed() || (!compactHeight && !expandedWindow)) return;

    if (compactHeight) {
      // The window manager can complete these transitions asynchronously.
      if (win.isFullScreen()) {
        win.setFullScreen(false);
        return;
      }
      if (win.isMaximized()) {
        win.unmaximize();
        return;
      }

      const bounds = win.getBounds();
      expandedWindow ??= {
        width: bounds.width,
        height: bounds.height,
        minimumSize: win.getMinimumSize(),
        resizable: win.isResizable(),
      };
      const workArea = screen.getDisplayMatching(bounds).workArea;
      const compactWidth = Math.min(DEFAULT_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, bounds.width));
      const height = Math.max(COMPACT_HEIGHT, Math.min(compactHeight, workArea.height));
      win.setResizable(true);
      win.setMinimumSize(MIN_WINDOW_WIDTH, COMPACT_HEIGHT);
      resizeInWorkArea(compactWidth, height, bounds, workArea);
      win.setResizable(false);
      return;
    }

    const { width, height, minimumSize, resizable } = expandedWindow;
    expandedWindow = undefined;
    const bounds = win.getBounds();
    const { workArea } = screen.getDisplayMatching(bounds);
    win.setResizable(true);
    win.setMinimumSize(...minimumSize);
    resizeInWorkArea(width, height, bounds, workArea);
    if (!resizable) win.setResizable(false);
  }

  win.on("leave-full-screen", syncCompactMode);
  win.on("unmaximize", syncCompactMode);
  win.webContents.ipc.on("cadence:compact-mode", (event, compact, panels) => {
    if (typeof compact !== "boolean" || !isTrusted(event)) return;
    if (panels !== undefined && (typeof panels?.equalizer !== "boolean" || typeof panels?.playlist !== "boolean")) return;
    const nextHeight = compact
      ? COMPACT_HEIGHT + (panels?.equalizer ? COMPACT_EQ_HEIGHT : 0) + (panels?.playlist ? COMPACT_PLAYLIST_HEIGHT : 0)
      : 0;
    if (nextHeight === compactHeight) return;
    compactHeight = nextHeight;
    syncCompactMode();
  });
  win.webContents.ipc.on("cadence:window-control", (event, action) => {
    if (!isTrusted(event)) return;

    if (action === "minimize") win.minimize();
    if (action === "close") win.close();
  });
  win.webContents.ipc.handle("cadence:get-open-file-preference", (event) => {
    if (!fileOpeningOrigin || !isTrusted(event)) throw new Error("File-opening preference unavailable");
    return filePreferences.get();
  });
  win.webContents.ipc.handle("cadence:set-open-file-preference", (event, enabled) => {
    if (!fileOpeningOrigin || !isTrusted(event) || typeof enabled !== "boolean") {
      throw new Error("Invalid file-opening preference");
    }
    return filePreferences.set(enabled);
  });
}

function sendPendingFiles(win) {
  const transfer = windowFiles.get(win);
  if (!transfer.ready || !transfer.files.length || !isAppPage(win.webContents.getURL())) return;
  win.webContents.send("cadence:open-files", audioTransfer.issue(transfer.files.splice(0)));
}

function createWindow() {
  const win = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: 780,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: 640,
    frame: false,
    hasShadow: false,
    backgroundColor: "#14120f",
    title: "CADENCE",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  registerWindowControls(win);
  const transfer = { ready: false, files: [] };
  windowFiles.set(win, transfer);
  win.on("focus", () => { lastFocusedWindow = win; });
  win.webContents.on("did-start-loading", () => { transfer.ready = false; });
  win.webContents.on("did-finish-load", () => {
    transfer.ready = true;
    sendPendingFiles(win);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAppPage(url)) event.preventDefault();
  });

  win.loadURL(appPage.href);
  return win;
}

function focusedOrExistingWindow() {
  return BrowserWindow.getFocusedWindow()
    || (lastFocusedWindow && !lastFocusedWindow.isDestroyed() ? lastFocusedWindow : BrowserWindow.getAllWindows()[0]);
}

function startApplication() {
  const launchPaths = audioPaths(process.argv.slice(process.defaultApp ? 2 : 1), process.cwd());
  if (!app.requestSingleInstanceLock({ launchPaths })) {
    app.quit();
    return;
  }

  let fileOpenQueue = Promise.resolve();
  function handleLaunch(paths) {
    fileOpenQueue = fileOpenQueue.then(async () => {
      const files = fileOpeningOrigin ? await selectedAudioFiles(paths) : [];
      const existing = focusedOrExistingWindow();
      const win = existing && (!files.length || filePreferences.get()) ? existing : createWindow();
      if (files.length) {
        windowFiles.get(win).files.push(...files);
        sendPendingFiles(win);
      }
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }).catch(() => console.error("Cadence could not open the selected audio files"));
  }

  const macLaunchPaths = [];
  let ready = false;
  let macLaunchTimer;
  app.on("open-file", (event, filename) => {
    event.preventDefault();
    macLaunchPaths.push(filename);
    if (!ready) return;
    clearTimeout(macLaunchTimer);
    macLaunchTimer = setTimeout(() => handleLaunch(audioPaths(macLaunchPaths.splice(0), process.cwd())), 30);
  });

  app.on("second-instance", (_event, argv, workingDirectory, data) => {
    const args = argv.length && Array.isArray(data?.launchPaths) ? data.launchPaths : argv.slice(1);
    handleLaunch(audioPaths(args, workingDirectory));
  });

  app.whenReady().then(() => {
    protocol.handle("cadence", (request) => {
      const url = new URL(request.url);
      if (url.host !== "app") return new Response("Forbidden", { status: 403 });
      if (url.pathname.startsWith(AUDIO_PATH)) return audioTransfer.respond(request, url);

      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/" || pathname === "") pathname = "/index.html";
      const file = path.resolve(distDir, `.${pathname}`);
      if (!file.startsWith(`${distDir}${path.sep}`)) {
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(file).href);
    });

    ready = true;
    handleLaunch(audioPaths([...launchPaths, ...macLaunchPaths.splice(0)], process.cwd()));
  });

  app.on("activate", () => handleLaunch([]));
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

startApplication();
