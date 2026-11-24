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
const appPage = new URL(process.env.CADENCE_DEV_URL || "cadence://app/");

function isAppPage(url) {
  const page = URL.parse(url);
  return page?.protocol === appPage.protocol && page.host === appPage.host;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 780,
    minWidth: 360,
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

  win.webContents.ipc.on("cadence:window-control", (event, action) => {
    const frame = event.senderFrame;
    if (!frame || frame !== win.webContents.mainFrame || !isAppPage(frame.url)) return;

    if (action === "minimize") win.minimize();
    if (action === "close") win.close();
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
}

app.whenReady().then(() => {
  protocol.handle("cadence", (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    const file = path.resolve(distDir, `.${pathname}`);
    if (!file.startsWith(distDir)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(file).href);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
