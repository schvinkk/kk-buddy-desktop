const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Tool Execution ───
  execShell: (command, cwd) => ipcRenderer.invoke('tool:shell', { command, cwd }),
  readFile: (filePath) => ipcRenderer.invoke('tool:read-file', { path: filePath }),
  writeFile: (filePath, content) => ipcRenderer.invoke('tool:write-file', { path: filePath, content }),
  listDir: (dirPath) => ipcRenderer.invoke('tool:list-dir', { dirPath }),
  editFile: (filePath, oldText, newText) => ipcRenderer.invoke('tool:edit-file', { path: filePath, oldText, newText }),
  grepSearch: (pattern, dirPath, filePattern, maxResults) => ipcRenderer.invoke('tool:grep-search', { pattern, dirPath, filePattern, maxResults }),
  readMultipleFiles: (paths) => ipcRenderer.invoke('tool:read-multiple-files', { paths }),
  listFiles: (dirPath, pattern, maxDepth, maxResults) => ipcRenderer.invoke('tool:list-files', { dirPath, pattern, maxDepth, maxResults }),

  // ─── Memory System ───
  memorySave: (key, content, tags) => ipcRenderer.invoke('memory:save', { key, content, tags }),
  memorySearch: (query, limit) => ipcRenderer.invoke('memory:search', { query, limit }),
  memoryList: () => ipcRenderer.invoke('memory:list'),
  memoryDelete: (key) => ipcRenderer.invoke('memory:delete', { key }),
  memoryGetAll: () => ipcRenderer.invoke('memory:get-all'),

  // ─── Web Tools ───
  webFetch: (url, maxLen) => ipcRenderer.invoke('web:fetch', { url, maxLen }),
  webSearch: (query, maxResults) => ipcRenderer.invoke('web:search', { query, maxResults }),

  // ─── Skills System ───
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsRead: (skillName) => ipcRenderer.invoke('skills:read', { skillName }),
  skillsInstall: (filePath) => ipcRenderer.invoke('skills:install', { filePath }),
  skillsDelete: (skillName) => ipcRenderer.invoke('skills:delete', { skillName }),
  skillsGetDir: () => ipcRenderer.invoke('skills:get-dir'),

  // ─── Dialogs ───
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openFileDialog: (filters) => ipcRenderer.invoke('dialog:open-file', filters),
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:save-file', opts),
  exportConversation: (filePath, content) => ipcRenderer.invoke('export:conversation', { filePath, content }),

  // ─── System ───
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getHomeDir: () => ipcRenderer.invoke('os:homedir'),
  getPlatform: () => ipcRenderer.invoke('os:platform'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getAppPath: (name) => ipcRenderer.invoke('app:get-path', { name }),

  // ─── Image paste ───
  saveImage: async (dataUrl) => {
    return dataUrl;
  }
});
