const { contextBridge, ipcRenderer } = require("electron");

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("cadenceWindow", {
    minimize: () => ipcRenderer.send("cadence:window-control", "minimize"),
    close: () => ipcRenderer.send("cadence:window-control", "close"),
  });
}
