// ═══════════════════════ KK-BUDDY DESKTOP APP ═══════════════════════
const API = window.electronAPI;

// ─── TOOL DEFINITIONS (for Agent mode) ───
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Execute a shell command and return stdout/stderr. Use for running scripts, checking files, git operations, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (optional)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute or relative file path' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates the file and parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories at the given path.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by finding and replacing specific text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_text: { type: 'string', description: 'Exact text to find' },
          new_text: { type: 'string', description: 'Text to replace with' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Search for a pattern (regex supported) in file contents within a directory. Returns matching file paths and line contents.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory or file path to search in' },
          file_pattern: { type: 'string', description: 'Optional glob pattern to filter files (e.g. "*.js", "**/*.ts")' },
          max_results: { type: 'number', description: 'Maximum number of results to return (default 50)' }
        },
        required: ['pattern', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_multiple_files',
      description: 'Read the contents of multiple files at once. Returns an array of file contents.',
      parameters: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to read' }
        },
        required: ['paths']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Recursively list files in a directory with optional glob pattern filtering. Returns file paths, sizes, and types.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Root directory path' },
          pattern: { type: 'string', description: 'Optional glob pattern (e.g. "*.js", "**/*.tsx")' },
          max_depth: { type: 'number', description: 'Maximum directory depth to recurse (default 5)' },
          max_results: { type: 'number', description: 'Maximum number of results (default 200)' }
        },
        required: ['path']
      }
    }
  },
  // ─── Web Tools ───
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information. Returns a list of search results with titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Max results to return (default 8)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch the content of a web page by URL. Returns the text content of the page.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
          max_length: { type: 'number', description: 'Max characters to return (default 100000)' }
        },
        required: ['url']
      }
    }
  },
  // ─── Memory Tools ───
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description: 'Save important information to persistent memory. Use this to remember user preferences, project conventions, decisions, or any facts that will be useful in future conversations.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'A short unique key for this memory (e.g. "user-preference-language")' },
          content: { type: 'string', description: 'The information to remember' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for categorization' }
        },
        required: ['key', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_search',
      description: 'Search persistent memory for previously stored information. Returns matching memories ranked by relevance.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query to find relevant memories' },
          limit: { type: 'number', description: 'Max results (default 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_delete',
      description: 'Delete a specific memory entry by its key.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The key of the memory to delete' }
        },
        required: ['key']
      }
    }
  },
  // ─── Skills Tool ───
  {
    type: 'function',
    function: {
      name: 'load_skill',
      description: 'Load a skill (specialized knowledge/workflow) to enhance your capabilities for the current task. Use when the user request matches a skill description.',
      parameters: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: 'The directory name of the skill to load' }
        },
        required: ['skill_name']
      }
    }
  },
  // ─── Computer Control Tools ───
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: 'Capture a screenshot of the entire screen or a specific region. Returns the image as base64 PNG. Use this to see the current state of the desktop or a specific window.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate of the capture region (optional, default: full screen)' },
          y: { type: 'number', description: 'Y coordinate of the capture region' },
          width: { type: 'number', description: 'Width of the capture region' },
          height: { type: 'number', description: 'Height of the capture region' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description: 'Click the mouse at the specified screen coordinates. Supports left, right, and middle buttons, as well as double-click.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate to click' },
          y: { type: 'number', description: 'Y coordinate to click' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
          doubleClick: { type: 'boolean', description: 'Double click (default: false)' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: 'Type text at the current cursor position using simulated keyboard input. Supports special keys like {enter}, {tab}, {escape}, {backspace}, {delete}.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type. Use {enter}, {tab}, {escape}, {backspace}, {delete} for special keys.' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scroll the mouse wheel at the current cursor position. Positive delta scrolls up, negative scrolls down.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate to scroll at' },
          y: { type: 'number', description: 'Y coordinate to scroll at' },
          deltaX: { type: 'number', description: 'Horizontal scroll amount (default: 0)' },
          deltaY: { type: 'number', description: 'Vertical scroll amount (positive=up, negative=down, default: -300)' }
        },
        required: ['x', 'y']
      }
    }
  }
];

// ─── CAVEMAN MODE PROMPT (token saving ~65-75%) ───
const CAVEMAN_PROMPTS = {
  lite: `## Caveman Mode (Lite)
No filler or hedging words. Keep articles and full sentences. Professional but tight.
Drop: filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging (maybe/perhaps/I think/I believe).
No tool-call narration. No decorative tables or emoji. Don't dump long raw error logs — quote shortest decisive line.
Standard well-known tech acronyms OK (DB/API/HTTP); never invent new abbreviations.
Preserve user's language. Code blocks unchanged. Errors quoted exact.`,

  full: `## Caveman Mode (Full) — Token Saver ~65-75%
Respond terse. All technical substance stays. Only fluff dies.

ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. Off only: "stop caveman" / "normal mode".

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). No tool-call narration, no decorative tables/emoji, no dumping long raw error logs unless asked — quote shortest decisive line. Standard well-known tech acronyms OK (DB/API/HTTP); never invent new abbreviations reader can't decode. Technical terms exact. Code blocks unchanged. Errors quoted exact.

Preserve user's language. No self-reference. Never name the style. No "caveman mode on" tags.
Pattern: [thing] [action] [reason]. [next step].
Not: "Sure! I'd be happy to help. The issue is likely caused by..."
Yes: "Bug in auth middleware. Token expiry check use < not <=. Fix:"

Drop caveman for: security warnings, irreversible action confirmations, multi-step sequences where fragments risk misread. Resume after clear part done.
Code/commits/PRs: write normal. "stop caveman" / "normal mode": revert.`,

  ultra: `## Caveman Mode (Ultra) — Token Saver ~80-90%
MAX TERSE. Abbreviate prose words (DB/auth/config/req/res/fn/impl) — prose only, never real code symbols/function names. Strip conjunctions. Arrows for causality (X → Y). One word when one word enough.
Code symbols, function names, API names, error strings: NEVER abbreviate.
No articles, no filler, no pleasantries, no hedging, no narration. Fragments. Telegraphic.
Preserve user's language. No self-reference. No style announcement.
Code/commits: normal. "stop caveman": revert.
Pattern: X → Y → Z. Fix: code.`,

  'wenyan-lite': `## 穴居人模式 (文言·浅)
去浮词、去赘语，保留文法结构，用浅近文言。技术术语、代码、命令保持原样。
勿自称、勿言模式名。安全警告、不可逆操作用白话。`,

  'wenyan-full': `## 穴居人模式 (文言·深)
极简书文言。动词前置，主语常省，用文言虚词（之/乃/為/不）。技术术语、代码原样。
勿自称、勿言模式名。80-90%字数削减。安全警告用白话。`,

  'wenyan-ultra': `## 穴居人模式 (文言·极)
极简文言。字字珠玑。代码不缩。安全白话。勿自称。`
};

