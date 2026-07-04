# KK-Buddy Desktop

Universal AI Coding Assistant - 桌面端 AI 编程助手，支持多种大模型驱动。

![Version](https://img.shields.io/badge/version-2.3.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Electron](https://img.shields.io/badge/electron-35.7.5-47848F)

## 简介

KK-Buddy Desktop 是一款基于 Electron 构建的桌面 AI 编程助手。它通过 OpenAI Chat Completions 兼容 API 对接多种大语言模型（GPT-4.1、DeepSeek、通义千问、Kimi、智谱 GLM、MiMo 等），提供 Agent 工具系统、文件生成、浏览器自动化、多 Agent 协作、定时任务、MCP 插件市场、电脑控制、省 Token 模式等丰富功能。

所有数据存储在本地，API Key 仅保存在用户配置中，不上传任何数据到第三方服务器。

## 快速开始

### 方式一：下载安装包（推荐）

前往 [Releases 页面](https://github.com/schvinkk/kk-buddy-desktop/releases) 下载最新安装包：

- **Windows**: `KK-Buddy-Desktop-Setup-2.3.0.exe` — 双击安装，开箱即用

安装后打开软件，点击右上角模型徽章配置你的 API Key 即可使用。

### 方式二：从源码运行

```bash
# 1. 确保已安装 Node.js (>= 18)
# 2. 克隆仓库
git clone https://github.com/schvinkk/kk-buddy-desktop.git
cd kk-buddy-desktop

# 3. 安装依赖（国内用户可加 --registry https://registry.npmmirror.com）
npm install

# 4. 启动应用
npm start
```

### 方式三：打包安装包

```bash
# 设置环境变量（跳过签名，国内镜像）
set CSC_IDENTITY_AUTO_DISCOVERY=false
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# 打包 Windows 安装包
npx electron-builder --win nsis
```

### 配置模型

1. 点击右上角模型徽章打开设置
2. 在「模型配置」标签页添加你的 API 信息：
   - **模型 ID**：API 对应的模型标识（如 `gpt-4.1`、`deepseek-v4-pro`）
   - **API 地址**：Base URL（如 `https://api.openai.com/v1`）
   - **API Key**：你的密钥
3. 保存设置后即可使用

## 预设模型

| 模型 | 提供商 | API 地址 |
|------|--------|----------|
| GPT-4.1 | OpenAI | `https://api.openai.com/v1` |
| DeepSeek V4 Pro | DeepSeek | `https://api.deepseek.com/v1` |
| DeepSeek V4 Flash | DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 Plus | 阿里云 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Kimi K2.6 | Moonshot | `https://api.moonshot.cn/v1` |
| 智谱 GLM-5 | 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` |
| MiMo v2.5 | 小米 | `https://api.xiaomimimo.com/v1` |

支持添加任何 OpenAI Chat Completions 兼容 API 作为自定义模型。

## 功能特性

### Agent 工具系统（37 个工具）

开启 Agent 模式后，模型可自动调用工具完成任务，支持多轮工具链式调用。

**核心文件与代码工具（8个）**

| 工具 | 功能 |
|------|------|
| `shell` | 执行 Shell 命令 |
| `read_file` | 读取文件内容 |
| `write_file` | 写入/创建文件 |
| `list_directory` | 列出目录内容 |
| `edit_file` | 查找替换编辑文件 |
| `grep_search` | 正则搜索文件内容 |
| `read_multiple_files` | 批量读取多个文件 |
| `list_files` | 递归列出文件（支持模式过滤和深度限制） |

**网络工具（2个）**

| 工具 | 功能 |
|------|------|
| `web_search` | 网络搜索（DuckDuckGo） |
| `web_fetch` | 抓取网页内容（支持重定向跟随） |

**文件生成工具（5个）**

| 工具 | 功能 |
|------|------|
| `generate_docx` | 生成 Word 文档（支持标题、段落、表格） |
| `generate_pptx` | 生成 PPT 演示文稿（支持多页、主题色） |
| `generate_pdf` | 生成 PDF 文档（支持标题、段落、列表、表格） |
| `generate_excel` | 生成 Excel 电子表格（支持多 Sheet） |
| `generate_mermaid` | 生成 Mermaid 流程图/图表（SVG 输出） |

**浏览器自动化工具（7个）**

| 工具 | 功能 |
|------|------|
| `browser_launch` | 启动 Playwright 浏览器实例 |
| `browser_navigate` | 导航到指定 URL |
| `browser_get_content` | 获取页面文本内容（支持 CSS 选择器） |
| `browser_click` | 点击页面元素 |
| `browser_fill` | 填写表单输入 |
| `browser_screenshot` | 页面截图 |
| `browser_close` | 关闭浏览器 |

**电脑控制工具（4个）**

| 工具 | 功能 |
|------|------|
| `screenshot` | 截取屏幕截图（支持区域截取） |
| `click` | 模拟鼠标点击（支持左键/右键/双击） |
| `type_text` | 模拟键盘输入（支持特殊键） |
| `scroll` | 模拟鼠标滚轮滚动 |

**多 Agent 协作工具（4个）**

| 工具 | 功能 |
|------|------|
| `agent_create_team` | 创建 Agent 团队 |
| `agent_assign_task` | 分配任务给 Agent |
| `agent_get_team_status` | 查看团队状态 |
| `agent_delete_team` | 删除团队 |

**定时任务工具（4个）**

| 工具 | 功能 |
|------|------|
| `scheduler_schedule` | 创建定时任务（支持 once/interval/cron） |
| `scheduler_get_status` | 查看任务状态 |
| `scheduler_cancel` | 取消任务 |
| `scheduler_list` | 列出所有定时任务 |

**记忆工具（3个）**

| 工具 | 功能 |
|------|------|
| `memory_write` | 写入长期记忆 |
| `memory_search` | 搜索记忆内容 |
| `memory_delete` | 删除记忆条目 |

**MCP 插件工具（4个）**

| 工具 | 功能 |
|------|------|
| `plugin_list_builtin` | 列出内置 MCP 插件 |
| `plugin_execute` | 执行插件操作 |
| `plugin_get_enabled_summary` | 获取已启用插件摘要 |
| `plugin_toggle` | 启用/禁用插件 |

### 内置 MCP 插件系统

38 个内置 MCP 插件，覆盖效率、开发、AI、系统等多个类别。支持一键启用/禁用，AI 可自动调用已启用的插件完成任务。

### 省 Token 模式（Caveman Mode）

6 档强度可选，通过 Prompt 工程压缩模型输出 Token 65-90%：
- **Lite**：去除填充词和套话，保持专业表达
- **Full**：极简回复，保留技术内容（推荐）
- **Ultra**：最激进的压缩
- **文言 Lite / Full / Ultra**：文言文风格输出

### 文件与图片

- 拖拽或点击上传图片（支持多模态模型视觉分析）
- 附加文本文件（代码、文档等），内容自动嵌入对话
- 支持多种文件类型自动识别图标

### 项目管理

- 选择项目工作区目录
- Agent 工具默认在项目目录下操作
- Shell 命令默认在项目目录执行

### UI 特性

- 清新明亮的主题设计
- 代码块语法高亮（20+ 语言）+ 行号显示
- 可折叠的工具调用结果和思考过程（Reasoning）
- 对话历史搜索与管理
- 对话导出（Markdown）
- 系统托盘常驻，支持最小化到托盘
- 响应式布局，支持窗口缩放

### 兼容性

- 自动检测并兼容不支持 `stream_options` 的 API（自动重试）
- 模型 URL 自动迁移（旧版 localhost 地址自动更新为云端 API）
- 模型名称和 ID 自动迁移（保持向后兼容）

## 技术栈

- **Electron 35.7.5** - 跨平台桌面应用框架
- **原生 HTML/CSS/JS** - 零前端框架依赖，轻量快速
- **OpenAI Chat Completions API** - 统一的模型接口标准（SSE Streaming）
- **Playwright** - 浏览器自动化引擎
- **docx / pptxgenjs / pdfkit / exceljs** - 文件生成套件
- **PowerShell + Win32 API** - 电脑控制（截图/鼠标/键盘）

## 项目结构

```
kk-buddy-desktop/
├── main.js              # Electron 主进程（窗口管理、IPC 处理、工具执行）
├── preload.js           # 预加载脚本（安全 IPC 桥接）
├── index.html           # 主界面（设置面板、对话区域）
├── icon.png             # 应用图标（256x256）
├── css/
│   └── theme.css        # 主题样式
├── renderer/
│   └── app.js           # 前端应用逻辑（Agent 系统、API 调用、UI 交互）
├── package.json         # 项目配置与构建定义
└── README.md            # 项目文档
```

## 系统要求

- **操作系统**：Windows 10/11
- **内存**：建议 4GB+
- **网络**：需要访问所选模型的 API 服务

## 隐私与安全

- 所有数据存储在本地（localStorage）
- API Key 仅保存在本地配置中，不上传任何数据
- 文件操作通过 Electron IPC 安全桥接，渲染进程无直接文件系统访问
- 所有网络请求仅发往用户配置的 API 端点

## 开发指南

### 开发模式

```bash
npm start
```

### 打包

```bash
set CSC_IDENTITY_AUTO_DISCOVERY=false
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npx electron-builder --win nsis
```

### 添加新工具

1. 在 `renderer/app.js` 的 `AGENT_TOOLS` 数组中添加工具定义
2. 在 `execTool()` 方法中添加对应的 `case` 处理
3. 如需 IPC，在 `main.js` 中添加 `ipcMain.handle` 处理器，在 `preload.js` 中添加桥接方法

## 许可证

MIT License

## 致谢

灵感来源于 OpenAI Codex、WorkBuddy、Qoder 等优秀产品。
