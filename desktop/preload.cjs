const { contextBridge, ipcRenderer } = require("electron");

if (process.isMainFrame) {
  const pending = [];
  let openFilesListener;
  ipcRenderer.on("cadence:open-files", (_event, files) => {
    if (openFilesListener) openFilesListener(files);
    else pending.push(files);
  });

  contextBridge.exposeInMainWorld("cadenceWindow", {
    minimize: () => ipcRenderer.send("cadence:window-control", "minimize"),
    close: () => ipcRenderer.send("cadence:window-control", "close"),
    setCompactMode: (compact, panels) => ipcRenderer.send("cadence:compact-mode", compact, panels),
    getOpenFilesInExistingPlayer: () => ipcRenderer.invoke("cadence:get-open-file-preference"),
    setOpenFilesInExistingPlayer: (enabled) => ipcRenderer.invoke("cadence:set-open-file-preference", enabled),
    onOpenFiles(callback) {
      openFilesListener = callback;
      for (const files of pending.splice(0)) callback(files);
      return () => {
        if (openFilesListener === callback) openFilesListener = undefined;
      };
    },
  });
}
