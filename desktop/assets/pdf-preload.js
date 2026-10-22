const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pdfBridge", {
  onJob: (fn) => ipcRenderer.on("pdf-job", (_e, job) => fn(job)),
  done: (id, result) => ipcRenderer.send("pdf-done", id, result),
  ready: () => ipcRenderer.send("pdf-ready"),
});
