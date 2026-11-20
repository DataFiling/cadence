const { app, BrowserWindow, protocol, net, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function withContentType(response, file) {
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Type", type);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#14120f",
    title: "CADENCE",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const dev = process.env.CADENCE_DEV_URL;
    if (dev && url.startsWith(dev)) return;
    if (url.startsWith("cadence://")) return;
    event.preventDefault();
  });

  if (process.env.CADENCE_DEV_URL) {
    win.loadURL(process.env.CADENCE_DEV_URL);
    return;
  }
  win.loadURL("cadence://app/");
}

app.whenReady().then(() => {
  protocol.handle("cadence", async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    const file = path.resolve(distDir, `.${pathname}`);
    if (!file.startsWith(distDir)) {
      return new Response("Forbidden", { status: 403 });
    }
    return withContentType(await net.fetch(pathToFileURL(file).href), file);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
