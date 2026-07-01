const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

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

// ─────────────── MEMORY SYSTEM ───────────────
const MEMORY_DIR = path.join(app.getPath('userData'), 'memories');
function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadMemories() {
  ensureMemoryDir();
  const file = path.join(MEMORY_DIR, 'memories.json');
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

function saveMemories(memories) {
  ensureMemoryDir();
  fs.writeFileSync(path.join(MEMORY_DIR, 'memories.json'), JSON.stringify(memories, null, 2), 'utf-8');
}

// Memory: Save
ipcMain.handle('memory:save', async (_, { key, content, tags }) => {
  try {
    const memories = loadMemories();
    const existing = memories.findIndex(m => m.key === key);
    const entry = { key, content, tags: tags || [], createdAt: existing >= 0 ? memories[existing].createdAt : Date.now(), updatedAt: Date.now() };
    if (existing >= 0) memories[existing] = entry; else memories.push(entry);
    saveMemories(memories);
    return { success: true, entry };
  } catch (err) { return { success: false, error: err.message }; }
});

// Memory: Search
ipcMain.handle('memory:search', async (_, { query, limit }) => {
  try {
    const memories = loadMemories();
    const q = query.toLowerCase();
    const scored = memories.map(m => {
      let score = 0;
      if (m.key.toLowerCase().includes(q)) score += 10;
      if (m.content.toLowerCase().includes(q)) score += 5;
      if (m.tags && m.tags.some(t => t.toLowerCase().includes(q))) score += 8;
      return { ...m, score };
    }).filter(m => m.score > 0).sort((a, b) => b.score - a.score);
    return { success: true, results: scored.slice(0, limit || 10) };
  } catch (err) { return { success: false, error: err.message }; }
});

// Memory: List all
ipcMain.handle('memory:list', async () => {
  try {
    return { success: true, memories: loadMemories() };
  } catch (err) { return { success: false, error: err.message }; }
});

// Memory: Delete
ipcMain.handle('memory:delete', async (_, { key }) => {
  try {
    const memories = loadMemories().filter(m => m.key !== key);
    saveMemories(memories);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

// Memory: Get all (for system prompt injection)
ipcMain.handle('memory:get-all', async () => {
  try {
    return { success: true, memories: loadMemories() };
  } catch (err) { return { success: false, error: err.message }; }
});

// ─────────────── WEB TOOLS ───────────────

// Web Fetch: GET a URL and return text content
ipcMain.handle('web:fetch', async (_, { url, maxLen }) => {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'KK-Buddy/2.0' }, timeout: 15000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect
          const redirectUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
          resolve({ success: false, error: `Redirect to ${redirectUrl}` });
          return;
        }
        let data = '';
        res.on('data', chunk => {
          data += chunk.toString();
          if (data.length > (maxLen || 100000)) { res.destroy(); }
        });
        res.on('end', () => {
          // Strip HTML tags for basic text extraction
          let text = data.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                         .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
          resolve({ success: true, content: text.slice(0, maxLen || 100000), contentType: res.headers['content-type'] || '' });
        });
      });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Request timeout' }); });
    } catch (err) { resolve({ success: false, error: err.message }); }
  });
});

// Web Search: Search via DuckDuckGo HTML endpoint
ipcMain.handle('web:search', async (_, { query, maxResults }) => {
  return new Promise((resolve) => {
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      https.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 15000 }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk.toString(); if (data.length > 200000) res.destroy(); });
        res.on('end', () => {
          const results = [];
          const max = Math.min(maxResults || 8, 15);
          // Parse DuckDuckGo HTML results
          const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          let match;
          while ((match = resultRegex.exec(data)) !== null && results.length < max) {
            const url = match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&')[0];
            const title = match[2].replace(/<[^>]+>/g, '').trim();
            const snippet = match[3].replace(/<[^>]+>/g, '').trim();
            try {
              const decodedUrl = decodeURIComponent(url.replace(/^(https?:\/\/)/, '$1'));
              results.push({ title, url: decodedUrl, snippet });
            } catch { results.push({ title, url, snippet }); }
          }
          resolve({ success: true, results });
        });
      }).on('error', (err) => resolve({ success: false, error: err.message }));
    } catch (err) { resolve({ success: false, error: err.message }); }
  });
});

// ─────────────── SKILLS SYSTEM ───────────────
const SKILLS_DIR = path.join(app.getPath('userData'), 'skills');

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

// Skills: List all installed skills
ipcMain.handle('skills:list', async () => {
  try {
    ensureSkillsDir();
    const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    const skills = [];
    for (const dir of dirs) {
      const skillFile = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf-8');
        // Parse YAML frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let name = dir.name, description = '', version = '';
        if (fmMatch) {
          const lines = fmMatch[1].split('\n');
          for (const line of lines) {
            const kv = line.match(/^(\w+):\s*(.+)$/);
            if (kv) {
              if (kv[1] === 'name') name = kv[2].trim();
              if (kv[1] === 'description') description = kv[2].trim();
              if (kv[1] === 'version') version = kv[2].trim();
            }
          }
        }
        skills.push({ name, description, version, dir: dir.name, hasContent: content.length > 100 });
      }
    }
    return { success: true, skills };
  } catch (err) { return { success: false, error: err.message }; }
});

// Skills: Read skill content (for injection into system prompt)
ipcMain.handle('skills:read', async (_, { skillName }) => {
  try {
    const skillFile = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    if (!fs.existsSync(skillFile)) return { success: false, error: 'Skill not found' };
    const content = fs.readFileSync(skillFile, 'utf-8');
    return { success: true, content };
  } catch (err) { return { success: false, error: err.message }; }
});

// Skills: Install from zip file
ipcMain.handle('skills:install', async (_, { filePath }) => {
  try {
    ensureSkillsDir();
    // Use unzip via child_process
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32'
        ? `powershell -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${SKILLS_DIR}' -Force"`
        : `unzip -o "${filePath}" -d "${SKILLS_DIR}"`;
      exec(cmd, (err) => {
        if (err) resolve({ success: false, error: err.message });
        else resolve({ success: true });
      });
    });
  } catch (err) { return { success: false, error: err.message }; }
});

// Skills: Delete
ipcMain.handle('skills:delete', async (_, { skillName }) => {
  try {
    const skillDir = path.join(SKILLS_DIR, skillName);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

// Skills: Get directory path (for file resolution)
ipcMain.handle('skills:get-dir', async () => {
  ensureSkillsDir();
  return SKILLS_DIR;
});

// Get app data path
ipcMain.handle('app:get-path', async (_, { name }) => {
  return app.getPath(name);
});

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
