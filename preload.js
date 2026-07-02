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

  // ─── Computer Control ───
  screenshot: (x, y, width, height) => ipcRenderer.invoke('screen:screenshot', { x, y, width, height }),
  inputControl: (action, x, y, arg3, arg4) => {
    // Polymorphic: different args per action
    if (action === 'click') return ipcRenderer.invoke('input:control', { action, x, y, button: arg3, doubleClick: arg4 });
    if (action === 'type') return ipcRenderer.invoke('input:control', { action, text: x });
    if (action === 'scroll') return ipcRenderer.invoke('input:control', { action, x, y, deltaX: arg3, deltaY: arg4 });
    return ipcRenderer.invoke('input:control', { action });
  },

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

  // ─── File Generation Tools ───
  generateDocx: (title, sections, outputPath) => ipcRenderer.invoke('tool:generate-docx', { title, sections, outputPath }),
  generatePptx: (title, slides, outputPath, theme) => ipcRenderer.invoke('tool:generate-pptx', { title, slides, outputPath, theme }),
  generatePdf: (title, content, outputPath, options) => ipcRenderer.invoke('tool:generate-pdf', { title, content, outputPath, options }),
  generateExcel: (title, sheets, outputPath) => ipcRenderer.invoke('tool:generate-excel', { title, sheets, outputPath }),
  generateMermaid: (code, outputPath, theme) => ipcRenderer.invoke('tool:generate-mermaid', { code, outputPath, theme }),

  // ─── Browser Automation Tools ───
  browserLaunch: (options) => ipcRenderer.invoke('browser:launch', options),
  browserNavigate: (url, waitUntil) => ipcRenderer.invoke('browser:navigate', { url, waitUntil }),
  browserGetContent: (url, selector) => ipcRenderer.invoke('browser:get-content', { url, selector }),
  browserClick: (url, selector) => ipcRenderer.invoke('browser:click', { url, selector }),
  browserFill: (url, selector, value) => ipcRenderer.invoke('browser:fill', { url, selector, value }),
  browserScreenshot: (url, outputPath, fullPage) => ipcRenderer.invoke('browser:screenshot', { url, outputPath, fullPage }),
  browserClose: () => ipcRenderer.invoke('browser:close'),

  // ─── Multi-Agent System ───
  agentCreateTeam: (teamId, agents) => ipcRenderer.invoke('agent:create-team', { teamId, agents }),
  agentAssignTask: (teamId, agentId, task) => ipcRenderer.invoke('agent:assign-task', { teamId, agentId, task }),
  agentGetTeamStatus: (teamId) => ipcRenderer.invoke('agent:get-team-status', { teamId }),
  agentDeleteTeam: (teamId) => ipcRenderer.invoke('agent:delete-team', { teamId }),

  // ─── Scheduler System ───
  schedulerSchedule: (taskId, schedule, type, payload) => ipcRenderer.invoke('scheduler:schedule', { taskId, schedule, type, payload }),
  schedulerGetStatus: (taskId) => ipcRenderer.invoke('scheduler:get-status', { taskId }),
  schedulerCancel: (taskId) => ipcRenderer.invoke('scheduler:cancel', { taskId }),
  schedulerList: () => ipcRenderer.invoke('scheduler:list'),

  // ─── Plugin Market System ───
  pluginInstall: (pluginId, source) => ipcRenderer.invoke('plugin:install', { pluginId, source }),
  pluginList: () => ipcRenderer.invoke('plugin:list'),
  pluginUninstall: (pluginId) => ipcRenderer.invoke('plugin:uninstall', { pluginId }),
  pluginGetInfo: (pluginId) => ipcRenderer.invoke('plugin:get-info', { pluginId }),
  
  // ─── Built-in Plugins ───
  pluginsGetBuiltin: () => ipcRenderer.invoke('plugins:get-builtin'),
  pluginsToggle: (pluginId, enabled) => ipcRenderer.invoke('plugins:toggle', { pluginId, enabled }),
  pluginExecute: (pluginId, action, args) => ipcRenderer.invoke('plugin:execute', { pluginId, action, args }),
  pluginsGetByCategory: () => ipcRenderer.invoke('plugins:get-by-category'),
  pluginsGetDetail: (pluginId) => ipcRenderer.invoke('plugins:get-detail', { pluginId }),
  pluginsGetEnabledSummary: () => ipcRenderer.invoke('plugins:get-enabled-summary'),

  // ─── Image paste ───
  saveImage: async (dataUrl) => {
    return dataUrl;
  }
});
