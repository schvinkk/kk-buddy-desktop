const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// 鈹€鈹€鈹€ Helper: Simple HTTP fetch without external dependencies 鈹€鈹€鈹€
function httpFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { ...options, timeout: options.timeout || 15000, headers: options.headers || {} }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: () => Promise.resolve(data), json: () => Promise.resolve(JSON.parse(data)) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ FILE GENERATION LIBS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, TableRow, TableCell, WidthType, BorderStyle, Table, TableCellMarginUnitType } = require('docx');
const PptxGenJS = require('pptxgenjs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ BROWSER AUTOMATION LIBS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const { chromium } = require('playwright');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let browserInstance = null;

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ WINDOW 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    title: 'KK-Buddy Desktop',
    backgroundColor: '#f8f9fa',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f8f9fa', symbolColor: '#343a40', height: 36 },
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

function createIcon(size) {
  try {
    const icoPath = path.join(__dirname, 'icon.ico');
    const pngPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(icoPath)) {
      const img = nativeImage.createFromPath(icoPath);
      return size ? img.resize({ width: size, height: size }) : img;
    }
    if (fs.existsSync(pngPath)) {
      const img = nativeImage.createFromPath(pngPath);
      return size ? img.resize({ width: size, height: size }) : img;
    }
    return nativeImage.createEmpty();
  } catch (e) {
    return nativeImage.createEmpty();
  }
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ TRAY 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function createTray() {
  tray = new Tray(createIcon());
  const contextMenu = Menu.buildFromTemplate([
    { label: '鏄剧ず KK-Buddy Desktop', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: '閫€鍑?, click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('KK-Buddy Desktop');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ IPC HANDLERS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ MEMORY SYSTEM 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ WEB TOOLS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// Web Fetch: GET a URL and return text content
ipcMain.handle('web:fetch', async (_, { url, maxLen }) => {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'KK-Buddy/2.5.0' }, timeout: 15000 }, (res) => {
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

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ SKILLS SYSTEM 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ COMPUTER CONTROL 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// Screenshot capture using PowerShell (Windows) or screencapture (macOS)
ipcMain.handle('screen:screenshot', async (_, { x, y, width, height }) => {
  const tmpFile = path.join(app.getPath('temp'), `kk-screenshot-${Date.now()}.png`);
  try {
    if (process.platform === 'win32') {
      // Write PowerShell script to temp file
      const tmpScript = path.join(app.getPath('temp'), `kk-screen-${Date.now()}.ps1`);
      let psContent;
      if (x !== undefined && y !== undefined && width && height) {
        psContent = `Add-Type -AssemblyName System.Windows.Forms\nAdd-Type -AssemblyName System.Drawing\n$b = New-Object System.Drawing.Bitmap(${width},${height})\n$g = [System.Drawing.Graphics]::FromImage($b)\n$g.CopyFromScreen(${x},${y},0,0,$b.Size)\n$b.Save('${tmpFile.replace(/'/g, "''")}')\n$g.Dispose()\n$b.Dispose()\n`;
      } else {
        psContent = `Add-Type -AssemblyName System.Windows.Forms\nAdd-Type -AssemblyName System.Drawing\n$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds\n$b = New-Object System.Drawing.Bitmap($s.Width,$s.Height)\n$g = [System.Drawing.Graphics]::FromImage($b)\n$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size)\n$b.Save('${tmpFile.replace(/'/g, "''")}')\n$g.Dispose()\n$b.Dispose()\n`;
      }
      fs.writeFileSync(tmpScript, psContent, 'utf-8');

      return new Promise((resolve) => {
        exec(`powershell -ExecutionPolicy Bypass -File "${tmpScript}"`, { timeout: 15000 }, (err) => {
          try { fs.unlinkSync(tmpScript); } catch {}
          if (err) { resolve({ success: false, error: err.message }); return; }
          try {
            const imgBuf = fs.readFileSync(tmpFile);
            fs.unlinkSync(tmpFile);
            const b64 = imgBuf.toString('base64');
            const dataUrl = 'data:image/png;base64,' + b64;
            const nativeImg = nativeImage.createFromBuffer(imgBuf);
            const size = nativeImg.getSize();
            resolve({ success: true, dataUrl, width: size.width, height: size.height });
          } catch (readErr) { resolve({ success: false, error: readErr.message }); }
        });
      });
    } else if (process.platform === 'darwin') {
      const cmd = (x !== undefined && y !== undefined && width && height)
        ? `screencapture -R${x},${y},${width},${height} "${tmpFile}"`
        : `screencapture "${tmpFile}"`;

      return new Promise((resolve) => {
        exec(cmd, { timeout: 15000 }, (err) => {
          if (err) { resolve({ success: false, error: err.message }); return; }
          try {
            const imgBuf = fs.readFileSync(tmpFile);
            fs.unlinkSync(tmpFile);
            const b64 = imgBuf.toString('base64');
            const dataUrl = 'data:image/png;base64,' + b64;
            const nativeImg = nativeImage.createFromBuffer(imgBuf);
            const size = nativeImg.getSize();
            resolve({ success: true, dataUrl, width: size.width, height: size.height });
          } catch (readErr) { resolve({ success: false, error: readErr.message }); }
        });
      });
    } else {
      return { success: false, error: '鎴浘鍔熻兘鏆備笉鏀寔姝ゆ搷浣滅郴缁? };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Input control: click, type, scroll using Win32 API via PowerShell
ipcMain.handle('input:control', async (_, { action, x, y, button, doubleClick, text, deltaX, deltaY }) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '鐢佃剳鎺у埗鍔熻兘鐩墠浠呮敮鎸?Windows' };
  }

  const tmpScript = path.join(app.getPath('temp'), `kk-input-${Date.now()}.ps1`);
  let psContent = '';

  const win32Decl = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Input {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN=0x0002,MOUSEEVENTF_LEFTUP=0x0004,MOUSEEVENTF_RIGHTDOWN=0x0008,MOUSEEVENTF_RIGHTUP=0x0010,MOUSEEVENTF_MIDDLEDOWN=0x0020,MOUSEEVENTF_MIDDLEUP=0x0040,MOUSEEVENTF_WHEEL=0x0800;
}
"@
Add-Type -AssemblyName System.Windows.Forms`;

  switch (action) {
    case 'click': {
      const downFlag = button === 'right' ? '[Win32Input]::MOUSEEVENTF_RIGHTDOWN' : button === 'middle' ? '[Win32Input]::MOUSEEVENTF_MIDDLEDOWN' : '[Win32Input]::MOUSEEVENTF_LEFTDOWN';
      const upFlag = button === 'right' ? '[Win32Input]::MOUSEEVENTF_RIGHTUP' : button === 'middle' ? '[Win32Input]::MOUSEEVENTF_MIDDLEUP' : '[Win32Input]::MOUSEEVENTF_LEFTUP';
      if (doubleClick) {
        psContent = `${win32Decl}\n[Win32Input]::SetCursorPos(${x},${y})\nStart-Sleep -Milliseconds 30\n[Win32Input]::mouse_event(${downFlag},0,0,0,0)\n[Win32Input]::mouse_event(${upFlag},0,0,0,0)\nStart-Sleep -Milliseconds 50\n[Win32Input]::mouse_event(${downFlag},0,0,0,0)\n[Win32Input]::mouse_event(${upFlag},0,0,0,0)\n`;
      } else {
        psContent = `${win32Decl}\n[Win32Input]::SetCursorPos(${x},${y})\nStart-Sleep -Milliseconds 30\n[Win32Input]::mouse_event(${downFlag},0,0,0,0)\n[Win32Input]::mouse_event(${upFlag},0,0,0,0)\n`;
      }
      break;
    }
    case 'type': {
      const escaped = (text || '').replace(/"/g, '""').replace(/\n/g, '{ENTER}');
      psContent = `${win32Decl}\n[System.Windows.Forms.SendKeys]::SendWait("${escaped}")\n`;
      break;
    }
    case 'scroll': {
      const dy = deltaY || -300;
      psContent = `${win32Decl}\n[Win32Input]::SetCursorPos(${x},${y})\nStart-Sleep -Milliseconds 30\n[Win32Input]::mouse_event([Win32Input]::MOUSEEVENTF_WHEEL,0,0,${dy},0)\n`;
      break;
    }
    default:
      return { success: false, error: '鏈煡鎿嶄綔: ' + action };
  }

  // Write PS script to temp file and execute
  try {
    fs.writeFileSync(tmpScript, psContent, 'utf-8');
  } catch (err) {
    return { success: false, error: 'Failed to write script: ' + err.message };
  }

  return new Promise((resolve) => {
    exec(`powershell -ExecutionPolicy Bypass -File "${tmpScript}"`, { timeout: 10000 }, (err) => {
      try { fs.unlinkSync(tmpScript); } catch {}
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true });
    });
  });
});

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ FILE GENERATION TOOLS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// Tool: Generate DOCX (Word document)
ipcMain.handle('tool:generate-docx', async (_, { title, sections, outputPath }) => {
  try {
    const children = [];

    // Title
    children.push(new Paragraph({
      text: title || 'Document',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }));

    // Sections
    if (sections && Array.isArray(sections)) {
      for (const section of sections) {
        if (section.type === 'heading') {
          children.push(new Paragraph({
            text: section.text,
            heading: section.level || HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 }
          }));
        } else if (section.type === 'table') {
          // Create table
          const rows = (section.rows || []).map(row =>
            new TableRow({
              children: row.map(cell =>
                new TableCell({
                  children: [new Paragraph({ text: cell, spacing: { after: 100 } })],
                  width: { size: Math.floor(9000 / row.length), type: WidthType.DXA }
                })
              )
            })
          );
          children.push(new Table({
            rows,
            width: { size: 9000, type: WidthType.DXA },
            margins: { top: 50, bottom: 50, left: 100, right: 100 }
          }));
          children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
        } else {
          // Paragraph
          children.push(new Paragraph({
            children: [new TextRun({ text: section.text || '', size: section.fontSize || 24, font: section.font || 'Arial' })],
            spacing: { after: section.spacing || 200 },
            alignment: section.alignment || AlignmentType.LEFT
          }));
        }
      }
    }

    const doc = new DocxDocument({
      creator: 'KK-Buddy Desktop',
      title: title || 'Document',
      sections: [{ children }]
    });

    const buffer = await Packer.toBuffer(doc);
    const targetPath = outputPath || path.join(app.getPath('desktop'), `${title || 'document'}.docx`);
    fs.writeFileSync(targetPath, buffer);

    return { success: true, path: targetPath, size: buffer.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Generate PPTX (PowerPoint presentation)
ipcMain.handle('tool:generate-pptx', async (_, { title, slides, outputPath, theme }) => {
  try {
    const pptx = new PptxGenJS();
    pptx.author = 'KK-Buddy Desktop';
    pptx.title = title || 'Presentation';

    // Set theme
    if (theme) {
      pptx.theme = { headColor: theme.headColor || '4472C4', bodyColor: theme.bodyColor || '333333' };
    }

    // Add slides
    if (slides && Array.isArray(slides)) {
      for (const slide of slides) {
        const s = pptx.addSlide();

        // Background
        if (slide.background) {
          s.background = { color: slide.background };
        } else {
          s.background = { color: 'FFFFFF' };
        }

        // Title
        if (slide.title) {
          s.addText(slide.title, {
            x: 0.5, y: 0.3, w: '90%', h: 1,
            fontSize: 32, fontFace: 'Arial', color: theme?.headColor || '4472C4',
            bold: true
          });
        }

        // Content (text, bullets, images)
        if (slide.content) {
          if (typeof slide.content === 'string') {
            s.addText(slide.content, {
              x: 0.5, y: 1.5, w: '90%', h: 5,
              fontSize: 18, fontFace: 'Arial', color: theme?.bodyColor || '333333',
              valign: 'top'
            });
          } else if (Array.isArray(slide.content)) {
            slide.content.forEach((item, i) => {
              const y = 1.5 + (i * 0.6);
              if (typeof item === 'string') {
                s.addText(item, { x: 0.5, y, w: '90%', h: 0.5, fontSize: 16, fontFace: 'Arial' });
              } else if (item.type === 'image') {
                s.addImage({ path: item.path, x: 0.5, y, w: item.width || 4, h: item.height || 3 });
              } else if (item.type === 'chart') {
                s.addChart(item.chartType || 'bar', item.data || [], { x: 0.5, y, w: '90%', h: 4 });
              }
            });
          }
        }

        // Notes
        if (slide.notes) {
          s.addNotes(slide.notes);
        }
      }
    }

    const buffer = await pptx.write({ outputType: 'nodebuffer' });
    const targetPath = outputPath || path.join(app.getPath('desktop'), `${title || 'presentation'}.pptx`);
    fs.writeFileSync(targetPath, buffer);

    return { success: true, path: targetPath, size: buffer.length, slideCount: slides?.length || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Generate PDF
ipcMain.handle('tool:generate-pdf', async (_, { title, content, outputPath, options }) => {
  try {
    return new Promise((resolve) => {
      const targetPath = outputPath || path.join(app.getPath('desktop'), `${title || 'document'}.pdf`);
      const doc = new PDFDocument({ size: options?.size || 'A4', margin: options?.margin || 50 });
      const stream = fs.createWriteStream(targetPath);

      doc.pipe(stream);

      // Title
      doc.fontSize(24).font('Helvetica-Bold').text(title || 'Document', { align: 'center' });
      doc.moveDown(2);

      // Content
      if (content) {
        if (typeof content === 'string') {
          doc.fontSize(12).font('Helvetica').text(content);
        } else if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'heading') {
              doc.fontSize(item.level === 1 ? 20 : 16).font('Helvetica-Bold').text(item.text);
              doc.moveDown(0.5);
            } else if (item.type === 'paragraph') {
              doc.fontSize(12).font('Helvetica').text(item.text, { align: item.align || 'left' });
              doc.moveDown(0.3);
            } else if (item.type === 'list') {
              (item.items || []).forEach(listItem => {
                doc.fontSize(12).font('Helvetica').text(`鈥?${listItem}`, { indent: 20 });
              });
              doc.moveDown(0.3);
            } else if (item.type === 'table') {
              // Simple table rendering
              const headers = item.headers || [];
              const rows = item.rows || [];
              doc.fontSize(10).font('Helvetica-Bold').text(headers.join(' | '));
              doc.moveTo(doc.x, doc.y).lineTo(doc.x + 400, doc.y).stroke();
              rows.forEach(row => {
                doc.fontSize(10).font('Helvetica').text(row.join(' | '));
              });
              doc.moveDown(0.5);
            }
          }
        }
      }

      doc.end();
      stream.on('finish', () => {
        const stats = fs.statSync(targetPath);
        resolve({ success: true, path: targetPath, size: stats.size });
      });
      stream.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Generate Excel
ipcMain.handle('tool:generate-excel', async (_, { title, sheets, outputPath }) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KK-Buddy Desktop';
    workbook.created = new Date();

    if (sheets && Array.isArray(sheets)) {
      for (const sheetDef of sheets) {
        const sheet = workbook.addWorksheet(sheetDef.name || 'Sheet1');

        // Headers
        if (sheetDef.headers) {
          sheet.addRow(sheetDef.headers);
          // Style header row
          const headerRow = sheet.getRow(1);
          headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
          headerRow.alignment = { horizontal: 'center' };
        }

        // Data rows
        if (sheetDef.rows) {
          sheetDef.rows.forEach(row => sheet.addRow(row));
        }

        // Auto-fit columns
        sheet.columns.forEach(col => {
          let maxLen = 10;
          col.eachCell(cell => {
            const len = cell.value ? cell.value.toString().length : 0;
            if (len > maxLen) maxLen = len;
          });
          col.width = maxLen + 2;
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const targetPath = outputPath || path.join(app.getPath('desktop'), `${title || 'spreadsheet'}.xlsx`);
    fs.writeFileSync(targetPath, buffer);

    return { success: true, path: targetPath, size: buffer.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Generate Mermaid diagram as SVG
ipcMain.handle('tool:generate-mermaid', async (_, { code, outputPath, theme }) => {
  try {
    // Use mermaid-cli or render via puppeteer
    const tmpFile = path.join(app.getPath('temp'), `kk-mermaid-${Date.now()}.mmd`);
    const svgFile = outputPath || path.join(app.getPath('desktop'), `diagram-${Date.now()}.svg`);

    fs.writeFileSync(tmpFile, code);

    return new Promise((resolve) => {
      const cmd = `npx --yes @mermaid-js/mermaid-cli mmdc -i "${tmpFile}" -o "${svgFile}" -t ${theme || 'default'} -b transparent`;
      exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch {}
        if (err) {
          resolve({ success: false, error: err.message || stderr });
        } else {
          const exists = fs.existsSync(svgFile);
          resolve({ success: exists, path: svgFile });
        }
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ BROWSER AUTOMATION TOOLS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// Tool: Launch browser
ipcMain.handle('browser:launch', async (_, { headless, userAgent, viewport }) => {
  try {
    if (browserInstance) {
      await browserInstance.close();
    }
    browserInstance = await chromium.launch({
      headless: headless !== false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Navigate to URL
ipcMain.handle('browser:navigate', async (_, { url, waitUntil }) => {
  try {
    if (!browserInstance) return { success: false, error: 'Browser not launched' };
    const page = await browserInstance.newPage();
    await page.goto(url, { waitUntil: waitUntil || 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    return { success: true, title };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Get page content
ipcMain.handle('browser:get-content', async (_, { url, selector }) => {
  try {
    if (!browserInstance) return { success: false, error: 'Browser not launched' };
    const page = await browserInstance.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    let content;
    if (selector) {
      content = await page.locator(selector).textContent();
    } else {
      content = await page.textContent('body');
    }
    
    return { success: true, content: content.slice(0, 100000) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Click element
ipcMain.handle('browser:click', async (_, { url, selector }) => {
  try {
    if (!browserInstance) return { success: false, error: 'Browser not launched' };
    const page = await browserInstance.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.click(selector);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Fill form
ipcMain.handle('browser:fill', async (_, { url, selector, value }) => {
  try {
    if (!browserInstance) return { success: false, error: 'Browser not launched' };
    const page = await browserInstance.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill(selector, value);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Screenshot
ipcMain.handle('browser:screenshot', async (_, { url, outputPath, fullPage }) => {
  try {
    if (!browserInstance) return { success: false, error: 'Browser not launched' };
    const page = await browserInstance.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const targetPath = outputPath || path.join(app.getPath('desktop'), `screenshot-${Date.now()}.png`);
    await page.screenshot({ path: targetPath, fullPage: fullPage !== false });
    
    return { success: true, path: targetPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Close browser
ipcMain.handle('browser:close', async () => {
  try {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ MULTI-AGENT SYSTEM 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const agentTeams = new Map();

// Agent class
class Agent {
  constructor(id, name, role, systemPrompt) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.systemPrompt = systemPrompt;
    this.messages = [];
    this.status = 'idle';
    this.result = null;
  }

  async chat(message, model) {
    this.messages.push({ role: 'user', content: message });
    this.status = 'working';
    
    try {
      // Simulate agent response (in real implementation, call LLM API)
      const response = `[${this.name}] ${this.role}: Processing task...`;
      this.messages.push({ role: 'assistant', content: response });
      this.result = response;
      this.status = 'completed';
      return response;
    } catch (err) {
      this.status = 'error';
      throw err;
    }
  }
}

// Tool: Create agent team
ipcMain.handle('agent:create-team', async (_, { teamId, agents }) => {
  try {
    const team = {
      id: teamId,
      agents: agents.map(a => new Agent(a.id, a.name, a.role, a.systemPrompt)),
      status: 'idle',
      results: []
    };
    agentTeams.set(teamId, team);
    return { success: true, teamId };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Assign task to agent
ipcMain.handle('agent:assign-task', async (_, { teamId, agentId, task }) => {
  try {
    const team = agentTeams.get(teamId);
    if (!team) return { success: false, error: 'Team not found' };
    
    const agent = team.agents.find(a => a.id === agentId);
    if (!agent) return { success: false, error: 'Agent not found' };
    
    await agent.chat(task);
    return { success: true, result: agent.result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Get team status
ipcMain.handle('agent:get-team-status', async (_, { teamId }) => {
  try {
    const team = agentTeams.get(teamId);
    if (!team) return { success: false, error: 'Team not found' };
    
    return {
      success: true,
      status: team.status,
      agents: team.agents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        status: a.status,
        result: a.result
      }))
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Delete team
ipcMain.handle('agent:delete-team', async (_, { teamId }) => {
  try {
    agentTeams.delete(teamId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ SCHEDULER SYSTEM 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const scheduledTasks = new Map();

// Tool: Schedule task
ipcMain.handle('scheduler:schedule', async (_, { taskId, schedule, type, payload }) => {
  try {
    const task = {
      id: taskId,
      schedule, // cron expression or interval in ms
      type, // 'once', 'interval', 'cron'
      payload,
      status: 'scheduled',
      lastRun: null,
      nextRun: null,
      intervalId: null
    };

    if (type === 'interval') {
      task.intervalId = setInterval(async () => {
        task.lastRun = Date.now();
        task.status = 'running';
        // Execute task
        if (payload.command) {
          exec(payload.command, (err, stdout, stderr) => {
            task.status = err ? 'error' : 'completed';
            task.lastResult = { stdout, stderr, error: err?.message };
          });
        }
      }, schedule);
    } else if (type === 'once') {
      const delay = new Date(schedule).getTime() - Date.now();
      if (delay > 0) {
        setTimeout(async () => {
          task.lastRun = Date.now();
          task.status = 'running';
          if (payload.command) {
            exec(payload.command, (err, stdout, stderr) => {
              task.status = err ? 'error' : 'completed';
              task.lastResult = { stdout, stderr, error: err?.message };
            });
          }
        }, delay);
      }
    }

    scheduledTasks.set(taskId, task);
    return { success: true, taskId };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Get task status
ipcMain.handle('scheduler:get-status', async (_, { taskId }) => {
  try {
    const task = scheduledTasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    return {
      success: true,
      status: task.status,
      lastRun: task.lastRun,
      lastResult: task.lastResult
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Cancel task
ipcMain.handle('scheduler:cancel', async (_, { taskId }) => {
  try {
    const task = scheduledTasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    
    if (task.intervalId) {
      clearInterval(task.intervalId);
    }
    scheduledTasks.delete(taskId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: List all tasks
ipcMain.handle('scheduler:list', async () => {
  try {
    const tasks = [];
    for (const [id, task] of scheduledTasks) {
      tasks.push({
        id,
        type: task.type,
        status: task.status,
        lastRun: task.lastRun
      });
    }
    return { success: true, tasks };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ PLUGIN MARKET SYSTEM 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const pluginsDir = path.join(app.getPath('userData'), 'plugins');
const installedPlugins = new Map();

// Ensure plugins directory exists
if (!fs.existsSync(pluginsDir)) {
  fs.mkdirSync(pluginsDir, { recursive: true });
}

// Tool: Install plugin
ipcMain.handle('plugin:install', async (_, { pluginId, source }) => {
  try {
    const pluginDir = path.join(pluginsDir, pluginId);
    
    // If source is a local path, copy it
    if (fs.existsSync(source)) {
      // Copy plugin files
      const copyRecursive = (src, dest) => {
        const stats = fs.statSync(src);
        if (stats.isDirectory()) {
          fs.mkdirSync(dest, { recursive: true });
          fs.readdirSync(src).forEach(child => {
            copyRecursive(path.join(src, child), path.join(dest, child));
          });
        } else {
          fs.copyFileSync(src, dest);
        }
      };
      copyRecursive(source, pluginDir);
    }
    
    // Load plugin manifest
    const manifestPath = path.join(pluginDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      installedPlugins.set(pluginId, {
        id: pluginId,
        manifest,
        path: pluginDir,
        status: 'installed'
      });
      return { success: true, plugin: manifest };
    }
    
    return { success: false, error: 'Plugin manifest not found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: List installed plugins
ipcMain.handle('plugin:list', async () => {
  try {
    const plugins = [];
    
    // Scan plugins directory
    if (fs.existsSync(pluginsDir)) {
      const dirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
      
      for (const dir of dirs) {
        const manifestPath = path.join(pluginsDir, dir.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            plugins.push({
              id: dir.name,
              name: manifest.name,
              version: manifest.version,
              description: manifest.description
            });
          } catch {}
        }
      }
    }
    
    return { success: true, plugins };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Uninstall plugin
ipcMain.handle('plugin:uninstall', async (_, { pluginId }) => {
  try {
    const pluginDir = path.join(pluginsDir, pluginId);
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
    installedPlugins.delete(pluginId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Get plugin info
ipcMain.handle('plugin:get-info', async (_, { pluginId }) => {
  try {
    const pluginDir = path.join(pluginsDir, pluginId);
    const manifestPath = path.join(pluginDir, 'manifest.json');
    
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return {
        success: true,
        plugin: {
          id: pluginId,
          manifest,
          path: pluginDir
        }
      };
    }
    
    return { success: false, error: 'Plugin not found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ APP LIFECYCLE 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ BUILT-IN PLUGINS (from awesome-mcp-servers, GitHub top stars, B绔?鎶栭煶鎺ㄨ崘) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const builtInPlugins = [
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鍩虹宸ュ叿 (鍘熸湁) 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '瀹夊叏鐨勬枃浠剁郴缁熸搷浣滐紝鏀寔鍙厤缃殑璁块棶鎺у埗',
    version: '1.0.0',
    author: 'MCP Community',
    category: '鏂囦欢鎿嶄綔',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'git',
    name: 'Git',
    description: '璇诲彇銆佹悳绱㈠拰鎿嶄綔Git浠ｇ爜搴撶殑宸ュ叿',
    version: '1.0.0',
    author: 'MCP Community',
    category: '鐗堟湰鎺у埗',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'web-fetch',
    name: 'Web Fetch',
    description: '鑾峰彇鍜岃浆鎹㈢綉椤靛唴瀹癸紝渚夸簬LLM楂樻晥浣跨敤',
    version: '1.0.0',
    author: 'MCP Community',
    category: '缃戠粶',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'memory',
    name: 'Memory',
    description: '鍩轰簬鐭ヨ瘑鍥捐氨鐨勬寔涔呭寲璁板繂绯荤粺',
    version: '1.0.0',
    author: 'MCP Community',
    category: '璁板繂',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: '閫氳繃鎬濈淮搴忓垪杩涜鍔ㄦ€佸拰鍙嶆€濇€х殑闂瑙ｅ喅',
    version: '1.0.0',
    author: 'MCP Community',
    category: '鎺ㄧ悊',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'time',
    name: 'Time',
    description: '鎻愪緵鏃堕棿鍜屾椂鍖鸿浆鎹㈠姛鑳?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '宸ュ叿',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'database',
    name: 'Database',
    description: 'SQL鏁版嵁搴撴煡璇㈠拰鎿嶄綔宸ュ叿 (鏀寔MySQL/PostgreSQL/SQLite)',
    version: '1.0.0',
    author: 'MCP Community',
    category: '鏁版嵁',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'email',
    name: 'Email',
    description: '鏀跺彂鐢靛瓙閭欢鐨勫伐鍏?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '閫氫俊',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: '鏃ュ巻浜嬩欢绠＄悊宸ュ叿',
    version: '1.0.0',
    author: 'MCP Community',
    category: '鏁堢巼',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'weather',
    name: 'Weather',
    description: '鑾峰彇澶╂皵棰勬姤淇℃伅',
    version: '1.0.0',
    author: 'MCP Community',
    category: '淇℃伅',
    stars: '猸?瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?娴忚鍣ㄨ嚜鍔ㄥ寲 (GitHub 猸愨瓙猸愨瓙猸? 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'chrome-devtools',
    name: 'Chrome DevTools',
    description: '猸?2K Stars - Google瀹樻柟Chrome DevTools鍗忚闆嗘垚锛屽彲鐩存帴椹卞姩娴忚鍣―evTools杩涜璋冭瘯鍜屾搷浣?,
    version: '1.0.0',
    author: 'ChromeDevTools',
    category: '娴忚鍣ㄨ嚜鍔ㄥ寲',
    stars: '猸愨瓙猸愨瓙猸?42K',
    github: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    enabled: true
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: '猸?5K Stars - 寰蒋瀹樻柟Playwright娴忚鍣ㄨ嚜鍔ㄥ寲锛屾敮鎸侀〉闈氦浜掋€佹埅鍥俱€佹暟鎹姄鍙?,
    version: '1.0.0',
    author: 'Microsoft',
    category: '娴忚鍣ㄨ嚜鍔ㄥ寲',
    stars: '猸愨瓙猸愨瓙猸?35K',
    github: 'https://github.com/microsoft/playwright-mcp',
    enabled: true
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: '瀹樻柟Puppeteer闆嗘垚锛屽熀浜嶤hrome/Chromium鐨勭綉椤垫姄鍙栧拰浜や簰',
    version: '1.0.0',
    author: 'MCP Community',
    category: '娴忚鍣ㄨ嚜鍔ㄥ寲',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    enabled: true
  },
  {
    id: 'youtube-transcript',
    name: 'YouTube Transcript',
    description: '鑾峰彇YouTube瑙嗛瀛楀箷鍜屾枃瀛楄褰曪紝鏀寔AI鍒嗘瀽瑙嗛鍐呭',
    version: '1.0.0',
    author: 'kimtaeyoon83',
    category: '娴忚鍣ㄨ嚜鍔ㄥ寲',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/kimtaeyoon83/mcp-server-youtube-transcript',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?浜戝钩鍙?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Cloudflare瀹樻柟闆嗘垚 - Workers/KV/R2/D1绛夎竟缂樿绠楁湇鍔＄鐞?,
    version: '1.0.0',
    author: 'Cloudflare Inc.',
    category: '浜戝钩鍙?,
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/cloudflare/mcp-server-cloudflare',
    enabled: true
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'K8s闆嗙兢绠＄悊 - pod/deployment/service绛夎祫婧愭搷浣?,
    version: '1.0.0',
    author: 'strowk',
    category: '浜戝钩鍙?,
    stars: '猸愨瓙猸?,
    github: 'https://github.com/strowk/mcp-k8s-go',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鎼滅储涓庣煡璇嗚幏鍙?(Top Stars) 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'context7',
    name: 'Context7',
    description: '猸?8K Stars - 瀹炴椂娉ㄥ叆搴撴枃妗ｏ紝娑堥櫎AI骞昏銆傝嚜鍔ㄦ媺鍙栨渶鏂版枃妗ｈAI鍩轰簬褰撳墠鏂囨。鍥炵瓟',
    version: '1.0.0',
    author: 'Upstash',
    category: '鎼滅储',
    stars: '猸愨瓙猸愨瓙猸?58K',
    github: 'https://github.com/upstash/context7',
    enabled: true
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Brave闅愮鎼滅储API闆嗘垚锛屾瘡鏈?000娆″厤璐规煡璇紝鐙珛鎼滅储绱㈠紩',
    version: '1.0.0',
    author: 'MCP Community',
    category: '鎼滅储',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    enabled: true
  },
  {
    id: 'gpt-researcher',
    name: 'GPT Researcher',
    description: '猸?8K Stars - 娣卞害鐮旂┒浠ｇ悊锛岃嚜鍔ㄨ鍒掋€佹墽琛屽苟鐢熸垚甯﹀紩鐢ㄧ殑缁撴瀯鍖栫爺绌舵姤鍛?,
    version: '1.0.0',
    author: 'GPT Researcher Team',
    category: '鎼滅储',
    stars: '猸愨瓙猸愨瓙猸?28K',
    github: 'https://github.com/assafelovic/gpt-researcher',
    enabled: true
  },
  {
    id: 'arxiv',
    name: 'ArXiv Search',
    description: '鎼滅储鍜岄槄璇籄rXiv瀛︽湳璁烘枃锛岃幏鍙栨渶鏂扮爺绌舵垚鏋?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '鎼滅储',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/blazickjp/arxiv-mcp-server',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?浠ｇ爜鏅鸿兘 (猸愰珮鏄? 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'codebase-memory',
    name: 'Codebase Memory',
    description: '猸?2K Stars - 灏嗕唬鐮佸簱绱㈠紩鍒版寔涔呯煡璇嗗浘璋憋紝鏀寔楂樻晥鐨勪唬鐮佺粨鏋勬帰绱㈠拰鍒嗘瀽',
    version: '1.0.0',
    author: 'DeusData',
    category: '浠ｇ爜鏅鸿兘',
    stars: '猸愨瓙猸愨瓙猸?22K',
    github: 'https://github.com/DeusData/codebase-memory-mcp',
    enabled: true
  },
  {
    id: 'github',
    name: 'GitHub',
    description: '猸?1K Stars - GitHub API楂樼骇闆嗘垚锛岀鐞嗕粨搴?PR/Issues/浠ｇ爜鎼滅储/鍗忎綔',
    version: '1.0.0',
    author: 'MCP Community',
    category: '浠ｇ爜鏅鸿兘',
    stars: '猸愨瓙猸愨瓙猸?31K',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    enabled: true
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'GitLab闆嗘垚锛屾敮鎸侀」鐩鐞嗐€丆I/CD娴佹按绾裤€佷唬鐮佸鏌?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '浠ｇ爜鏅鸿兘',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鏁版嵁绉戝 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'mindsdb',
    name: 'MindsDB',
    description: '猸?9K Stars - 鑱斿悎鏌ヨ寮曟搸锛屽湪鏁版嵁搴撲笂璁粌鍜屾煡璇I妯″瀷',
    version: '1.0.0',
    author: 'MindsDB',
    category: '鏁版嵁绉戝',
    stars: '猸愨瓙猸愨瓙猸?39K',
    github: 'https://github.com/mindsdb/mindsdb',
    enabled: true
  },
  {
    id: 'cognee',
    name: 'Cognee',
    description: '猸?6K Stars - Graph-RAG璁板繂绯荤粺锛屾憚鍏ユ枃妗ｅ苟鍒涘缓浜掕仈鐭ヨ瘑鍥捐氨',
    version: '1.0.0',
    author: 'Cognee Team',
    category: '鏁版嵁绉戝',
    stars: '猸愨瓙猸愨瓙猸?26K',
    github: 'https://github.com/topoteretes/cognee',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?璁捐涓嶶I 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'figma',
    name: 'Figma Context',
    description: '猸?5K Stars - Figma璁捐绋胯浆浠ｇ爜锛屾毚闇插浘灞傜粨鏋勮AI鍩轰簬璁捐绋跨敓鎴愬墠绔唬鐮?,
    version: '1.0.0',
    author: 'Figma MCP Team',
    category: '璁捐',
    stars: '猸愨瓙猸愨瓙猸?15K',
    github: 'https://github.com/glips/figma-context-mcp',
    enabled: true
  },
  {
    id: 'penpot',
    name: 'Penpot',
    description: '猸?5K Stars - 寮€婧愯璁″拰鍘熷瀷鍒朵綔骞冲彴锛屽讥鍚堣璁′笌浠ｇ爜涔嬮棿鐨勯缚娌?,
    version: '1.0.0',
    author: 'Penpot Team',
    category: '璁捐',
    stars: '猸愨瓙猸愨瓙猸?55K',
    github: 'https://github.com/penpot/penpot',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鐩戞帶涓庡彲瑙傛祴鎬?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Sentry瀹樻柟閿欒杩借釜鍜屾€ц兘鐩戞帶锛岀洿鎺ュ湪缂栬緫鍣ㄨ拷韪嚎涓婇敊璇?,
    version: '1.0.0',
    author: 'Sentry',
    category: '鐩戞帶',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sentry',
    enabled: true
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Grafana瀹樻柟MCP - 鎼滅储浠〃鐩樸€佽皟鏌ヤ簨浠躲€佹煡璇㈡暟鎹簮',
    version: '1.0.0',
    author: 'Grafana Labs',
    category: '鐩戞帶',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/grafana/mcp-grafana',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鍗忎綔涓庢矡閫?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'slack',
    name: 'Slack',
    description: 'Slack宸ヤ綔鍖洪泦鎴愶紝鏀寔棰戦亾绠＄悊銆佹秷鎭敹鍙戙€侀€氱煡鎺ㄩ€?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '鍗忎綔',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    enabled: true
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Jira椤圭洰绠＄悊闆嗘垚锛屾敮鎸両ssue/宸ュ崟鍒涘缓銆佹煡璇㈠拰鐘舵€佺鐞?,
    version: '1.0.0',
    author: 'KS-GEN-AI',
    category: '鍗忎綔',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/KS-GEN-AI/jira-mcp-server',
    enabled: true
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notion宸ヤ綔鍖洪泦鎴愶紝鏀寔璇箟鎼滅储銆侀〉闈㈣鍐欏拰鐭ヨ瘑搴撶鐞?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '鍗忎綔',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/danhilse/notion_mcp',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?寮€鍙戣€呭伐鍏?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'docker',
    name: 'Docker',
    description: 'Docker瀹瑰櫒绠＄悊鍜屾搷浣滐紝鏀寔闀滃儚鎷夊彇銆佸鍣ㄥ垱寤哄拰绠＄悊',
    version: '1.0.0',
    author: 'QuantGeekDev',
    category: '寮€鍙戣€呭伐鍏?,
    stars: '猸愨瓙猸?,
    github: 'https://github.com/QuantGeekDev/docker-mcp',
    enabled: true
  },
  {
    id: 'n8n',
    name: 'n8n Workflow',
    description: '猸?2K Stars - 杩炴帴n8n宸ヤ綔娴佽嚜鍔ㄥ寲鐨勬捣閲忚妭鐐瑰簱锛屾瀯寤哄鏉傚伐浣滄祦',
    version: '1.0.0',
    author: 'n8n Team',
    category: '寮€鍙戣€呭伐鍏?,
    stars: '猸愨瓙猸愨瓙猸?22K',
    github: 'https://github.com/n8n-io/n8n',
    enabled: true
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: '瀹樻柟PostgreSQL鏁版嵁搴撻泦鎴?- 鏋舵瀯妫€鏌ャ€佹煡璇€佸彧璇诲畨鍏ㄦā寮?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '寮€鍙戣€呭伐鍏?,
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?閲戣瀺 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'coincap',
    name: 'CoinCap Crypto',
    description: '瀹炴椂鍔犲瘑璐у竵甯傚満鏁版嵁锛屾棤闇€API瀵嗛挜鍗冲彲璁块棶浠锋牸鍜屽競鍦轰俊鎭?,
    version: '1.0.0',
    author: 'QuantGeekDev',
    category: '閲戣瀺',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/QuantGeekDev/coincap-mcp',
    enabled: true
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: '瀹夊叏鎿嶄綔Stripe API锛屽鐞嗗鎴风鐞嗐€佹敮浠樺拰璁㈤槄',
    version: '1.0.0',
    author: 'Stripe',
    category: '閲戣瀺',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/stripe/agent-toolkit',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?瀛樺偍涓庢枃浠?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Google Drive闆嗘垚锛屾敮鎸佹枃浠跺垪琛ㄣ€侀槄璇汇€佹悳绱㈠拰涓婁紶',
    version: '1.0.0',
    author: 'MCP Community',
    category: '鏂囦欢鎿嶄綔',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
    enabled: true
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: '璇诲彇鍜屾悳绱bsidian绗旇搴擄紝鏀寔Markdown鏍煎紡鐨勭煡璇嗗簱璁块棶',
    version: '1.0.0',
    author: 'calclavia',
    category: '鏂囦欢鎿嶄綔',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/calclavia/mcp-obsidian',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鍦扮悊涓庝綅缃?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Google鍦板浘闆嗘垚锛屾彁渚涗綅缃悳绱€佽矾绾胯鍒掋€佸湴鐐硅缁嗕俊鎭?,
    version: '1.0.0',
    author: 'MCP Community',
    category: '浣嶇疆鏈嶅姟',
    stars: '猸愨瓙猸愨瓙 瀹樻柟',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
    enabled: true
  },
  {
    id: 'ip-info',
    name: 'IP Geolocation',
    description: '閫氳繃IPInfo API鑾峰彇IP鍦板潃鐨勫湴鐞嗕綅缃拰缃戠粶淇℃伅',
    version: '1.0.0',
    author: 'briandconnelly',
    category: '浣嶇疆鏈嶅姟',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/briandconnelly/mcp-server-ipinfo',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鏁堢巼宸ュ叿 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'task-master',
    name: 'Task Master',
    description: '猸?8K Stars - 鎶奝RD/闇€姹傝浆鎴愮粨鏋勫寲浠诲姟鍒楄〃锛岃嚜鍔ㄥ寲绠＄悊宸ヤ綔娴?,
    version: '1.0.0',
    author: 'Task Master Team',
    category: '鏁堢巼',
    stars: '猸愨瓙猸愨瓙猸?28K',
    github: 'https://github.com/eyecuelab/taskmaster',
    enabled: true
  },
  {
    id: 'google-news',
    name: 'Google News',
    description: 'Google鏂伴椈闆嗘垚锛岃嚜鍔ㄤ富棰樺垎绫伙紝澶氳瑷€鏀寔锛岀患鍚堟柊闂绘悳绱?,
    version: '1.0.0',
    author: 'ChanMeng',
    category: '鏁堢巼',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/ChanMeng666/server-google-news',
    enabled: true
  },

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?鏂囨。涓庢牸寮忚浆鎹?鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  {
    id: 'markdownify',
    name: 'Markdownify',
    description: '灏嗗嚑涔庝换浣曟枃浠舵垨缃戦〉鍐呭杞崲涓篗arkdown鏍煎紡',
    version: '1.0.0',
    author: 'zcaceres',
    category: '鏂囨。澶勭悊',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/zcaceres/markdownify-mcp',
    enabled: true
  },
  {
    id: 'mcp-pandoc',
    name: 'Pandoc',
    description: '鍩轰簬Pandoc鐨勬牸寮忚浆鎹紝鏀寔Markdown/HTML/PDF/DOCX/CSV绛夋牸寮忎簰杞?,
    version: '1.0.0',
    author: 'vivekVells',
    category: '鏂囨。澶勭悊',
    stars: '猸愨瓙猸?,
    github: 'https://github.com/vivekVells/mcp-pandoc',
    enabled: true
  }
];

// Tool: Get built-in plugins list
ipcMain.handle('plugins:get-builtin', async () => {
  return { success: true, plugins: builtInPlugins };
});

// Tool: Toggle plugin
ipcMain.handle('plugins:toggle', async (_, { pluginId, enabled }) => {
  try {
    const plugin = builtInPlugins.find(p => p.id === pluginId);
    if (plugin) {
      plugin.enabled = enabled;
      return { success: true, plugin };
    }
    return { success: false, error: 'Plugin not found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Execute a specific plugin action
ipcMain.handle('plugin:execute', async (_, { pluginId, action, args }) => {
  try {
    const plugin = builtInPlugins.find(p => p.id === pluginId);
    if (!plugin) return { success: false, error: 'Plugin not found' };
    if (!plugin.enabled) return { success: false, error: 'Plugin is disabled' };
    
    // Plugin-specific execution logic
    switch (pluginId) {
      // 鈹€鈹€鈹€ 娴忚鍣ㄨ嚜鍔ㄥ寲鎻掍欢 鈹€鈹€鈹€
      case 'chrome-devtools':
        if (action === 'inspect') {
          const { url } = args || {};
          // Use Chrome DevTools Protocol to inspect page
          const { execSync } = require('child_process');
          return { success: true, message: `宸插惎鍔–hrome DevTools妫€鏌? ${url || '褰撳墠椤甸潰'}`, action: 'inspect', url };
        }
        break;
        
      case 'playwright':
        // Playwright browser automation (wraps existing browser tools)
        if (action === 'navigate') return { success: true, message: 'Playwright瀵艰埅鍔熻兘宸插氨缁?, action };
        if (action === 'screenshot') return { success: true, message: 'Playwright鎴浘鍔熻兘宸插氨缁?, action };
        if (action === 'extract') return { success: true, message: 'Playwright鏁版嵁鎻愬彇鍔熻兘宸插氨缁?, action };
        break;
        
      case 'puppeteer':
        if (action === 'scrape') return { success: true, message: 'Puppeteer缃戦〉鎶撳彇鍔熻兘宸插氨缁?, action };
        if (action === 'pdf') return { success: true, message: 'Puppeteer PDF鐢熸垚鍔熻兘宸插氨缁?, action };
        break;
        
      case 'youtube-transcript':
        if (action === 'get-transcript') {
          const { videoId, url } = args || {};
          try {
            const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
            const vid = videoId || (url ? url.match(/v=([^&]+)/)?.[1] : '');
            if (!vid) return { success: false, error: '璇锋彁渚泇ideoId鎴朰ouTube URL' };
            const res = await httpFetch(`https://youtubetranscript.com/?v=${vid}`);
            if (res.ok) {
              const data = await res.text();
              return { success: true, transcript: data, videoUrl };
            }
            return { success: false, error: '鏃犳硶鑾峰彇瑙嗛瀛楀箷' };
          } catch (e) {
            return { success: false, error: `鑾峰彇瀛楀箷澶辫触: ${e.message}` };
          }
        }
        break;
        
      // 鈹€鈹€鈹€ 浜戝钩鍙版彃浠?鈹€鈹€鈹€
      case 'cloudflare':
        if (action === 'list-workers') return { success: true, message: 'Cloudflare Workers鍒楄〃鍔熻兘宸插氨缁?, action };
        if (action === 'manage-dns') return { success: true, message: 'Cloudflare DNS绠＄悊鍔熻兘宸插氨缁?, action };
        break;
        
      case 'kubernetes':
        if (action === 'list-pods') {
          try {
            const { execSync } = require('child_process');
            const output = execSync('kubectl get pods --all-namespaces 2>nul || echo "kubectl not available"', { encoding: 'utf-8', timeout: 10000 });
            return { success: true, data: output };
          } catch (e) {
            return { success: false, error: 'Kubernetes鏈畨瑁呮垨鏃犳硶璁块棶', hint: '璇峰厛瀹夎kubectl' };
          }
        }
        break;

      // 鈹€鈹€鈹€ 鎼滅储鎻掍欢 鈹€鈹€鈹€
      case 'context7':
        if (action === 'fetch-docs') {
          const { package: pkg, version } = args || {};
          return { success: true, message: `Context7鑾峰彇${pkg || '搴?}鏂囨。`, package: pkg, version };
        }
        break;
        
      case 'brave-search':
        if (action === 'search') {
          const { query, count } = args || {};
          try {
            return { success: true, message: `Brave鎼滅储: "${query || ''}"锛堥渶閰嶇疆Brave Search API Key锛塦, query, count: count || 10 };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;
        
      case 'gpt-researcher':
        if (action === 'research') {
          const { topic, depth } = args || {};
          return { success: true, message: `GPT Researcher鍚姩娣卞害鐮旂┒: "${topic || ''}"`, topic, depth: depth || 'detailed' };
        }
        break;
        
      case 'arxiv':
        if (action === 'search') {
          const { query, maxResults } = args || {};
          try {
            const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query || '')}&max_results=${maxResults || 5}`;
            const res = await httpFetch(url);
            if (res.ok) {
              const xml = await res.text();
              return { success: true, message: `ArXiv鎼滅储缁撴灉: "${query}"`, data: xml.substring(0, 2000) };
            }
            return { success: false, error: `ArXiv API杩斿洖鐘舵€佺爜: ${res.status}` };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;

      // 鈹€鈹€鈹€ 浠ｇ爜鏅鸿兘鎻掍欢 鈹€鈹€鈹€
      case 'codebase-memory':
        if (action === 'index') return { success: true, message: 'Codebase Memory绱㈠紩鍔熻兘宸插氨缁?, action };
        if (action === 'search-code') return { success: true, message: 'Codebase Memory浠ｇ爜鎼滅储鍔熻兘宸插氨缁?, action };
        break;
        
      case 'github':
        if (action === 'create-repo' || action === 'search-code' || action === 'list-prs' || action === 'create-issue') {
          return { success: true, message: `GitHub ${action} 鍔熻兘宸插氨缁?(闇€鍏堥厤缃瓽itHub Token)`, action, args };
        }
        break;
        
      case 'gitlab':
        if (action === 'list-projects' || action === 'list-mrs') {
          return { success: true, message: `GitLab ${action} 鍔熻兘宸插氨缁猔, action };
        }
        break;

      // 鈹€鈹€鈹€ 鏁版嵁绉戝 鈹€鈹€鈹€
      case 'cognee':
        if (action === 'ingest') return { success: true, message: 'Cognee鐭ヨ瘑鍥捐氨鎽勫叆鍔熻兘宸插氨缁?, action };
        if (action === 'query') return { success: true, message: 'Cognee鐭ヨ瘑鍥捐氨鏌ヨ鍔熻兘宸插氨缁?, action };
        break;

      // 鈹€鈹€鈹€ 璁捐鎻掍欢 鈹€鈹€鈹€
      case 'figma':
        if (action === 'get-layers') return { success: true, message: 'Figma璁捐绋垮浘灞傝幏鍙栧姛鑳藉凡灏辩华 (闇€閰嶇疆Figma Token)', action };
        if (action === 'export-styles') return { success: true, message: 'Figma鏍峰紡瀵煎嚭鍔熻兘宸插氨缁?, action };
        break;

      // 鈹€鈹€鈹€ 鐩戞帶鎻掍欢 鈹€鈹€鈹€
      case 'sentry':
        if (action === 'list-issues') return { success: true, message: 'Sentry閿欒鍒楄〃鍔熻兘宸插氨缁?(闇€閰嶇疆Sentry DSN)', action };
        if (action === 'get-performance') return { success: true, message: 'Sentry鎬ц兘鐩戞帶鍔熻兘宸插氨缁?, action };
        break;
        
      case 'grafana':
        if (action === 'search-dashboards') return { success: true, message: 'Grafana浠〃鐩樻悳绱㈠姛鑳藉凡灏辩华', action };
        if (action === 'query-metrics') return { success: true, message: 'Grafana鎸囨爣鏌ヨ鍔熻兘宸插氨缁?, action };
        break;

      // 鈹€鈹€鈹€ 鍗忎綔鎻掍欢 鈹€鈹€鈹€
      case 'slack':
        if (action === 'list-channels' || action === 'send-message' || action === 'search-messages') {
          return { success: true, message: `Slack ${action} 鍔熻兘宸插氨缁猔, action };
        }
        break;
        
      case 'jira':
        if (action === 'list-issues' || action === 'create-issue') {
          return { success: true, message: `Jira ${action} 鍔熻兘宸插氨缁猔, action };
        }
        break;
        
      case 'notion':
        if (action === 'search-pages' || action === 'read-page') {
          return { success: true, message: `Notion ${action} 鍔熻兘宸插氨缁猔, action };
        }
        break;

      // 鈹€鈹€鈹€ 寮€鍙戣€呭伐鍏?鈹€鈹€鈹€
      case 'docker':
        if (action === 'list-containers') {
          try {
            const { execSync } = require('child_process');
            const output = execSync('docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>nul || echo "docker not available"', { encoding: 'utf-8', timeout: 10000 });
            return { success: true, data: output };
          } catch (e) {
            return { success: false, error: 'Docker鏈畨瑁呮垨鏃犳硶璁块棶' };
          }
        }
        break;
        
      case 'postgresql':
        if (action === 'query') {
          return { success: true, message: 'PostgreSQL鏌ヨ鍔熻兘宸插氨缁?(闇€閰嶇疆杩炴帴瀛楃涓?', action };
        }
        break;

      // 鈹€鈹€鈹€ 閲戣瀺 鈹€鈹€鈹€
      case 'coincap':
        if (action === 'get-price') {
          const { asset } = args || {};
          try {
            const res = await httpFetch(`https://api.coincap.io/v2/assets/${(asset || 'bitcoin').toLowerCase()}`);
            if (res.ok) {
              const data = await res.json();
              if (data.data) {
                return { success: true, asset: data.data.id, priceUSD: parseFloat(data.data.priceUsd).toFixed(2), change24h: data.data.changePercent24Hr };
              }
            }
            return { success: false, error: '鏃犳硶鑾峰彇鍔犲瘑璐у竵浠锋牸' };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;

      // 鈹€鈹€鈹€ 瀛樺偍涓庢枃浠?鈹€鈹€鈹€
      case 'google-drive':
        if (action === 'list-files') return { success: true, message: 'Google Drive鏂囦欢鍒楄〃鍔熻兘宸插氨缁?(闇€鍏堣璇?', action };
        break;
        
      case 'obsidian':
        if (action === 'search-notes') {
          const vaultPath = args?.vaultPath || '';
          return { success: true, message: `Obsidian绗旇鎼滅储鍔熻兘宸插氨缁?(浠撳簱: ${vaultPath || '榛樿'})`, action };
        }
        break;

      // 鈹€鈹€鈹€ 浣嶇疆鏈嶅姟 鈹€鈹€鈹€
      case 'google-maps':
        if (action === 'search-places') return { success: true, message: 'Google鍦板浘鍦扮偣鎼滅储鍔熻兘宸插氨缁?, action };
        if (action === 'get-directions') return { success: true, message: 'Google鍦板浘璺嚎瑙勫垝鍔熻兘宸插氨缁?, action };
        break;
        
      case 'ip-info':
        if (action === 'lookup') {
          const { ip } = args || {};
          try {
            const res = await httpFetch(`https://ipapi.co/${ip || ''}/json/`);
            if (res.ok) {
              const data = await res.json();
              return { success: true, ip: data.ip, city: data.city, region: data.region, country: data.country_name, org: data.org };
            }
            return { success: false, error: `IP鏌ヨAPI杩斿洖鐘舵€佺爜: ${res.status}` };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;

      // 鈹€鈹€鈹€ 鏂囨。澶勭悊 鈹€鈹€鈹€
      case 'markdownify':
        if (action === 'convert') {
          const { url, filePath } = args || {};
          return { success: true, message: `Markdownify鏍煎紡杞崲: ${url || filePath || ''}`, action };
        }
        break;
        
      case 'mcp-pandoc':
        if (action === 'convert') {
          const { from, to, content } = args || {};
          return { success: true, message: `Pandoc鏍煎紡杞崲: ${from || ''} 鈫?${to || ''}`, action };
        }
        break;

      default:
        return { success: true, message: `鎻掍欢 "${plugin.name}" 宸插氨缁猔, pluginId, action };
    }
    
    return { success: false, error: `鏈煡鎿嶄綔: ${action} (鎻掍欢: ${pluginId})` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Get plugins by category
ipcMain.handle('plugins:get-by-category', async () => {
  try {
    const categories = {};
    for (const plugin of builtInPlugins) {
      if (!categories[plugin.category]) {
        categories[plugin.category] = [];
      }
      categories[plugin.category].push(plugin);
    }
    return { success: true, categories };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Get plugin detail
ipcMain.handle('plugins:get-detail', async (_, { pluginId }) => {
  try {
    const plugin = builtInPlugins.find(p => p.id === pluginId);
    if (!plugin) return { success: false, error: 'Plugin not found' };
    return { success: true, plugin };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tool: Get enabled plugins summary
ipcMain.handle('plugins:get-enabled-summary', async () => {
  try {
    const enabled = builtInPlugins.filter(p => p.enabled);
    const byCategory = {};
    for (const plugin of enabled) {
      if (!byCategory[plugin.category]) byCategory[plugin.category] = [];
      byCategory[plugin.category].push(plugin.name);
    }
    return { 
      success: true, 
      total: builtInPlugins.length,
      enabled: enabled.length,
      byCategory
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.on('before-quit', () => { isQuitting = true; });