// ─── APP STATE ───
const App = {
  conversations: [],
  currentId: null,
  config: {},
  isStreaming: false,
  abortCtrl: null,
  attachedImages: [],
  attachedFiles: [],
  sidebarOpen: true,
  searchQuery: '',
  customModels: [],
  _skillsCatalog: [],
  _loadedSkillContent: null,
  defaultModels: [
    { id: 'gpt-4.1', name: 'GPT-4.1', url: 'https://api.openai.com/v1', key: '', api: 'chat' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', url: 'https://api.deepseek.com/v1', key: '', api: 'chat' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', url: 'https://api.deepseek.com/v1', key: '', api: 'chat' },
    { id: 'qwen-plus', name: '通义千问 Plus', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: '', api: 'chat' },
    { id: 'kimi-k2.6', name: 'Kimi K2.6', url: 'https://api.moonshot.cn/v1', key: '', api: 'chat' },
    { id: 'glm-5', name: '智谱 GLM-5', url: 'https://open.bigmodel.cn/api/paas/v4', key: '', api: 'chat' },
    { id: 'mimo-v2.5', name: 'MiMo v2.5', url: 'https://api.xiaomimimo.com/v1', key: '', api: 'chat' },
  ],

  // ─── INIT ───
  async init() {
    this.loadConfig();
    this.loadCustomModels();
    this.loadConvs();
    this.renderConvList();
    this.updateModelBadge();
    this.updateProjectDisplay();
    this.showWelcome();
    this.setupKeyboard();
    this.setupDragDrop();
    this.loadSkillsCatalog();
    // Init route bar
    document.querySelectorAll('.route-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === (this.config.routeMode || 'auto')));
    await this.checkConnection();
    document.getElementById('msg-input').focus();
  },

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); this.toggleSidebar(); }
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); this.newChat(); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); this.exportChat(); }
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); this.openSettings(); }
      if (e.key === 'Escape' && this.isStreaming) this.stopGen();
    });
  },

  setupDragDrop() {
    const overlay = document.getElementById('drop-overlay');
    let dragCounter = 0;
    const textExts = ['.txt','.md','.json','.js','.ts','.py','.java','.cpp','.c','.h','.css','.html','.xml','.yaml','.yml','.sql','.sh','.bat','.ps1','.csv','.log','.ini','.toml','.rs','.go','.rb','.php','.swift','.kt','.scala','.r','.lua','.conf','.cfg','.env','.gitignore','.dockerfile','.makefile'];

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer.types.includes('Files')) overlay.classList.add('active');
    });
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('active'); }
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      files.forEach(f => {
        if (f.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => { this.attachedImages.push(ev.target.result); this.renderImgPreview(); };
          reader.readAsDataURL(f);
        } else {
          const ext = '.' + f.name.split('.').pop().toLowerCase();
          if (!textExts.includes(ext)) { this.toast('不支持的文件类型: ' + f.name, 'err'); return; }
          if (f.size > 500000) { this.toast('文件过大 (最大 500KB): ' + f.name, 'err'); return; }
          const reader = new FileReader();
          reader.onload = (ev) => { this.attachedFiles.push({ name: f.name, size: f.size, content: ev.target.result }); this.renderFilePreview(); };
          reader.readAsText(f);
        }
      });
      this.autoResize(document.getElementById('msg-input'));
    });
  },

  // ─── CONFIG ───
  loadConfig() {
    const def = {
      model: 'deepseek-v4-pro',
      effort: 'medium',
      maxTokens: 16384,
      temperature: 0.7,
      systemPrompt: '你是一个专业的 AI 编程助手，擅长编写、调试和优化代码。请用中文回答问题，提供清晰准确的技术建议。当需要时，你可以执行 shell 命令、读写文件来完成任务。',
      agentMode: true,
      maxTurns: 10,
      projectPath: '',
      cheapModel: '',
      routeMode: 'auto',
      compressTools: true,
      historyLimit: 8,
      cavemanMode: false,
      cavemanLevel: 'full',
      computerControl: false
    };
    try { this.config = { ...def, ...JSON.parse(localStorage.getItem('cdx_cfg') || '{}') }; }
    catch { this.config = def; }
    // Migrate old config: if baseUrl/apiKey exist at top level, create a model entry
    const oldCfg = JSON.parse(localStorage.getItem('cdx_cfg') || '{}');
    if (oldCfg.baseUrl && !this.customModels.length) {
      this.customModels = [{ id: oldCfg.model || 'mimo-v2.5', name: 'MiMo v2.5', url: oldCfg.baseUrl, key: oldCfg.apiKey || 'mimo2codex-local', api: 'chat' }];
      this.saveCustomModels();
    }
    // Migrate deprecated model IDs (2026-06)
    const modelIdMap = {
      'gpt-4o': 'gpt-4.1', 'deepseek-chat': 'deepseek-v4-pro',
      'deepseek-reasoner': 'deepseek-v4-flash', 'moonshot-v1-auto': 'kimi-k2.6',
      'glm-4-plus': 'glm-5'
    };
    if (modelIdMap[this.config.model]) {
      this.config.model = modelIdMap[this.config.model];
      this.saveConfig();
    }
  },

  loadCustomModels() {
    try { this.customModels = JSON.parse(localStorage.getItem('cdx_models') || '[]'); }
    catch { this.customModels = []; }
    if (!this.customModels.length) {
      this.customModels = [...this.defaultModels];
      this.saveCustomModels();
    }
    // Migrate deprecated model IDs in saved model list
    const nameMap = {
      'gpt-4o': 'GPT-4.1', 'deepseek-chat': 'DeepSeek V4 Pro',
      'deepseek-reasoner': 'DeepSeek V4 Flash', 'moonshot-v1-auto': 'Kimi K2.6',
      'glm-4-plus': '智谱 GLM-5'
    };
    let migrated = false;
    this.customModels.forEach(m => {
      const idMap = { 'gpt-4o': 'gpt-4.1', 'deepseek-chat': 'deepseek-v4-pro', 'deepseek-reasoner': 'deepseek-v4-flash', 'moonshot-v1-auto': 'kimi-k2.6', 'glm-4-plus': 'glm-5' };
      if (idMap[m.id]) { m.id = idMap[m.id]; migrated = true; }
      if (nameMap[m.id]) { m.name = nameMap[m.id]; }
    });
    if (migrated) this.saveCustomModels();
  },

  saveCustomModels() { localStorage.setItem('cdx_models', JSON.stringify(this.customModels)); },

  getActiveModel() {
    return this.customModels.find(m => m.id === this.config.model) || this.customModels[0] || this.defaultModels[0];
  },

  updateModelBadge() {
    const m = this.getActiveModel();
    const el = document.getElementById('badge-model-name');
    if (el) el.textContent = m ? m.name : '自定义大模型';
  },

  saveConfig() { localStorage.setItem('cdx_cfg', JSON.stringify(this.config)); },

  // ─── CONVERSATIONS ───
  loadConvs() {
    try { this.conversations = JSON.parse(localStorage.getItem('cdx_convs') || '[]'); }
    catch { this.conversations = []; }
  },

  saveConvs() { localStorage.setItem('cdx_convs', JSON.stringify(this.conversations)); },

  getConv(id) { return this.conversations.find(c => c.id === id); },

  newChat() {
    const conv = { id: 'c' + Date.now().toString(36), title: '新对话', messages: [], createdAt: Date.now(), model: this.config.model };
    this.conversations.unshift(conv);
    this.saveConvs();
    this.switchConv(conv.id);
  },

  switchConv(id) {
    this.currentId = id;
    const conv = this.getConv(id);
    if (!conv) return;
    document.getElementById('tb-title').textContent = conv.title;
    this.renderMessages(conv.messages);
    this.renderConvList();
  },

  deleteConv(id, e) {
    e.stopPropagation();
    this.conversations = this.conversations.filter(c => c.id !== id);
    this.saveConvs();
    if (this.currentId === id) { this.currentId = null; this.showWelcome(); document.getElementById('tb-title').textContent = '新对话'; }
    this.renderConvList();
  },

  startRenameConv(id, titleEl) {
    const conv = this.getConv(id);
    if (!conv) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ci-title-input';
    input.value = conv.title;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    const finish = (save) => {
      if (save && input.value.trim()) {
        conv.title = input.value.trim().slice(0, 64);
        this.saveConvs();
        if (this.currentId === id) document.getElementById('tb-title').textContent = conv.title;
      }
      this.renderConvList();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  },

  clearChat() {
    const conv = this.getConv(this.currentId);
    if (!conv) return;
    conv.messages = [];
    this.saveConvs();
    this.renderMessages([]);
    this.showWelcome();
    document.getElementById('tb-title').textContent = '新对话';
  },

  filterConvs(q) {
    this.searchQuery = q.toLowerCase();
    this.renderConvList();
  },

  // ─── RENDER ───
  renderConvList() {
    const list = document.getElementById('conv-list');
    list.innerHTML = '';
    const filtered = this.searchQuery
      ? this.conversations.filter(c => c.title.toLowerCase().includes(this.searchQuery) || c.messages.some(m => m.content?.toLowerCase().includes(this.searchQuery)))
      : this.conversations;

    if (filtered.length === 0) {
      list.innerHTML = '<li style="padding:16px;text-align:center;color:var(--text-3);font-size:12px">暂无对话</li>';
      return;
    }

    // Group by date
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let lastGroup = '';

    filtered.forEach(c => {
      const d = new Date(c.createdAt).toDateString();
      let group = '';
      if (d === today) group = '今天';
      else if (d === yesterday) group = '昨天';
      else group = new Date(c.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

      if (group !== lastGroup) {
        lastGroup = group;
        const lbl = document.createElement('li');
        lbl.className = 'sb-label';
        lbl.textContent = group;
        lbl.style.padding = '10px 10px 4px';
        list.appendChild(lbl);
      }

      const li = document.createElement('li');
      li.className = 'conv-item' + (c.id === this.currentId ? ' active' : '');
      li.onclick = () => this.switchConv(c.id);
      const timeStr = new Date(c.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `<span class="ci-title">${this.esc(c.title)}</span><span class="ci-time">${timeStr}</span><span class="ci-del" onclick="App.deleteConv('${c.id}',event)" title="删除">&times;</span>`;
      li.querySelector('.ci-title').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startRenameConv(c.id, e.currentTarget);
      });
      list.appendChild(li);
    });
  },

  // ─── SETTINGS TABS ───
  settingsTab(tab) {
    document.querySelectorAll('.s-tab').forEach((el, i) => {
      el.classList.toggle('active', ['model','general','agent','memory','skills'][i] === tab);
    });
    document.getElementById('panel-model').style.display = tab === 'model' ? '' : 'none';
    document.getElementById('panel-general').style.display = tab === 'general' ? '' : 'none';
    document.getElementById('panel-agent').style.display = tab === 'agent' ? '' : 'none';
    document.getElementById('panel-memory').style.display = tab === 'memory' ? '' : 'none';
    document.getElementById('panel-skills').style.display = tab === 'skills' ? '' : 'none';
    if (tab === 'memory') this.renderMemoryList();
    if (tab === 'skills') this.renderSkillsList();
  },

  // ─── MODEL LIST ───
  renderModelList() {
    const el = document.getElementById('model-list');
    if (!el) return;
    el.innerHTML = '';
    this.customModels.forEach(m => {
      const isActive = m.id === this.config.model;
      const div = document.createElement('div');
      div.className = 'ml-item' + (isActive ? ' active' : '');
      div.innerHTML = `
        <div class="ml-info">
          <div class="ml-name">${this.esc(m.name)} ${isActive ? '<span style="color:var(--green);font-size:11px;font-weight:400">· 当前使用</span>' : ''}</div>
          <div class="ml-url">${this.esc(m.url)}</div>
        </div>
        <span class="ml-api">Chat</span>
        <div class="ml-actions">
          <button onclick="App.editModel('${m.id}')" title="编辑">✎</button>
          <button class="del" onclick="App.deleteModel('${m.id}')" title="删除">×</button>
        </div>`;
      el.appendChild(div);
    });
    // Update model select dropdown
    const sel = document.getElementById('cfg-model');
    if (sel) {
      sel.innerHTML = '';
      this.customModels.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.name;
        sel.appendChild(opt);
      });
      sel.value = this.config.model;
    }
  },

  addModelForm() {
    document.getElementById('model-form-title').textContent = '添加新模型';
    document.getElementById('mf-edit-id').value = '';
    document.getElementById('mf-name').value = '';
    document.getElementById('mf-id').value = '';
    document.getElementById('mf-url').value = '';
    document.getElementById('mf-key').value = '';
    document.getElementById('add-model-form').style.display = 'block';
  },

  editModel(id) {
    const m = this.customModels.find(x => x.id === id);
    if (!m) return;
    document.getElementById('model-form-title').textContent = '编辑模型';
    document.getElementById('mf-edit-id').value = id;
    document.getElementById('mf-name').value = m.name;
    document.getElementById('mf-id').value = m.id;
    document.getElementById('mf-url').value = m.url;
    document.getElementById('mf-key').value = m.key;
    document.getElementById('add-model-form').style.display = 'block';
  },

  saveModelForm() {
    const editId = document.getElementById('mf-edit-id').value;
    const name = document.getElementById('mf-name').value.trim();
    const id = document.getElementById('mf-id').value.trim();
    const url = document.getElementById('mf-url').value.trim();
    const key = document.getElementById('mf-key').value.trim();
    if (!name || !id || !url) { this.toast('请填写名称、ID 和 API 地址', 'err'); return; }
    if (editId) {
      const m = this.customModels.find(x => x.id === editId);
      if (m) { m.name = name; m.id = id; m.url = url; m.key = key; m.api = 'chat'; }
      if (editId === this.config.model) this.config.model = id;
    } else {
      if (this.customModels.find(x => x.id === id)) { this.toast('模型 ID 已存在', 'err'); return; }
      this.customModels.push({ id, name, url, key, api: 'chat' });
    }
    this.saveCustomModels();
    this.renderModelList();
    this.updateModelBadge();
    document.getElementById('add-model-form').style.display = 'none';
    this.toast(editId ? '模型已更新' : '模型已添加', 'ok');
  },

  cancelModelForm() {
    document.getElementById('add-model-form').style.display = 'none';
  },

  deleteModel(id) {
    if (this.customModels.length <= 1) { this.toast('至少保留一个模型', 'err'); return; }
    this.customModels = this.customModels.filter(m => m.id !== id);
    if (this.config.model === id) this.config.model = this.customModels[0].id;
    this.saveCustomModels();
    this.saveConfig();
    this.renderModelList();
    this.updateModelBadge();
    this.checkConnection();
    this.toast('模型已删除', 'ok');
  },

  renderMessages(msgs) {
    const inner = document.getElementById('chat-inner');
    inner.innerHTML = '';
    if (msgs.length === 0) { this.showWelcome(); return; }
    const ws = document.getElementById('welcome-screen');
    if (ws) ws.remove();
    msgs.forEach(m => this.appendMsg(m.role, m.content, m.reasoning, m.toolCalls, m.images, false, m.files));
    this.scrollBottom();
  },

  showWelcome() {
    const inner = document.getElementById('chat-inner');
    inner.innerHTML = `<div class="welcome" id="welcome-screen">
      <h1>KK-Buddy Desktop</h1>
      <p class="sub">本地 AI 编程助手 · 由自定义大模型驱动</p>
      <div class="welcome-grid">
        <div class="wc" onclick="App.quickStart('帮我写一个 Python 脚本，实现网页数据爬取')">
          <h3>🐍 写代码</h3><p>Python、JS、Go 等任意语言</p>
        </div>
        <div class="wc" onclick="App.quickStart('分析这段代码有什么问题，给出优化建议')">
          <h3>🔍 分析代码</h3><p>查找 Bug、性能优化</p>
        </div>
        <div class="wc" onclick="App.quickStart('帮我设计一个简单的 REST API 架构')">
          <h3>🏗️ 架构设计</h3><p>系统设计、技术方案</p>
        </div>
        <div class="wc" onclick="App.quickStart('帮我用 shell 命令查看当前目录结构')">
          <h3>⚡ Agent 执行</h3><p>执行命令、读写文件</p>
        </div>
      </div>
    </div>`;
  },

  appendMsg(role, content, reasoning, toolCalls, images, animate = true, files) {
    const ws = document.getElementById('welcome-screen');
    if (ws) ws.remove();

    const inner = document.getElementById('chat-inner');
    const div = document.createElement('div');
    div.className = 'msg';
    if (!animate) div.style.animation = 'none';

    const isUser = role === 'user';
    const avatarClass = isUser ? 'user-av' : 'bot-av';
    const nameClass = isUser ? 'user-n' : 'bot-n';
    const nameText = isUser ? '你' : 'Codex';
    const icon = isUser ? 'U' : '';

    let html = `<div class="msg-head"><span class="msg-avatar ${avatarClass}">${icon}</span><span class="msg-name ${nameClass}">${nameText}</span></div><div class="msg-body">`;

    // Images
    if (images && images.length) {
      images.forEach(img => {
        html += `<img class="msg-img" src="${img}" onclick="App.lightbox(this.src)">`;
      });
    }

    // Files
    if (files && files.length) {
      html += `<div class="msg-files">`;
      files.forEach(f => {
        html += `<div class="msg-file-item"><span class="msg-file-icon">${this.getFileIcon(f.name)}</span><span class="msg-file-name">${this.esc(f.name)}</span><span class="msg-file-size">${this.fmtSize(f.size)}</span></div>`;
      });
      html += `</div>`;
    }

    // Reasoning
    if (reasoning && !isUser) {
      html += `<div class="reason-block"><div class="reason-head" onclick="App.toggleReason(this)"><span class="arrow">▸</span> 思考过程</div><div class="reason-body hide">${this.md(reasoning)}</div></div>`;
    }

    // Tool calls
    if (toolCalls && toolCalls.length) {
      toolCalls.forEach((tc, idx) => {
        const statusClass = tc.status === 'done' ? 'done' : tc.status === 'error' ? 'error' : 'running';
        const statusText = tc.status === 'done' ? '✓ 完成' : tc.status === 'error' ? '✗ 失败' : '⏳ 执行中';
        const isDone = tc.status === 'done' || tc.status === 'error';
        html += `<div class="tool-block"><div class="tool-head" onclick="App.toggleTool(this)"><span>🔧 ${this.esc(tc.name)}</span><span class="tool-status ${statusClass}">${statusText}</span><span class="tool-toggle${isDone ? ' open' : ''}">▸</span></div>`;
        if (tc.args) html += `<div class="tool-body${isDone ? ' hide' : ''}">${this.esc(typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args, null, 2))}</div>`;
        if (tc.result) html += `<div class="tool-result${tc.status === 'error' ? ' err' : ''}${isDone ? '' : ' hide'}">${this.esc(tc.result)}</div>`;
        html += `</div>`;
      });
    }

    // Content
    html += `<div class="msg-text">${this.md(content || '')}</div>`;
    html += `</div>`; // end msg-body

    // Action bar (hover)
    if (!isUser && content) {
      html += `<div class="msg-actions"><button class="msg-act-btn" onclick="App.copyMsg(this)" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>`;
      html += `<button class="msg-act-btn" onclick="App.regenerateMsg(this)" title="重新生成"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button>`;
      html += `</div>`;
    }
    if (isUser) {
      html += `<div class="msg-actions"><button class="msg-act-btn" onclick="App.copyMsg(this)" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>`;
      html += `<button class="msg-act-btn" onclick="App.editMsg(this)" title="编辑"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
      html += `</div>`;
    }

    div.innerHTML = html;
    inner.appendChild(div);
    return div;
  },

  showTyping() {
    const inner = document.getElementById('chat-inner');
    const div = document.createElement('div');
    div.className = 'msg'; div.id = 'typing-msg';
    div.innerHTML = `<div class="msg-head"><span class="msg-avatar bot-av">⚡</span><span class="msg-name bot-n">Codex</span></div><div class="msg-body"><div class="msg-text"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
    inner.appendChild(div);
    this.scrollBottom();
  },

  removeTyping() {
    const el = document.getElementById('typing-msg');
    if (el) el.remove();
  },

  toggleReason(el) {
    el.classList.toggle('open');
    el.nextElementSibling.classList.toggle('hide');
  },

  toggleTool(el) {
    const block = el.closest('.tool-block');
    const body = block.querySelector('.tool-body');
    const result = block.querySelector('.tool-result');
    const toggle = el.querySelector('.tool-toggle');
    if (body) body.classList.toggle('hide');
    if (result) result.classList.toggle('hide');
    if (toggle) toggle.classList.toggle('open');
  },

  // ─── MARKDOWN ───
  md(text) {
    if (!text) return '';
    let h = this.esc(text);
    // Code blocks with language
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const l = lang || 'code';
      const lines = code.split('\n');
      // Remove trailing empty line if present
      if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
      const lineNums = lines.map((_, i) => i + 1).join('\n');
      const highlighted = this.highlightCode(lines.join('\n'), l);
      return `<div class="code-block"><div class="code-head"><span class="code-lang">${l}</span><button class="code-copy" onclick="App.copyCode(this)">复制</button></div><div class="code-inner"><span class="line-numbers">${lineNums}</span><pre><code>${highlighted}</code></pre></div></div>`;
    });
    // Inline code
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // Bold + Italic
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Headers
    h = h.replace(/^#### (.+)$/gm, '<h4 style="font-size:14px;margin:12px 0 6px">$1</h4>');
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Blockquote
    h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Lists
    h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    h = h.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>');
    // Tables (basic)
    h = h.replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s-:]+$/.test(c))) return ''; // separator row
      const tag = 'td';
      return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    });
    h = h.replace(/(<tr>.*<\/tr>\n?)+/g, (m) => '<table>' + m + '</table>');
    // Links
    h = h.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" onclick="App.openUrl(event,\'$2\')">$1</a>');
    // HR
    h = h.replace(/^---$/gm, '<hr>');
    // Paragraphs
    h = h.replace(/\n\n+/g, '</p><p>');
    h = h.replace(/\n/g, '<br>');
    h = '<p>' + h + '</p>';
    h = h.replace(/<p><\/p>/g, '');
    h = h.replace(/<p>(<(?:h[1-4]|div|pre|ul|ol|table|blockquote|hr))/g, '$1');
    h = h.replace(/(<\/(?:h[1-4]|div|pre|ul|ol|table|blockquote|hr)>)<\/p>/g, '$1');
    return h;
  },

  // ─── LOCAL QUICK COMMANDS (zero API calls) ───
  async tryQuickCommand(text) {
    const projDir = this.config.projectPath || undefined;
    let match, type, cmd;

    if ((match = text.match(/^(?:运行|执行|!)\s+(.+)$/s))) {
      type = 'shell'; cmd = match[1].trim();
    } else if ((match = text.match(/^(?:读文件|cat)\s+(.+)$/))) {
      type = 'read_file'; cmd = match[1].trim();
    } else if ((match = text.match(/^(?:列目录|ls)(?:\s+(.+))?$/))) {
      type = 'list_dir'; cmd = (match[1] || '').trim();
    } else if ((match = text.match(/^(?:搜索|grep)\s+(.+?)(?:\s+in\s+(.+))?$/i))) {
      type = 'grep'; cmd = match[1].trim();
      var grepPath = match[2] ? match[2].trim() : projDir;
    } else {
      return false;
    }

    if (!this.currentId) this.newChat();
    const conv = this.getConv(this.currentId);
    if (!conv) return false;

    // Show user message
    conv.messages.push({ role: 'user', content: text });
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = text.slice(0, 32) + (text.length > 32 ? '...' : '');
      document.getElementById('tb-title').textContent = conv.title;
      this.renderConvList();
    }
    this.appendMsg('user', text);
    document.getElementById('msg-input').value = '';
    document.getElementById('msg-input').style.height = '22px';
    this.scrollBottom();

    // Execute locally
    let output = '', success = true;
    try {
      if (type === 'shell') {
        const r = await API.execShell(cmd, projDir);
        output = [r.stdout, r.stderr].filter(Boolean).join('\n') || `(exit code: ${r.exitCode})`;
        success = r.exitCode === 0;
      } else if (type === 'read_file') {
        const r = await API.readFile(cmd);
        output = r.success ? r.content : r.error;
        success = r.success;
      } else if (type === 'list_dir') {
        const r = await API.listDir(cmd || projDir);
        if (r.success) {
          output = r.items.map(i => (i.isDir ? '📁 ' : '📄 ') + i.name + (i.isDir ? '/' : ` (${this.fmtSize(i.size)})`)).join('\n') || '(空目录)';
        } else { output = r.error; success = false; }
      } else if (type === 'grep') {
        const r = await API.grepSearch(cmd, grepPath, null, 50);
        if (r.success) {
          output = r.matches.length ? `找到 ${r.matches.length} 个匹配:\n` + r.matches.map(m => `${m.file}:${m.line}:${m.content}`).join('\n') : '未找到匹配结果';
        } else { output = r.error; success = false; }
      }
    } catch (err) { output = '执行错误: ' + err.message; success = false; }

    // Show result as local execution block
    const chatInner = document.getElementById('chat-inner');
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<div class="msg-body"><div class="local-exec"><div class="local-head">⚡ 本地执行 · ${type}${!success ? ' <span style="color:var(--red)">(失败)</span>' : ''}</div><div class="local-output"><pre>${this.esc(output)}</pre></div></div></div>`;
    chatInner.appendChild(div);

    // Store in conversation (truncated for context)
    const truncated = output.length > 2000 ? output.slice(0, 2000) + '\n...[截断]' : output;
    conv.messages.push({ role: 'assistant', content: `[本地执行: ${type}]\n${truncated}` });
    this.saveConvs();
    this.scrollBottom();
    return true;
  },

  // ─── SEND MESSAGE ───
  async send() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if ((!text && this.attachedImages.length === 0 && this.attachedFiles.length === 0) || this.isStreaming) return;

    // Quick command check (zero API calls) — only if no attachments
    if (text && !this.attachedImages.length && !this.attachedFiles.length) {
      if (await this.tryQuickCommand(text)) return;
    }

    if (!this.currentId) this.newChat();
    const conv = this.getConv(this.currentId);
    if (!conv) return;

    const images = [...this.attachedImages];
    this.attachedImages = [];
    this.clearImgPreview();

    const files = [...this.attachedFiles];
    this.attachedFiles = [];
    this.clearFilePreview();

    // Build content with file context
    let fullText = text;
    if (files.length) {
      const fileContext = files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
      fullText = text ? `${text}\n\n${fileContext}` : fileContext;
    }

    // Add user message
    const userMsg = { role: 'user', content: fullText, images: images.length ? images : undefined, files: files.length ? files.map(f => ({ name: f.name, size: f.size })) : undefined };
    conv.messages.push(userMsg);
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = (text || files[0].name).slice(0, 32) + ((text || files[0].name).length > 32 ? '...' : '');
      document.getElementById('tb-title').textContent = conv.title;
      this.renderConvList();
    }
    this.appendMsg('user', fullText, null, null, images);
    input.value = ''; input.style.height = '22px';
    document.getElementById('send-btn').disabled = true;
    this.scrollBottom();

    // Build API messages
    const apiMsgs = await this._buildApiMsgs(conv);

    this.isStreaming = true;
    this.abortCtrl = new AbortController();
    document.getElementById('send-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'flex';

    await this._runApiLoop(conv, apiMsgs);

    this.isStreaming = false;
    this.abortCtrl = null;
    document.getElementById('send-btn').style.display = 'flex';
    document.getElementById('stop-btn').style.display = 'none';
    this.scrollBottom();
  },

  // ─── BUILD API MESSAGES ───
  async _buildApiMsgs(conv) {
    const apiMsgs = [];
    let sysPrompt = this.config.systemPrompt || '';

    // Inject memory context
    if (this.config.enableMemory !== false) {
      try {
        const memResult = await API.memoryGetAll();
        if (memResult.success && memResult.memories.length > 0) {
          const memText = memResult.memories.map(m => `- [${m.key}]: ${m.content}`).join('\n');
          sysPrompt += '\n\n## 持久记忆\n以下是你记住的信息，请在回答时参考：\n' + memText;
        }
      } catch {}
    }

    // Inject skills catalog
    if (this.config.enableSkills !== false && this._skillsCatalog) {
      const skillList = this._skillsCatalog.map(s => `- **${s.name}**: ${s.description}`).join('\n');
      if (skillList) {
        sysPrompt += '\n\n## 可用技能\n当用户请求匹配以下技能时，使用 load_skill 工具加载对应技能：\n' + skillList;
      }
    }

    // Inject caveman mode prompt for token saving
    if (this.config.cavemanMode && CAVEMAN_PROMPTS[this.config.cavemanLevel || 'full']) {
      sysPrompt += '\n\n' + CAVEMAN_PROMPTS[this.config.cavemanLevel || 'full'];
    }

    if (sysPrompt) apiMsgs.push({ role: 'system', content: sysPrompt });

    const limit = this.config.historyLimit || 8;
    const msgs = conv.messages;
    const recentStart = Math.max(0, msgs.length - limit * 2);

    // Compress old messages into summary
    if (recentStart > 0) {
      const summary = msgs.slice(0, recentStart).map(m => {
        if (m.role === 'user') return '用户: ' + (m.content || '').slice(0, 60);
        if (m.role === 'assistant') return '助手: ' + (m.content || '').slice(0, 60);
        if (m.role === 'tool') return '工具结果: ' + (m.content || '').slice(0, 40);
        return '';
      }).filter(Boolean).join('\n');
      if (summary) {
        apiMsgs.push({ role: 'system', content: '以下是之前的对话摘要：\n' + summary });
      }
    }

    // Recent messages in full
    const buildMsg = (m) => {
      if (m.role === 'tool') {
        apiMsgs.push({ role: 'tool', content: m.content, tool_call_id: m.toolCallId });
      } else if (m.role === 'assistant' && m.toolCalls) {
        const msg = { role: 'assistant', content: m.content || '' };
        msg.tool_calls = m.toolCalls.filter(tc => tc.id).map(tc => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args) }
        }));
        apiMsgs.push(msg);
      } else {
        let content = m.content || '';
        if (m.images && m.images.length) {
          content = [
            ...m.images.map(img => ({ type: 'image_url', image_url: { url: img } })),
            { type: 'text', text: content }
          ];
        }
        apiMsgs.push({ role: m.role, content });
      }
    };
    msgs.slice(recentStart).forEach(buildMsg);
    return apiMsgs;
  },

  // ─── API LOOP (shared by send & retry) ───
  async _runApiLoop(conv, apiMsgs) {
    const agentMode = this.config.agentMode;
    const maxTurns = agentMode ? 10 : 1;

    // Smart routing: determine which model to use
    let routeModel = null; // null = use main model
    const cheapId = this.config.cheapModel;
    const mode = this.config.routeMode;
    if (cheapId && this.customModels.find(m => m.id === cheapId)) {
      if (mode === 'cheap') {
        routeModel = cheapId;
      } else if (mode === 'auto') {
        // Heuristic: use last user message to judge complexity
        const lastUser = [...conv.messages].reverse().find(m => m.role === 'user');
        const text = lastUser ? (lastUser.content || '') : '';
        const complexKw = /设计|架构|分析|优化|为什么|解释|对比|重构|实现|开发|编写.*代码|详细|方案/;
        if (text.length > 100 || complexKw.test(text) || (lastUser && lastUser.images && lastUser.images.length)) {
          routeModel = null; // complex → main model
        } else {
          routeModel = cheapId; // simple → cheap model
        }
      }
      // mode === 'precise' → routeModel stays null (main model)
    }

    for (let turn = 0; turn < maxTurns; turn++) {
      try {
        const result = await this.callAPI(apiMsgs, agentMode && turn < maxTurns - 1, routeModel);

        if (result.toolCalls && result.toolCalls.length > 0 && agentMode) {
          this.removeTyping();
          const assistantMsg = { role: 'assistant', content: result.text || '', reasoning: result.reasoning, toolCalls: result.toolCalls.map(tc => ({ ...tc, status: 'running' })) };
          const msgDiv = this.appendMsg('assistant', result.text, result.reasoning, assistantMsg.toolCalls);
          conv.messages.push(assistantMsg);
          this.scrollBottom();

          for (let i = 0; i < result.toolCalls.length; i++) {
            const tc = result.toolCalls[i];
            const toolResult = await this.execTool(tc);
            assistantMsg.toolCalls[i].status = toolResult.success ? 'done' : 'error';
            assistantMsg.toolCalls[i].result = toolResult.output;
            this.updateToolBlock(msgDiv, i, assistantMsg.toolCalls[i]);
            const toolMsg = { role: 'tool', content: toolResult.output, toolCallId: tc.id };
            conv.messages.push(toolMsg);
            apiMsgs.push({ role: 'assistant', content: result.text || '', tool_calls: result.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: typeof t.args === 'string' ? t.args : JSON.stringify(t.args) } })) });
            apiMsgs.push({ role: 'tool', content: toolResult.output, tool_call_id: tc.id });
          }
          this.saveConvs();
          continue;
        }

        this.removeTyping();
        const finalMsg = { role: 'assistant', content: result.text, reasoning: result.reasoning, toolCalls: result.toolCalls };
        conv.messages.push(finalMsg);
        this.appendMsg('assistant', result.text, result.reasoning, result.toolCalls);
        this.saveConvs();
        break;

      } catch (err) {
        this.removeTyping();
        if (err.name === 'AbortError') {
          this.appendMsg('assistant', '_已停止生成_', null);
        } else {
          const errDiv = this.appendMsg('assistant', '', null);
          errDiv.querySelector('.msg-text').innerHTML = `<span style="color:var(--red)">❌ ${this.esc(err.message)}</span><br><span style="color:var(--text-3);font-size:12px">请检查模型配置中的 API 地址和 Key 是否正确</span><br><button class="retry-btn" onclick="App.retrySend()">🔄 重试</button>`;
        }
        break;
      }
    }
  },

  // ─── RETRY ───
  async retrySend() {
    if (this.isStreaming) return;
    const conv = this.getConv(this.currentId);
    if (!conv) return;

    // Find last user message index
    let lastUserIdx = -1;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) { this.toast('没有可重试的消息', 'err'); return; }

    // Remove everything after the last user message (error messages etc.)
    conv.messages.splice(lastUserIdx + 1);
    this.saveConvs();
    this.renderMessages(conv.messages);

    // Re-enter streaming state and retry
    this.isStreaming = true;
    this.abortCtrl = new AbortController();
    document.getElementById('send-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'flex';

    const apiMsgs = await this._buildApiMsgs(conv);
    await this._runApiLoop(conv, apiMsgs);

    this.isStreaming = false;
    this.abortCtrl = null;
    document.getElementById('send-btn').style.display = 'flex';
    document.getElementById('stop-btn').style.display = 'none';
    this.scrollBottom();
  },

  // ─── API CALL (Chat Completions) ───
  async callAPI(messages, useTools = false, modelOverride = null) {
    this.showTyping();
    let model;
    if (modelOverride) {
      model = this.customModels.find(m => m.id === modelOverride) || this.getActiveModel();
    } else {
      model = this.getActiveModel();
    }

    const body = {
      model: model.id,
      messages: messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
      stream_options: { include_usage: true }
    };
    if (useTools && AGENT_TOOLS.length) {
      const ccTools = ['screenshot', 'click', 'type_text', 'scroll'];
      body.tools = this.config.computerControl
        ? AGENT_TOOLS
        : AGENT_TOOLS.filter(t => !ccTools.includes(t.function.name));
    }

    const baseUrl = (model.url || '').replace(/\/+$/, '');
    const apiKey = model.key || '';
    const url = baseUrl + '/chat/completions';

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.abortCtrl.signal
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`API ${resp.status}: ${errText.slice(0, 300)}`);
    }

    return await this.parseStream(resp);
  },

  // ─── STREAM PARSER (Chat Completions) ───
  async parseStream(resp) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', reasoning = '';
    const toolCallsMap = {}; // index -> { id, name, args }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          const choice = chunk.choices?.[0];
          if (!choice) {
            // Usage-only chunk (last chunk with include_usage)
            if (chunk.usage) {
              const u = chunk.usage;
              const el = document.getElementById('token-info');
              if (el) el.textContent = `${u.prompt_tokens || 0} in · ${u.completion_tokens || 0} out`;
            }
            continue;
          }

          const delta = choice.delta;

          // Text content
          if (delta?.content) {
            text += delta.content;
            this.updateStreamingText(text, reasoning);
          }

          // Reasoning content (DeepSeek / some providers)
          if (delta?.reasoning_content) {
            reasoning += delta.reasoning_content;
            this.updateStreamingText(text, reasoning);
          }

          // Tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallsMap[idx]) {
                toolCallsMap[idx] = { id: tc.id || ('tc_' + idx), name: '', args: '', status: 'pending' };
              }
              if (tc.id) toolCallsMap[idx].id = tc.id;
              if (tc.function?.name) toolCallsMap[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallsMap[idx].args += tc.function.arguments;
            }
          }

          // Check finish reason
          if (choice.finish_reason === 'tool_calls') {
            // Model wants to call tools, stop streaming
            break;
          }
        } catch (e) {
          // Skip malformed chunks
        }
      }
    }

    // Build tool call array
    const toolCallArr = Object.values(toolCallsMap).map(tc => {
      let args = tc.args;
      try { args = JSON.parse(args); } catch {}
      return { ...tc, args };
    });

    return { text, reasoning, toolCalls: toolCallArr.length ? toolCallArr : null };
  },

  _streamMsgDiv: null,
  updateStreamingText(text, reasoning) {
    this.removeTyping();
    if (!this._streamMsgDiv) {
      this._streamMsgDiv = this.appendMsg('assistant', '', '', null, null, true);
    }
    const body = this._streamMsgDiv.querySelector('.msg-text');
    if (body) body.innerHTML = this.md(text || '<span class="typing"><span></span><span></span><span></span></span>');

    let rb = this._streamMsgDiv.querySelector('.reason-block');
    if (reasoning && !rb) {
      rb = document.createElement('div');
      rb.className = 'reason-block';
      rb.innerHTML = `<div class="reason-head" onclick="App.toggleReason(this)"><span class="arrow">▸</span> 思考过程</div><div class="reason-body hide"></div>`;
      this._streamMsgDiv.querySelector('.msg-body').insertBefore(rb, body);
    }
    if (rb) {
      const rbBody = rb.querySelector('.reason-body');
      rbBody.innerHTML = this.md(reasoning);
      rbBody.classList.remove('hide');
      rb.querySelector('.reason-head').classList.add('open');
    }
    this.scrollBottom();
  },

  // ─── TOOL EXECUTION ───
  _compressOutput(output, maxLines = 200) {
    if (!this.config.compressTools) return output;
    const lines = output.split('\n');
    if (lines.length <= maxLines) return output;
    return lines.slice(0, maxLines).join('\n') + `\n\n... [截断: 共${lines.length}行, 已保留前${maxLines}行]`;
  },

  async execTool(tc) {
    if (!API) return { success: false, output: 'Electron API 不可用' };
    const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
    const projDir = this.config.projectPath || undefined;
    let result;
    try {
      switch (tc.name) {
        case 'shell': {
          const r = await API.execShell(args.command, args.cwd || projDir);
          const out = [r.stdout, r.stderr].filter(Boolean).join('\n') || `(exit code: ${r.exitCode})`;
          result = { success: r.exitCode === 0, output: this._compressOutput(out) };
          break;
        }
        case 'read_file': {
          const r = await API.readFile(args.path);
          result = { success: r.success, output: r.success ? this._compressOutput(r.content, 500) : r.error };
          break;
        }
        case 'write_file': {
          const r = await API.writeFile(args.path, args.content);
          result = { success: r.success, output: r.success ? '文件已写入: ' + args.path : r.error };
          break;
        }
        case 'list_directory': {
          const r = await API.listDir(args.path || projDir);
          if (r.success) {
            const lines = r.items.map(i => (i.isDir ? '📁 ' : '📄 ') + i.name + (i.isDir ? '/' : ` (${this.fmtSize(i.size)})`));
            result = { success: true, output: lines.join('\n') || '(空目录)' };
          } else { result = { success: false, output: r.error }; }
          break;
        }
        case 'edit_file': {
          const r = await API.editFile(args.path, args.old_text, args.new_text);
          result = { success: r.success, output: r.success ? '文件已编辑: ' + args.path : r.error };
          break;
        }
        case 'grep_search': {
          const r = await API.grepSearch(args.pattern, args.path || projDir, args.file_pattern, args.max_results || 50);
          if (r.success) {
            if (!r.matches.length) { result = { success: true, output: '未找到匹配结果' }; break; }
            const lines = r.matches.map(m => `${m.file}:${m.line}:${m.content}`);
            result = { success: true, output: `找到 ${r.matches.length} 个匹配:\n${lines.join('\n')}` };
          } else { result = { success: false, output: r.error }; }
          break;
        }
        case 'read_multiple_files': {
          const results = await API.readMultipleFiles(args.paths);
          const output = results.map((r, i) => {
            const name = args.paths[i];
            if (r.success) return `--- ${name} ---\n${r.content}`;
            return `--- ${name} --- [ERROR: ${r.error}]`;
          }).join('\n\n');
          result = { success: true, output: this._compressOutput(output, 500) };
          break;
        }
        case 'list_files': {
          const r = await API.listFiles(args.path || projDir, args.pattern, args.max_depth || 5, args.max_results || 200);
          if (r.success) {
            if (!r.files.length) { result = { success: true, output: '(无匹配文件)' }; break; }
            const lines = r.files.map(f => (f.isDir ? '📁 ' : '📄 ') + f.path + (f.isDir ? '/' : ` (${this.fmtSize(f.size)})`));
            result = { success: true, output: `共 ${r.files.length} 项:\n${lines.join('\n')}` };
          } else { result = { success: false, output: r.error }; }
          break;
        }
        // ─── Web Tools ───
        case 'web_search': {
          const r = await API.webSearch(args.query, args.max_results || 8);
          if (r.success) {
            if (!r.results.length) { result = { success: true, output: '未找到相关搜索结果' }; break; }
            const lines = r.results.map((r, i) => `${i+1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`);
            result = { success: true, output: `搜索 "${args.query}" 找到 ${r.results.length} 个结果:\n\n${lines.join('\n\n')}` };
          } else { result = { success: false, output: r.error }; }
          break;
        }
        case 'web_fetch': {
          const r = await API.webFetch(args.url, args.max_length || 100000);
          if (r.success) {
            result = { success: true, output: this._compressOutput(r.content, 300) };
          } else { result = { success: false, output: r.error }; }
          break;
        }
        // ─── Memory Tools ───
        case 'memory_write': {
          const r = await API.memorySave(args.key, args.content, args.tags);
          if (r.success) {
            result = { success: true, output: `已记住: [${args.key}] ${args.content.slice(0, 100)}` };
          } else { result = { success: false, output: r.error }; }
          break;
        }
        case 'memory_search': {
          const r = await API.memorySearch(args.query, args.limit || 10);
          if (r.success) {
            if (!r.results.length) { result = { success: true, output: '未找到相关记忆' }; break; }
            const lines = r.results.map(m => `[${m.key}]: ${m.content}`);
            result = { success: true, output: `找到 ${r.results.length} 条相关记忆:\n${lines.join('\n')}` };
          } else { result = { success: false, output: r.error }; }
          break;
        }
        case 'memory_delete': {
          const r = await API.memoryDelete(args.key);
          result = { success: r.success, output: r.success ? `已删除记忆: ${args.key}` : r.error };
          break;
        }
        // ─── Skills Tool ───
        case 'load_skill': {
          const r = await API.skillsRead(args.skill_name);
          if (r.success) {
            // Store skill content as context for the current conversation
            this._loadedSkillContent = r.content;
            result = { success: true, output: `技能 "${args.skill_name}" 已加载。请按照技能指引执行任务。\n\n技能内容摘要:\n${r.content.slice(0, 500)}...` };
          } else { result = { success: false, output: `技能加载失败: ${r.error}` }; }
          break;
        }
        // ─── Computer Control Tools ───
        case 'screenshot': {
          const r = await API.screenshot(args.x, args.y, args.width, args.height);
          if (r.success) {
            result = { success: true, output: `截图成功 (${r.width}x${r.height})。图片已作为base64返回，可以直接分析。` };
            // If the screenshot data is available, we could display it
            if (r.dataUrl) {
              result.output += `\n[截图数据已获取，长度: ${r.dataUrl.length} 字符]`;
            }
          } else { result = { success: false, output: `截图失败: ${r.error}` }; }
          break;
        }
        case 'click': {
          const r = await API.inputControl('click', args.x, args.y, args.button || 'left', args.doubleClick || false);
          result = { success: r.success, output: r.success ? `已${args.doubleClick ? '双击' : '点击'} (${args.x}, ${args.y}) ${args.button || 'left'}` : r.error };
          break;
        }
        case 'type_text': {
          const r = await API.inputControl('type', args.text);
          result = { success: r.success, output: r.success ? `已输入文本 (${args.text.length} 字符)` : r.error };
          break;
        }
        case 'scroll': {
          const r = await API.inputControl('scroll', args.x, args.y, args.deltaX || 0, args.deltaY || -300);
          result = { success: r.success, output: r.success ? `已滚动 at (${args.x}, ${args.y}) delta: (${args.deltaX || 0}, ${args.deltaY || -300})` : r.error };
          break;
        }
        default:
          result = { success: false, output: '未知工具: ' + tc.name };
      }
    } catch (err) {
      result = { success: false, output: '执行错误: ' + err.message };
    }
    return result;
  },

  updateToolBlock(msgDiv, index, tc) {
    const blocks = msgDiv.querySelectorAll('.tool-block');
    const block = blocks[index];
    if (!block) return;
    const head = block.querySelector('.tool-head');
    const statusEl = block.querySelector('.tool-status');
    const toggleEl = block.querySelector('.tool-toggle');
    statusEl.className = 'tool-status ' + (tc.status === 'done' ? 'done' : tc.status === 'error' ? 'error' : 'running');
    statusEl.textContent = tc.status === 'done' ? '✓ 完成' : tc.status === 'error' ? '✗ 失败' : ' 执行中';

    if (tc.status === 'done' || tc.status === 'error') {
      if (toggleEl) toggleEl.classList.add('open');
      const body = block.querySelector('.tool-body');
      if (body) body.classList.add('hide');
    }

    if (tc.result) {
      let resultEl = block.querySelector('.tool-result');
      if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.className = 'tool-result' + (tc.status === 'error' ? ' err' : '');
        block.appendChild(resultEl);
      }
      resultEl.textContent = tc.result;
      if (tc.status === 'done' || tc.status === 'error') resultEl.classList.remove('hide');
    }
  },

  // ─── STOP GENERATION ───
  stopGen() {
    if (this.abortCtrl) this.abortCtrl.abort();
    this._streamMsgDiv = null;
  },

  setRouteMode(mode) {
    this.config.routeMode = mode;
    this.saveConfig();
    document.querySelectorAll('.route-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  },

  // ─── IMAGES ───
  attachImage() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => {
      Array.from(inp.files).forEach(f => {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.attachedImages.push(e.target.result);
          this.renderImgPreview();
        };
        reader.readAsDataURL(f);
      });
    };
    inp.click();
  },

  onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.attachedImages.push(ev.target.result);
          this.renderImgPreview();
        };
        reader.readAsDataURL(item.getAsFile());
      }
    }
  },

  renderImgPreview() {
    const el = document.getElementById('img-preview');
    if (!this.attachedImages.length) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = this.attachedImages.map((img, i) =>
      `<div class="ip-item"><img src="${img}"><div class="ip-del" onclick="App.removeImg(${i})">&times;</div></div>`
    ).join('');
  },

  removeImg(i) {
    this.attachedImages.splice(i, 1);
    this.renderImgPreview();
  },

  clearImgPreview() {
    const el = document.getElementById('img-preview');
    el.style.display = 'none'; el.innerHTML = '';
  },

  lightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}">`;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  },

  // ─── FILE ATTACHMENT ───
  _fileIcons: {
    'txt': '📄', 'md': '📝', 'json': '', 'js': '📜', 'ts': '📜',
    'py': '🐍', 'java': '', 'cpp': '⚙️', 'c': '⚙️', 'h': '⚙️',
    'css': '', 'html': '🌐', 'xml': '📰', 'yaml': '⚙️', 'yml': '️',
    'sql': '️', 'sh': '', 'bat': '🔧', 'ps1': '🔧',
    'csv': '📊', 'log': '', 'ini': '⚙️', 'toml': '⚙️',
    'rs': '', 'go': '🔵', 'rb': '💎', 'php': '🐘', 'swift': '',
    'kt': '', 'scala': '🔴', 'r': '📈', 'lua': '',
  },

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return this._fileIcons[ext] || '📎';
  },

  attachFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.accept = '.txt,.md,.json,.js,.ts,.py,.java,.cpp,.c,.h,.css,.html,.xml,.yaml,.yml,.sql,.sh,.bat,.ps1,.csv,.log,.ini,.toml,.rs,.go,.rb,.php,.swift,.kt,.scala,.r,.lua,.conf,.cfg,.env,.gitignore,.dockerfile,.makefile';
    inp.onchange = () => {
      Array.from(inp.files).forEach(f => {
        if (f.size > 500000) { this.toast('文件过大 (最大 500KB): ' + f.name, 'err'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
          this.attachedFiles.push({ name: f.name, size: f.size, content: e.target.result });
          this.renderFilePreview();
        };
        reader.readAsText(f);
      });
    };
    inp.click();
  },

  renderFilePreview() {
    const el = document.getElementById('file-preview');
    if (!this.attachedFiles.length) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = this.attachedFiles.map((f, i) =>
      `<div class="fp-item">
        <span class="fp-icon">${this.getFileIcon(f.name)}</span>
        <div class="fp-info">
          <div class="fp-name">${this.esc(f.name)}</div>
          <div class="fp-size">${this.fmtSize(f.size)}</div>
        </div>
        <div class="fp-del" onclick="App.removeFile(${i})">&times;</div>
      </div>`
    ).join('');
  },

  removeFile(i) {
    this.attachedFiles.splice(i, 1);
    this.renderFilePreview();
  },

  clearFilePreview() {
    const el = document.getElementById('file-preview');
    el.style.display = 'none'; el.innerHTML = '';
  },

  // ─── CONNECTION CHECK ───
  async checkConnection() {
    const dot = document.getElementById('proxy-dot');
    const label = document.getElementById('proxy-label');
    if (!dot || !label) return;
    const model = this.getActiveModel();
    const baseUrl = (model?.url || '').replace(/\/+$/, '');
    const apiKey = model?.key || '';
    dot.className = 'dot dot-off';
    label.textContent = '检测连接...';
    if (!baseUrl) { dot.className = 'dot dot-err'; label.textContent = '未配置模型'; return; }
    try {
      const r = await fetch(baseUrl + '/models', {
        headers: apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {},
        signal: AbortSignal.timeout(5000)
      });
      if (r.ok) { dot.className = 'dot dot-on'; label.textContent = '已连接'; }
      else { dot.className = 'dot dot-err'; label.textContent = '连接异常 (' + r.status + ')'; }
    } catch {
      dot.className = 'dot dot-err'; label.textContent = '未连接';
    }
  },

  // ─── EXPORT ───
  async exportChat() {
    const conv = this.getConv(this.currentId);
    if (!conv || !conv.messages.length) { this.toast('没有可导出的对话', 'err'); return; }

    let md = `# ${conv.title}\n\n_导出时间: ${new Date().toLocaleString('zh-CN')}_\n\n---\n\n`;
    conv.messages.forEach(m => {
      if (m.role === 'user') md += `## 🧑 你\n\n${m.content}\n\n`;
      else if (m.role === 'assistant') {
        if (m.reasoning) md += `<details><summary>思考过程</summary>\n\n${m.reasoning}\n\n</details>\n\n`;
        md += `## ⚡ Codex\n\n${m.content || ''}\n\n`;
        if (m.toolCalls) m.toolCalls.forEach(tc => {
          md += `> 🔧 **${tc.name}**: \`${JSON.stringify(tc.args)}\`\n> ${tc.result || ''}\n\n`;
        });
      }
    });

    if (API) {
      const fp = await API.saveFileDialog({ defaultPath: conv.title + '.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (fp) {
        const r = await API.exportConversation(fp, md);
        if (r.success) this.toast('对话已导出', 'ok');
        else this.toast('导出失败: ' + r.error, 'err');
      }
    } else {
      // Fallback: download
      const blob = new Blob([md], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = conv.title + '.md'; a.click();
      this.toast('对话已导出', 'ok');
    }
  },

  // ─── SKILLS CATALOG ───
  async loadSkillsCatalog() {
    if (!API) return;
    try {
      const r = await API.skillsList();
      if (r.success) this._skillsCatalog = r.skills;
    } catch {}
  },

  // ─── MEMORY MANAGEMENT UI ───
  async renderMemoryList() {
    if (!API) return;
    const container = document.getElementById('memory-list');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-3);font-size:12px">加载中...</div>';
    try {
      const r = await API.memoryList();
      if (!r.success || !r.memories.length) {
        container.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:12px 0">暂无记忆。AI 会在对话中自动记住重要信息。</div>';
        return;
      }
      container.innerHTML = r.memories.map(m => `
        <div class="memory-item" data-key="${this.esc(m.key)}">
          <div class="mem-key">${this.esc(m.key)}</div>
          <div class="mem-content">${this.esc(m.content.slice(0, 200))}</div>
          <div class="mem-meta">
            ${m.tags ? m.tags.map(t => `<span class="mem-tag">${this.esc(t)}</span>`).join('') : ''}
            <span class="mem-time">${new Date(m.updatedAt).toLocaleDateString()}</span>
          </div>
          <button class="mem-del-btn" onclick="App.deleteMemory('${this.esc(m.key)}')" title="删除">✕</button>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = '<div style="color:var(--text-3);font-size:12px">加载失败</div>';
    }
  },

  async deleteMemory(key) {
    if (!API) return;
    if (!confirm(`确定删除记忆 "${key}"？`)) return;
    const r = await API.memoryDelete(key);
    if (r.success) { this.toast('记忆已删除', 'ok'); this.renderMemoryList(); }
    else this.toast('删除失败: ' + r.error, 'err');
  },

  async addMemoryManual() {
    const key = document.getElementById('mem-add-key')?.value?.trim();
    const content = document.getElementById('mem-add-content')?.value?.trim();
    if (!key || !content) { this.toast('请填写键名和内容', 'err'); return; }
    const r = await API.memorySave(key, content, []);
    if (r.success) {
      this.toast('记忆已添加', 'ok');
      document.getElementById('mem-add-key').value = '';
      document.getElementById('mem-add-content').value = '';
      this.renderMemoryList();
    } else this.toast('添加失败: ' + r.error, 'err');
  },

  // ─── SKILLS MANAGEMENT UI ───
  async renderSkillsList() {
    if (!API) return;
    const container = document.getElementById('skills-list');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-3);font-size:12px">加载中...</div>';
    try {
      const r = await API.skillsList();
      if (!r.success) { container.innerHTML = '<div style="color:var(--text-3);font-size:12px">加载失败</div>'; return; }
      this._skillsCatalog = r.skills;
      if (!r.skills.length) {
        container.innerHTML = `
          <div style="color:var(--text-3);font-size:12px;padding:12px 0">
            暂无已安装技能。点击"安装技能"导入 .zip 技能包。
          </div>`;
        return;
      }
      container.innerHTML = r.skills.map(s => `
        <div class="skill-item">
          <div class="skill-info">
            <div class="skill-name">${this.esc(s.name)}</div>
            <div class="skill-desc">${this.esc(s.description.slice(0, 150))}</div>
            ${s.version ? `<div class="skill-ver">v${this.esc(s.version)}</div>` : ''}
          </div>
          <button class="skill-del-btn" onclick="App.deleteSkill('${this.esc(s.dir)}')" title="卸载">✕</button>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = '<div style="color:var(--text-3);font-size:12px">加载失败</div>';
    }
  },

  async installSkill() {
    if (!API) return;
    const file = await API.openFileDialog([{ name: 'Skill Package', extensions: ['zip'] }]);
    if (!file) return;
    this.toast('正在安装技能...', 'info');
    const r = await API.skillsInstall(file);
    if (r.success) {
      this.toast('技能安装成功', 'ok');
      this.loadSkillsCatalog();
      this.renderSkillsList();
    } else this.toast('安装失败: ' + r.error, 'err');
  },

  async deleteSkill(skillName) {
    if (!API) return;
    if (!confirm(`确定卸载技能 "${skillName}"？`)) return;
    const r = await API.skillsDelete(skillName);
    if (r.success) {
      this.toast('技能已卸载', 'ok');
      this.loadSkillsCatalog();
      this.renderSkillsList();
    } else this.toast('卸载失败: ' + r.error, 'err');
  },

  // ─── SETTINGS ───
  openSettings() {
    this.renderModelList();
    document.getElementById('cfg-effort').value = this.config.effort;
    document.getElementById('cfg-maxtok').value = this.config.maxTokens;
    document.getElementById('cfg-temp').value = this.config.temperature;
    document.getElementById('cfg-sys').value = this.config.systemPrompt;
    document.getElementById('cfg-agent').checked = this.config.agentMode;
    document.getElementById('cfg-maxturns').value = this.config.maxTurns || 10;
    document.getElementById('cfg-history-limit').value = this.config.historyLimit || 8;
    document.getElementById('cfg-compress').checked = this.config.compressTools !== false;
    document.getElementById('cfg-enable-memory').checked = this.config.enableMemory !== false;
    document.getElementById('cfg-enable-skills').checked = this.config.enableSkills !== false;
    document.getElementById('cfg-caveman').checked = this.config.cavemanMode === true;
    document.getElementById('cfg-caveman-level').value = this.config.cavemanLevel || 'full';
    document.getElementById('cfg-computer-control').checked = this.config.computerControl === true;
    document.getElementById('add-model-form').style.display = 'none';
    // Populate cheap model dropdown
    const cheapSel = document.getElementById('cfg-cheap-model');
    if (cheapSel) {
      cheapSel.innerHTML = '<option value="">不启用</option>';
      this.customModels.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.name;
        cheapSel.appendChild(opt);
      });
      cheapSel.value = this.config.cheapModel || '';
    }
    this.settingsTab('model');
    document.getElementById('settings-modal').classList.add('show');
  },

  closeSettings() { document.getElementById('settings-modal').classList.remove('show'); },

  saveSettings() {
    this.config.model = document.getElementById('cfg-model').value;
    this.config.effort = document.getElementById('cfg-effort').value;
    this.config.maxTokens = parseInt(document.getElementById('cfg-maxtok').value) || 16384;
    this.config.temperature = parseFloat(document.getElementById('cfg-temp').value) || 0.7;
    this.config.systemPrompt = document.getElementById('cfg-sys').value.trim();
    this.config.agentMode = document.getElementById('cfg-agent').checked;
    this.config.maxTurns = parseInt(document.getElementById('cfg-maxturns').value) || 10;
    this.config.cheapModel = document.getElementById('cfg-cheap-model').value;
    this.config.historyLimit = parseInt(document.getElementById('cfg-history-limit').value) || 8;
    this.config.compressTools = document.getElementById('cfg-compress').checked;
    this.config.enableMemory = document.getElementById('cfg-enable-memory').checked;
    this.config.enableSkills = document.getElementById('cfg-enable-skills').checked;
    this.config.cavemanMode = document.getElementById('cfg-caveman').checked;
    this.config.cavemanLevel = document.getElementById('cfg-caveman-level').value;
    this.config.computerControl = document.getElementById('cfg-computer-control').checked;
    this.saveConfig();
    this.updateModelBadge();
    this.closeSettings();
    this.checkConnection();
    this.toast('设置已保存', 'ok');
  },

  // ─── UI HELPERS ───
  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    document.getElementById('sidebar').classList.toggle('collapsed', !this.sidebarOpen);
  },

  async selectProject() {
    if (!API) return;
    const folder = await API.openFolderDialog();
    if (folder) {
      this.config.projectPath = folder;
      this.saveConfig();
      this.updateProjectDisplay();
      this.toast('项目工作区: ' + folder.split(/[\\/]/).pop(), 'ok');
    }
  },

  updateProjectDisplay() {
    const el = document.getElementById('project-name');
    const btn = document.getElementById('project-btn');
    if (!el) return;
    if (this.config.projectPath) {
      const name = this.config.projectPath.split(/[\\/]/).pop() || this.config.projectPath;
      el.textContent = name;
      btn.classList.add('active');
      btn.title = this.config.projectPath;
    } else {
      el.textContent = '未选择项目';
      btn.classList.remove('active');
      btn.title = '选择项目工作区';
    }
  },

  quickStart(text) {
    document.getElementById('msg-input').value = text;
    document.getElementById('send-btn').disabled = false;
    this.send();
  },

  onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  },

  autoResize(el) {
    el.style.height = '22px';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
    document.getElementById('send-btn').disabled = !el.value.trim() && !this.attachedImages.length && !this.attachedFiles.length;
  },

  scrollBottom() {
    const area = document.getElementById('chat-area');
    requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
  },

  copyText(text) {
    navigator.clipboard.writeText(text).then(() => this.toast('已复制', 'ok'));
  },

  openUrl(e, url) {
    e.preventDefault();
    if (API) API.openExternal(url);
    else window.open(url, '_blank');
  },

  fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  },

  // Lightweight syntax highlighting (no external deps)
  highlightCode(code, lang) {
    const l = lang.toLowerCase();
    // Order matters: comments first (to avoid highlighting inside comments)
    let h = code;

    // Single-line comments: // ... or # ...
    if (['js','javascript','ts','typescript','python','py','go','rust','rs','java','c','cpp','c++','cs','csharp','swift','kt','kotlin','php','rb','ruby','sh','bash','shell'].includes(l)) {
      h = h.replace(/(\/\/.*$|#.*$)/gm, '<span class="tok-cmt">$1</span>');
    }
    // Multi-line comments /* ... */
    h = h.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-cmt">$1</span>');

    // Strings (double and single quotes, template literals)
    h = h.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="tok-str">$1</span>');

    // Keywords
    const kwMap = {
      js: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void',
      javascript: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void',
      ts: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void|interface|type|enum|namespace|abstract|implements|readonly',
      typescript: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void|interface|type|enum|namespace|abstract|implements|readonly',
      python: 'def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|is|in|True|False|None|print|self|async|await',
      py: 'def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|is|in|True|False|None|print|self|async|await',
      go: 'func|return|if|else|for|range|switch|case|break|continue|go|defer|select|chan|map|struct|interface|type|package|import|var|const|nil|true|false|make|new|append|len|cap|close|delete|copy',
      rust: 'fn|let|mut|return|if|else|for|while|loop|match|use|mod|pub|struct|enum|impl|trait|type|where|self|Self|super|crate|async|await|move|ref|const|static|unsafe|extern|true|false|Some|None|Ok|Err',
      rs: 'fn|let|mut|return|if|else|for|while|loop|match|use|mod|pub|struct|enum|impl|trait|type|where|self|Self|super|crate|async|await|move|ref|const|static|unsafe|extern|true|false|Some|None|Ok|Err',
      java: 'public|private|protected|class|interface|extends|implements|return|if|else|for|while|do|switch|case|break|continue|new|this|super|import|package|static|final|abstract|void|int|long|double|float|boolean|char|byte|short|null|true|false|try|catch|finally|throw|throws',
      c: 'int|char|float|double|void|long|short|unsigned|signed|const|static|extern|return|if|else|for|while|do|switch|case|break|continue|struct|union|enum|typedef|sizeof|NULL|true|false|include|define',
      cpp: 'int|char|float|double|void|long|short|unsigned|signed|const|static|extern|return|if|else|for|while|do|switch|case|break|continue|struct|union|enum|typedef|sizeof|NULL|true|false|class|public|private|protected|virtual|override|template|typename|namespace|using|new|delete|this|include|define',
      'c++': 'int|char|float|double|void|long|short|unsigned|signed|const|static|extern|return|if|else|for|while|do|switch|case|break|continue|struct|union|enum|typedef|sizeof|NULL|true|false|class|public|private|protected|virtual|override|template|typename|namespace|using|new|delete|this|include|define',
      cs: 'class|struct|interface|enum|namespace|using|public|private|protected|internal|static|void|int|string|bool|double|float|var|return|if|else|for|foreach|while|do|switch|case|break|continue|new|this|base|try|catch|finally|throw|async|await|true|false|null',
      csharp: 'class|struct|interface|enum|namespace|using|public|private|protected|internal|static|void|int|string|bool|double|float|var|return|if|else|for|foreach|while|do|switch|case|break|continue|new|this|base|try|catch|finally|throw|async|await|true|false|null',
      sh: 'if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|echo|exit|export|source|local|readonly|shift|set|unset',
      bash: 'if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|echo|exit|export|source|local|readonly|shift|set|unset',
      shell: 'if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|echo|exit|export|source|local|readonly|shift|set|unset',
      sql: 'SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MAX|MIN|LIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|UNION|ALL|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|CONSTRAINT|VIEW|TRIGGER|PROCEDURE|FUNCTION',
      html: 'DOCTYPE|html|head|body|div|span|p|a|img|ul|ol|li|table|tr|td|th|form|input|button|script|style|link|meta|title|h1|h2|h3|h4|h5|h6|br|hr|strong|em|code|pre|blockquote',
      css: 'important|color|background|border|margin|padding|font|display|flex|grid|position|width|height|top|left|right|bottom|z-index|opacity|transform|transition|animation|content|cursor|overflow|visibility',
      json: 'true|false|null',
    };
    const kws = kwMap[l] || kwMap['js'];
    if (kws) {
      h = h.replace(new RegExp('\\b(' + kws + ')\\b', 'g'), '<span class="tok-kw">$1</span>');
    }

    // Numbers
    h = h.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, '<span class="tok-num">$1</span>');

    // Function calls: name(
    h = h.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="tok-fn">$1</span>');

    return h;
  },

  copyCode(btn) {
    const block = btn.closest('.code-block');
    const code = block.querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = '已复制!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
    });
  },

  copyMsg(btn) {
    const msg = btn.closest('.msg');
    const text = msg.querySelector('.msg-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    });
  },

  regenerateMsg(btn) {
    if (this.isStreaming) return;
    const msg = btn.closest('.msg');
    const conv = this.getConv(this.currentId);
    if (!conv) return;
    // Find the index of this message in the conversation
    const msgs = conv.messages;
    // Remove from this assistant message onwards
    const msgIndex = Array.from(msg.parentNode.children).indexOf(msg);
    const allMsgs = msg.parentNode.querySelectorAll('.msg');
    // Find position in conv.messages by matching content
    const content = msg.querySelector('.msg-text').textContent;
    let cutIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant' && msgs[i].content === content) {
        cutIdx = i;
        break;
      }
    }
    if (cutIdx === -1) return;
    // Remove messages from cutIdx onwards
    conv.messages.splice(cutIdx);
    this.saveConvs();
    // Remove DOM elements from this message onwards
    const msgArr = Array.from(allMsgs);
    const thisIdx = msgArr.indexOf(msg);
    for (let i = thisIdx; i < msgArr.length; i++) msgArr[i].remove();
    // Re-send the last user message
    const lastUserMsg = conv.messages[conv.messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === 'user') {
      document.getElementById('msg-input').value = lastUserMsg.content;
      this.send();
    }
  },

  editMsg(btn) {
    if (this.isStreaming) return;
    const msg = btn.closest('.msg');
    const textEl = msg.querySelector('.msg-text');
    const text = textEl.textContent;
    // Find this message in conv and remove everything after it
    const conv = this.getConv(this.currentId);
    if (!conv) return;
    const content = text;
    let cutIdx = -1;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user' && conv.messages[i].content === content) {
        cutIdx = i;
        break;
      }
    }
    // Put the text in the input for editing
    document.getElementById('msg-input').value = text;
    document.getElementById('msg-input').focus();
    // Remove this and all following messages from DOM
    const msgArr = Array.from(msg.parentNode.querySelectorAll('.msg'));
    const thisIdx = msgArr.indexOf(msg);
    for (let i = thisIdx; i < msgArr.length; i++) msgArr[i].remove();
    // Remove from conv.messages
    if (cutIdx >= 0) {
      conv.messages.splice(cutIdx);
      this.saveConvs();
    }
    this.autoResize();
  },

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },

  toast(msg, type = '') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 3000);
  }
};

// ─── BOOT ───
document.addEventListener('DOMContentLoaded', () => App.init());

// Close settings on overlay click
document.getElementById('settings-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) App.closeSettings();
});
