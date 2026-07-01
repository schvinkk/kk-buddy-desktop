const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ─────────────── WINDOW ───────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    title: 'KK-Buddy Desktop',
    backgroundColor: '#0d1117',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d1117', symbolColor: '#8b949e', height: 36 },
    icon: createIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: true
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) console.log('[Renderer]', message);
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createIcon() {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#58a6ff"/><path d="M18 4L8 18h7l-2 10 12-14h-7l2-10z" fill="white"/></svg>`;
    return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  } catch (e) {
    return nativeImage.createEmpty();
  }
}

// ─────────────── TRAY ───────────────
function createTray() {
  tray = new Tray(createIcon());
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示 KK-Buddy Desktop', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('KK-Buddy Desktop');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ─────────────── IPC HANDLERS ───────────────

// Tool: Execute shell command
ipcMain.handle('tool:shell', async (_, { command, cwd }) => {
  return new Promise((resolve) => {
    const workDir = cwd || os.homedir();
    const child = exec(command, {
      cwd: workDir,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 5,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
      env: { ...process.env, FORCE_COLOR: '0' }
    }, (err, stdout, stderr) => {
      resolve({
        exitCode: err ? err.code || 1 : 0,
        stdout: stdout?.toString().slice(0, 50000) || '',
        stderr: stderr?.toString().slice(0, 10000) || '',
        error: err ? err.message : null
      });
    });
  });
});

// Tool: Read file
ipcMain.handle('tool:read-file', async (_, { path: filePath }) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content: content.slice(0, 200000) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Write file
ipcMain.handle('tool:write-file', async (_, { path: filePath, content }) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: List directory
ipcMain.handle('tool:list-dir', async (_, { dirPath }) => {
  try {
    const target = dirPath || os.homedir();
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const items = entries.slice(0, 200).map(e => ({
      name: e.name,
      isDir: e.isDirectory(),
      size: e.isDirectory() ? 0 : (fs.statSync(path.join(target, e.name)).size || 0)
    }));
    items.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { success: true, items, path: target };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Edit file (find & replace)
ipcMain.handle('tool:edit-file', async (_, { path: filePath, oldText, newText }) => {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes(oldText)) {
      return { success: false, error: 'old_text not found in file' };
    }
    content = content.replace(oldText, newText);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Grep search (regex pattern in file contents)
ipcMain.handle('tool:grep-search', async (_, { pattern, dirPath, filePattern, maxResults }) => {
  try {
    const root = dirPath || os.homedir();
    const max = Math.min(maxResults || 50, 200);
    const regex = new RegExp(pattern, 'i');
    const matches = [];

    function walkDir(dir, depth) {
      if (depth > 5 || matches.length >= max) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (matches.length >= max) break;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next') continue;
          walkDir(full, depth + 1);
        } else if (entry.isFile()) {
          // Filter by file pattern if provided
          if (filePattern) {
            const ext = filePattern.replace(/^\*\./, '').replace(/^\*\*\//, '');
            if (ext && !entry.name.endsWith(ext) && !entry.name.endsWith('.' + ext)) continue;
          }
          try {
            const content = fs.readFileSync(full, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && matches.length < max; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  file: path.relative(root, full) || entry.name,
                  line: i + 1,
                  content: lines[i].trim().slice(0, 200)
                });
              }
            }
          } catch { /* skip binary/unreadable files */ }
        }
      }
    }

    // Check if dirPath is a file
    try {
      const stat = fs.statSync(root);
      if (stat.isFile()) {
        const content = fs.readFileSync(root, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length && matches.length < max; i++) {
          if (regex.test(lines[i])) {
            matches.push({ file: path.basename(root), line: i + 1, content: lines[i].trim().slice(0, 200) });
          }
        }
        return { success: true, matches };
      }
    } catch {}

    walkDir(root, 0);
    return { success: true, matches };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Read multiple files
ipcMain.handle('tool:read-multiple-files', async (_, { paths }) => {
  const results = [];
  for (const filePath of paths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      results.push({ success: true, content: content.slice(0, 50000) });
    } catch (err) {
      results.push({ success: false, error: err.message });
    }
  }
  return results;
});

// Tool: List files recursively with pattern
ipcMain.handle('tool:list-files', async (_, { dirPath, pattern, maxDepth, maxResults }) => {
  try {
    const root = dirPath || os.homedir();
    const depth = Math.min(maxDepth || 5, 10);
    const max = Math.min(maxResults || 200, 500);
    const files = [];

    function matchesPattern(name, pat) {
      if (!pat) return true;
      const ext = pat.replace(/^\*\./, '').replace(/^\*\*\//, '');
      if (!ext) return true;
      return name.endsWith(ext) || name.endsWith('.' + ext);
    }

    function walkDir(dir, currentDepth) {
      if (currentDepth > depth || files.length >= max) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (files.length >= max) break;
        const full = path.join(dir, entry.name);
        const relPath = path.relative(root, full);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next') continue;
          if (matchesPattern(entry.name, pattern)) {
            files.push({ path: relPath || entry.name, isDir: true, size: 0 });
          }
          walkDir(full, currentDepth + 1);
        } else if (entry.isFile()) {
          if (matchesPattern(entry.name, pattern)) {
            const size = fs.statSync(full).size || 0;
            files.push({ path: relPath, isDir: false, size });
          }
        }
      }
    }

    walkDir(root, 0);
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// File dialog
ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:open-file', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:save-file', async (_, { defaultPath, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: filters || [{ name: 'Markdown', extensions: ['md'] }]
  });
  return result.canceled ? null : result.filePath;
});

// Export conversation
ipcMain.handle('export:conversation', async (_, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open external link
ipcMain.handle('shell:open-external', (_, url) => { shell.openExternal(url); });

// Get home directory
ipcMain.handle('os:homedir', () => os.homedir());
ipcMain.handle('os:platform', () => process.platform);

// App version
ipcMain.handle('app:version', () => app.getVersion());

// ─────────────── APP LIFECYCLE ───────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});

app.on('before-quit', () => { isQuitting = true; });
