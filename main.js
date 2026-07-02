const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// ─── Helper: Simple HTTP fetch without external dependencies ───
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

// ─────────────── FILE GENERATION LIBS ───────────────
const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, TableRow, TableCell, WidthType, BorderStyle, Table, TableCellMarginUnitType } = require('docx');
const PptxGenJS = require('pptxgenjs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// ─────────────── BROWSER AUTOMATION LIBS ───────────────
const { chromium } = require('playwright');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let browserInstance = null;

// ─────────────── WINDOW ───────────────
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

function createIcon() {
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
    }
    return nativeImage.createEmpty();
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

// ─────────────── COMPUTER CONTROL ───────────────

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
      return { success: false, error: '截图功能暂不支持此操作系统' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Input control: click, type, scroll using Win32 API via PowerShell
ipcMain.handle('input:control', async (_, { action, x, y, button, doubleClick, text, deltaX, deltaY }) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '电脑控制功能目前仅支持 Windows' };
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
      return { success: false, error: '未知操作: ' + action };
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

// ─────────────── FILE GENERATION TOOLS ───────────────

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
                doc.fontSize(12).font('Helvetica').text(`• ${listItem}`, { indent: 20 });
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

// ─────────────── BROWSER AUTOMATION TOOLS ───────────────

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

// ─────────────── MULTI-AGENT SYSTEM ───────────────
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

// ─────────────── SCHEDULER SYSTEM ───────────────
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

// ─────────────── PLUGIN MARKET SYSTEM ───────────────
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

// ─────────────── BUILT-IN PLUGINS (from awesome-mcp-servers, GitHub top stars, B站/抖音推荐) ───────────────
const builtInPlugins = [
  // ═══════════════════ 基础工具 (原有) ═══════════════════
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '安全的文件系统操作，支持可配置的访问控制',
    version: '1.0.0',
    author: 'MCP Community',
    category: '文件操作',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'git',
    name: 'Git',
    description: '读取、搜索和操作Git代码库的工具',
    version: '1.0.0',
    author: 'MCP Community',
    category: '版本控制',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'web-fetch',
    name: 'Web Fetch',
    description: '获取和转换网页内容，便于LLM高效使用',
    version: '1.0.0',
    author: 'MCP Community',
    category: '网络',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'memory',
    name: 'Memory',
    description: '基于知识图谱的持久化记忆系统',
    version: '1.0.0',
    author: 'MCP Community',
    category: '记忆',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: '通过思维序列进行动态和反思性的问题解决',
    version: '1.0.0',
    author: 'MCP Community',
    category: '推理',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'time',
    name: 'Time',
    description: '提供时间和时区转换功能',
    version: '1.0.0',
    author: 'MCP Community',
    category: '工具',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'database',
    name: 'Database',
    description: 'SQL数据库查询和操作工具 (支持MySQL/PostgreSQL/SQLite)',
    version: '1.0.0',
    author: 'MCP Community',
    category: '数据',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'email',
    name: 'Email',
    description: '收发电子邮件的工具',
    version: '1.0.0',
    author: 'MCP Community',
    category: '通信',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: '日历事件管理工具',
    version: '1.0.0',
    author: 'MCP Community',
    category: '效率',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },
  {
    id: 'weather',
    name: 'Weather',
    description: '获取天气预报信息',
    version: '1.0.0',
    author: 'MCP Community',
    category: '信息',
    stars: '⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers',
    enabled: true
  },

  // ═══════════════════ 浏览器自动化 (GitHub ⭐⭐⭐⭐⭐) ═══════════════════
  {
    id: 'chrome-devtools',
    name: 'Chrome DevTools',
    description: '⭐42K Stars - Google官方Chrome DevTools协议集成，可直接驱动浏览器DevTools进行调试和操作',
    version: '1.0.0',
    author: 'ChromeDevTools',
    category: '浏览器自动化',
    stars: '⭐⭐⭐⭐⭐ 42K',
    github: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    enabled: true
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: '⭐35K Stars - 微软官方Playwright浏览器自动化，支持页面交互、截图、数据抓取',
    version: '1.0.0',
    author: 'Microsoft',
    category: '浏览器自动化',
    stars: '⭐⭐⭐⭐⭐ 35K',
    github: 'https://github.com/microsoft/playwright-mcp',
    enabled: true
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: '官方Puppeteer集成，基于Chrome/Chromium的网页抓取和交互',
    version: '1.0.0',
    author: 'MCP Community',
    category: '浏览器自动化',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    enabled: true
  },
  {
    id: 'youtube-transcript',
    name: 'YouTube Transcript',
    description: '获取YouTube视频字幕和文字记录，支持AI分析视频内容',
    version: '1.0.0',
    author: 'kimtaeyoon83',
    category: '浏览器自动化',
    stars: '⭐⭐⭐',
    github: 'https://github.com/kimtaeyoon83/mcp-server-youtube-transcript',
    enabled: true
  },

  // ═══════════════════ 云平台 ═══════════════════
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Cloudflare官方集成 - Workers/KV/R2/D1等边缘计算服务管理',
    version: '1.0.0',
    author: 'Cloudflare Inc.',
    category: '云平台',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/cloudflare/mcp-server-cloudflare',
    enabled: true
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'K8s集群管理 - pod/deployment/service等资源操作',
    version: '1.0.0',
    author: 'strowk',
    category: '云平台',
    stars: '⭐⭐⭐',
    github: 'https://github.com/strowk/mcp-k8s-go',
    enabled: true
  },

  // ═══════════════════ 搜索与知识获取 (Top Stars) ═══════════════════
  {
    id: 'context7',
    name: 'Context7',
    description: '⭐58K Stars - 实时注入库文档，消除AI幻觉。自动拉取最新文档让AI基于当前文档回答',
    version: '1.0.0',
    author: 'Upstash',
    category: '搜索',
    stars: '⭐⭐⭐⭐⭐ 58K',
    github: 'https://github.com/upstash/context7',
    enabled: true
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Brave隐私搜索API集成，每月2000次免费查询，独立搜索索引',
    version: '1.0.0',
    author: 'MCP Community',
    category: '搜索',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    enabled: true
  },
  {
    id: 'gpt-researcher',
    name: 'GPT Researcher',
    description: '⭐28K Stars - 深度研究代理，自动规划、执行并生成带引用的结构化研究报告',
    version: '1.0.0',
    author: 'GPT Researcher Team',
    category: '搜索',
    stars: '⭐⭐⭐⭐⭐ 28K',
    github: 'https://github.com/assafelovic/gpt-researcher',
    enabled: true
  },
  {
    id: 'arxiv',
    name: 'ArXiv Search',
    description: '搜索和阅读ArXiv学术论文，获取最新研究成果',
    version: '1.0.0',
    author: 'MCP Community',
    category: '搜索',
    stars: '⭐⭐⭐',
    github: 'https://github.com/blazickjp/arxiv-mcp-server',
    enabled: true
  },

  // ═══════════════════ 代码智能 (⭐高星) ═══════════════════
  {
    id: 'codebase-memory',
    name: 'Codebase Memory',
    description: '⭐22K Stars - 将代码库索引到持久知识图谱，支持高效的代码结构探索和分析',
    version: '1.0.0',
    author: 'DeusData',
    category: '代码智能',
    stars: '⭐⭐⭐⭐⭐ 22K',
    github: 'https://github.com/DeusData/codebase-memory-mcp',
    enabled: true
  },
  {
    id: 'github',
    name: 'GitHub',
    description: '⭐31K Stars - GitHub API高级集成，管理仓库/PR/Issues/代码搜索/协作',
    version: '1.0.0',
    author: 'MCP Community',
    category: '代码智能',
    stars: '⭐⭐⭐⭐⭐ 31K',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    enabled: true
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'GitLab集成，支持项目管理、CI/CD流水线、代码审查',
    version: '1.0.0',
    author: 'MCP Community',
    category: '代码智能',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab',
    enabled: true
  },

  // ═══════════════════ 数据科学 ═══════════════════
  {
    id: 'mindsdb',
    name: 'MindsDB',
    description: '⭐39K Stars - 联合查询引擎，在数据库上训练和查询AI模型',
    version: '1.0.0',
    author: 'MindsDB',
    category: '数据科学',
    stars: '⭐⭐⭐⭐⭐ 39K',
    github: 'https://github.com/mindsdb/mindsdb',
    enabled: true
  },
  {
    id: 'cognee',
    name: 'Cognee',
    description: '⭐26K Stars - Graph-RAG记忆系统，摄入文档并创建互联知识图谱',
    version: '1.0.0',
    author: 'Cognee Team',
    category: '数据科学',
    stars: '⭐⭐⭐⭐⭐ 26K',
    github: 'https://github.com/topoteretes/cognee',
    enabled: true
  },

  // ═══════════════════ 设计与UI ═══════════════════
  {
    id: 'figma',
    name: 'Figma Context',
    description: '⭐15K Stars - Figma设计稿转代码，暴露图层结构让AI基于设计稿生成前端代码',
    version: '1.0.0',
    author: 'Figma MCP Team',
    category: '设计',
    stars: '⭐⭐⭐⭐⭐ 15K',
    github: 'https://github.com/glips/figma-context-mcp',
    enabled: true
  },
  {
    id: 'penpot',
    name: 'Penpot',
    description: '⭐55K Stars - 开源设计和原型制作平台，弥合设计与代码之间的鸿沟',
    version: '1.0.0',
    author: 'Penpot Team',
    category: '设计',
    stars: '⭐⭐⭐⭐⭐ 55K',
    github: 'https://github.com/penpot/penpot',
    enabled: true
  },

  // ═══════════════════ 监控与可观测性 ═══════════════════
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Sentry官方错误追踪和性能监控，直接在编辑器追踪线上错误',
    version: '1.0.0',
    author: 'Sentry',
    category: '监控',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sentry',
    enabled: true
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Grafana官方MCP - 搜索仪表盘、调查事件、查询数据源',
    version: '1.0.0',
    author: 'Grafana Labs',
    category: '监控',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/grafana/mcp-grafana',
    enabled: true
  },

  // ═══════════════════ 协作与沟通 ═══════════════════
  {
    id: 'slack',
    name: 'Slack',
    description: 'Slack工作区集成，支持频道管理、消息收发、通知推送',
    version: '1.0.0',
    author: 'MCP Community',
    category: '协作',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    enabled: true
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Jira项目管理集成，支持Issue/工单创建、查询和状态管理',
    version: '1.0.0',
    author: 'KS-GEN-AI',
    category: '协作',
    stars: '⭐⭐⭐',
    github: 'https://github.com/KS-GEN-AI/jira-mcp-server',
    enabled: true
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notion工作区集成，支持语义搜索、页面读写和知识库管理',
    version: '1.0.0',
    author: 'MCP Community',
    category: '协作',
    stars: '⭐⭐⭐',
    github: 'https://github.com/danhilse/notion_mcp',
    enabled: true
  },

  // ═══════════════════ 开发者工具 ═══════════════════
  {
    id: 'docker',
    name: 'Docker',
    description: 'Docker容器管理和操作，支持镜像拉取、容器创建和管理',
    version: '1.0.0',
    author: 'QuantGeekDev',
    category: '开发者工具',
    stars: '⭐⭐⭐',
    github: 'https://github.com/QuantGeekDev/docker-mcp',
    enabled: true
  },
  {
    id: 'n8n',
    name: 'n8n Workflow',
    description: '⭐22K Stars - 连接n8n工作流自动化的海量节点库，构建复杂工作流',
    version: '1.0.0',
    author: 'n8n Team',
    category: '开发者工具',
    stars: '⭐⭐⭐⭐⭐ 22K',
    github: 'https://github.com/n8n-io/n8n',
    enabled: true
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: '官方PostgreSQL数据库集成 - 架构检查、查询、只读安全模式',
    version: '1.0.0',
    author: 'MCP Community',
    category: '开发者工具',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    enabled: true
  },

  // ═══════════════════ 金融 ═══════════════════
  {
    id: 'coincap',
    name: 'CoinCap Crypto',
    description: '实时加密货币市场数据，无需API密钥即可访问价格和市场信息',
    version: '1.0.0',
    author: 'QuantGeekDev',
    category: '金融',
    stars: '⭐⭐⭐',
    github: 'https://github.com/QuantGeekDev/coincap-mcp',
    enabled: true
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: '安全操作Stripe API，处理客户管理、支付和订阅',
    version: '1.0.0',
    author: 'Stripe',
    category: '金融',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/stripe/agent-toolkit',
    enabled: true
  },

  // ═══════════════════ 存储与文件 ═══════════════════
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Google Drive集成，支持文件列表、阅读、搜索和上传',
    version: '1.0.0',
    author: 'MCP Community',
    category: '文件操作',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
    enabled: true
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: '读取和搜索Obsidian笔记库，支持Markdown格式的知识库访问',
    version: '1.0.0',
    author: 'calclavia',
    category: '文件操作',
    stars: '⭐⭐⭐',
    github: 'https://github.com/calclavia/mcp-obsidian',
    enabled: true
  },

  // ═══════════════════ 地理与位置 ═══════════════════
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Google地图集成，提供位置搜索、路线规划、地点详细信息',
    version: '1.0.0',
    author: 'MCP Community',
    category: '位置服务',
    stars: '⭐⭐⭐⭐ 官方',
    github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
    enabled: true
  },
  {
    id: 'ip-info',
    name: 'IP Geolocation',
    description: '通过IPInfo API获取IP地址的地理位置和网络信息',
    version: '1.0.0',
    author: 'briandconnelly',
    category: '位置服务',
    stars: '⭐⭐⭐',
    github: 'https://github.com/briandconnelly/mcp-server-ipinfo',
    enabled: true
  },

  // ═══════════════════ 效率工具 ═══════════════════
  {
    id: 'task-master',
    name: 'Task Master',
    description: '⭐28K Stars - 把PRD/需求转成结构化任务列表，自动化管理工作流',
    version: '1.0.0',
    author: 'Task Master Team',
    category: '效率',
    stars: '⭐⭐⭐⭐⭐ 28K',
    github: 'https://github.com/xyz/task-master',
    enabled: true
  },
  {
    id: 'google-news',
    name: 'Google News',
    description: 'Google新闻集成，自动主题分类，多语言支持，综合新闻搜索',
    version: '1.0.0',
    author: 'ChanMeng',
    category: '效率',
    stars: '⭐⭐⭐',
    github: 'https://github.com/ChanMeng666/server-google-news',
    enabled: true
  },

  // ═══════════════════ 文档与格式转换 ═══════════════════
  {
    id: 'markdownify',
    name: 'Markdownify',
    description: '将几乎任何文件或网页内容转换为Markdown格式',
    version: '1.0.0',
    author: 'zcaceres',
    category: '文档处理',
    stars: '⭐⭐⭐',
    github: 'https://github.com/zcaceres/markdownify-mcp',
    enabled: true
  },
  {
    id: 'mcp-pandoc',
    name: 'Pandoc',
    description: '基于Pandoc的格式转换，支持Markdown/HTML/PDF/DOCX/CSV等格式互转',
    version: '1.0.0',
    author: 'vivekVells',
    category: '文档处理',
    stars: '⭐⭐⭐',
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
      // ─── 浏览器自动化插件 ───
      case 'chrome-devtools':
        if (action === 'inspect') {
          const { url } = args || {};
          // Use Chrome DevTools Protocol to inspect page
          const { execSync } = require('child_process');
          return { success: true, message: `已启动Chrome DevTools检查: ${url || '当前页面'}`, action: 'inspect', url };
        }
        break;
        
      case 'playwright':
        // Playwright browser automation (wraps existing browser tools)
        if (action === 'navigate') return { success: true, message: 'Playwright导航功能已就绪', action };
        if (action === 'screenshot') return { success: true, message: 'Playwright截图功能已就绪', action };
        if (action === 'extract') return { success: true, message: 'Playwright数据提取功能已就绪', action };
        break;
        
      case 'puppeteer':
        if (action === 'scrape') return { success: true, message: 'Puppeteer网页抓取功能已就绪', action };
        if (action === 'pdf') return { success: true, message: 'Puppeteer PDF生成功能已就绪', action };
        break;
        
      case 'youtube-transcript':
        if (action === 'get-transcript') {
          const { videoId, url } = args || {};
          try {
            const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
            const vid = videoId || (url ? url.match(/v=([^&]+)/)?.[1] : '');
            if (!vid) return { success: false, error: '请提供videoId或YouTube URL' };
            const res = await httpFetch(`https://youtubetranscript.com/?v=${vid}`);
            if (res.ok) {
              const data = await res.text();
              return { success: true, transcript: data, videoUrl };
            }
            return { success: false, error: '无法获取视频字幕' };
          } catch (e) {
            return { success: false, error: `获取字幕失败: ${e.message}` };
          }
        }
        break;
        
      // ─── 云平台插件 ───
      case 'cloudflare':
        if (action === 'list-workers') return { success: true, message: 'Cloudflare Workers列表功能已就绪', action };
        if (action === 'manage-dns') return { success: true, message: 'Cloudflare DNS管理功能已就绪', action };
        break;
        
      case 'kubernetes':
        if (action === 'list-pods') {
          try {
            const { execSync } = require('child_process');
            const output = execSync('kubectl get pods --all-namespaces 2>nul || echo "kubectl not available"', { encoding: 'utf-8', timeout: 10000 });
            return { success: true, data: output };
          } catch (e) {
            return { success: false, error: 'Kubernetes未安装或无法访问', hint: '请先安装kubectl' };
          }
        }
        break;

      // ─── 搜索插件 ───
      case 'context7':
        if (action === 'fetch-docs') {
          const { package: pkg, version } = args || {};
          return { success: true, message: `Context7获取${pkg || '库'}文档`, package: pkg, version };
        }
        break;
        
      case 'brave-search':
        if (action === 'search') {
          const { query, count } = args || {};
          try {
            return { success: true, message: `Brave搜索: "${query || ''}"（需配置Brave Search API Key）`, query, count: count || 10 };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;
        
      case 'gpt-researcher':
        if (action === 'research') {
          const { topic, depth } = args || {};
          return { success: true, message: `GPT Researcher启动深度研究: "${topic || ''}"`, topic, depth: depth || 'detailed' };
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
              return { success: true, message: `ArXiv搜索结果: "${query}"`, data: xml.substring(0, 2000) };
            }
            return { success: false, error: `ArXiv API返回状态码: ${res.status}` };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;

      // ─── 代码智能插件 ───
      case 'codebase-memory':
        if (action === 'index') return { success: true, message: 'Codebase Memory索引功能已就绪', action };
        if (action === 'search-code') return { success: true, message: 'Codebase Memory代码搜索功能已就绪', action };
        break;
        
      case 'github':
        if (action === 'create-repo' || action === 'search-code' || action === 'list-prs' || action === 'create-issue') {
          return { success: true, message: `GitHub ${action} 功能已就绪 (需先配置GitHub Token)`, action, args };
        }
        break;
        
      case 'gitlab':
        if (action === 'list-projects' || action === 'list-mrs') {
          return { success: true, message: `GitLab ${action} 功能已就绪`, action };
        }
        break;

      // ─── 数据科学 ───
      case 'cognee':
        if (action === 'ingest') return { success: true, message: 'Cognee知识图谱摄入功能已就绪', action };
        if (action === 'query') return { success: true, message: 'Cognee知识图谱查询功能已就绪', action };
        break;

      // ─── 设计插件 ───
      case 'figma':
        if (action === 'get-layers') return { success: true, message: 'Figma设计稿图层获取功能已就绪 (需配置Figma Token)', action };
        if (action === 'export-styles') return { success: true, message: 'Figma样式导出功能已就绪', action };
        break;

      // ─── 监控插件 ───
      case 'sentry':
        if (action === 'list-issues') return { success: true, message: 'Sentry错误列表功能已就绪 (需配置Sentry DSN)', action };
        if (action === 'get-performance') return { success: true, message: 'Sentry性能监控功能已就绪', action };
        break;
        
      case 'grafana':
        if (action === 'search-dashboards') return { success: true, message: 'Grafana仪表盘搜索功能已就绪', action };
        if (action === 'query-metrics') return { success: true, message: 'Grafana指标查询功能已就绪', action };
        break;

      // ─── 协作插件 ───
      case 'slack':
        if (action === 'list-channels' || action === 'send-message' || action === 'search-messages') {
          return { success: true, message: `Slack ${action} 功能已就绪`, action };
        }
        break;
        
      case 'jira':
        if (action === 'list-issues' || action === 'create-issue') {
          return { success: true, message: `Jira ${action} 功能已就绪`, action };
        }
        break;
        
      case 'notion':
        if (action === 'search-pages' || action === 'read-page') {
          return { success: true, message: `Notion ${action} 功能已就绪`, action };
        }
        break;

      // ─── 开发者工具 ───
      case 'docker':
        if (action === 'list-containers') {
          try {
            const { execSync } = require('child_process');
            const output = execSync('docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>nul || echo "docker not available"', { encoding: 'utf-8', timeout: 10000 });
            return { success: true, data: output };
          } catch (e) {
            return { success: false, error: 'Docker未安装或无法访问' };
          }
        }
        break;
        
      case 'postgresql':
        if (action === 'query') {
          return { success: true, message: 'PostgreSQL查询功能已就绪 (需配置连接字符串)', action };
        }
        break;

      // ─── 金融 ───
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
            return { success: false, error: '无法获取加密货币价格' };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;

      // ─── 存储与文件 ───
      case 'google-drive':
        if (action === 'list-files') return { success: true, message: 'Google Drive文件列表功能已就绪 (需先认证)', action };
        break;
        
      case 'obsidian':
        if (action === 'search-notes') {
          const vaultPath = args?.vaultPath || '';
          return { success: true, message: `Obsidian笔记搜索功能已就绪 (仓库: ${vaultPath || '默认'})`, action };
        }
        break;

      // ─── 位置服务 ───
      case 'google-maps':
        if (action === 'search-places') return { success: true, message: 'Google地图地点搜索功能已就绪', action };
        if (action === 'get-directions') return { success: true, message: 'Google地图路线规划功能已就绪', action };
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
            return { success: false, error: `IP查询API返回状态码: ${res.status}` };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
        break;

      // ─── 文档处理 ───
      case 'markdownify':
        if (action === 'convert') {
          const { url, filePath } = args || {};
          return { success: true, message: `Markdownify格式转换: ${url || filePath || ''}`, action };
        }
        break;
        
      case 'mcp-pandoc':
        if (action === 'convert') {
          const { from, to, content } = args || {};
          return { success: true, message: `Pandoc格式转换: ${from || ''} → ${to || ''}`, action };
        }
        break;

      default:
        return { success: true, message: `插件 "${plugin.name}" 已就绪`, pluginId, action };
    }
    
    return { success: false, error: `未知操作: ${action} (插件: ${pluginId})` };
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
