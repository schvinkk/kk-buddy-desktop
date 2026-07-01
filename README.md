# KK-Buddy Desktop

Universal AI Coding Assistant - 本地 AI 编程助手，由自定义大模型驱动。

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

## 快速开始

### 方式一：下载安装包（推荐）

前往 [Releases 页面](https://github.com/schvinkk/kk-buddy-desktop/releases) 下载最新安装包：

- **Windows**: `KK-Buddy Desktop Setup 2.0.0.exe` — 双击安装，开箱即用

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

### 方式三：打包后运行

```bash
# 安装打包工具
npm install electron-builder --save-dev

# 打包 Windows 安装包
npx electron-builder --win
```

## 功能特性

### 多模型支持
支持任何 OpenAI Chat Completions 兼容 API，开箱即用预设：
- **GPT-4.1** (OpenAI)
- **DeepSeek V4 Pro / Flash** (DeepSeek)
- **通义千问 Plus** (阿里云)
- **Kimi K2.6** (Moonshot)
- **智谱 GLM-5**
- **MiMo v2.5** (小米)
- 以及任何自定义 OpenAI 兼容 API

### Agent 工具系统
开启 Agent 模式后，模型可自动调用工具完成任务：

| 工具 | 功能 |
|------|------|
| `shell` | 执行 Shell 命令 |
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件 |
| `list_directory` | 列出目录内容 |
| `edit_file` | 查找替换编辑文件 |
| `grep_search` | 正则搜索文件内容 |
| `read_multiple_files` | 批量读取多个文件 |
| `list_files` | 递归列出文件（支持模式过滤） |

### 文件与图片
- 拖拽或点击上传图片（多模态模型）
- 附加文本文件（代码、文档等），内容自动嵌入对话
- 支持多种文件类型自动识别图标

### 项目管理
- 选择项目工作区目录
- Agent 工具默认在项目目录下操作
- Shell 命令默认在项目目录执行

### UI 特性
- 深色主题，护眼舒适
- 代码块语法高亮（20+ 语言）+ 行号显示
- 可折叠的工具调用结果
- 可折叠的思考过程（Reasoning）
- 对话历史搜索
- 对话导出（Markdown）
- 系统托盘常驻

## 快速开始

### 方式一：直接运行（开发模式）

```bash
# 1. 确保已安装 Node.js (>= 18)
# 2. 进入项目目录
cd kk-buddy-desktop

# 3. 安装依赖（首次运行自动安装，或手动执行）
npm install

# 4. 启动应用
npm start
```

### 方式二：打包后运行

```bash
# 安装打包工具
npm install electron-builder --save-dev

# 打包当前平台
npx electron-builder

# 打包所有平台
npx electron-builder -mwl
```

### 配置模型

1. 点击右上角模型徽章打开设置
2. 在「模型配置」标签页添加你的 API 信息：
   - **模型显示名称**：随意命名
   - **模型 ID**：API 对应的模型标识（如 `gpt-4.1`、`deepseek-v4-pro`、`kimi-k2.6`）
   - **API 地址**：Base URL（如 `https://api.openai.com/v1`）
   - **API Key**：你的密钥（可选，部分本地模型不需要）
3. 保存设置后即可使用

## 项目结构

```
kk-buddy-desktop/
├── main.js              # Electron 主进程（窗口、IPC、工具处理）
├── preload.js           # 预加载脚本（安全桥接）
├── index.html           # 主界面 HTML
├── css/
│   └── theme.css        # 深色主题样式
├── renderer/
│   └── app.js           # 前端应用逻辑
├── package.json         # 项目配置
└── start.bat            # Windows 一键启动脚本
```

## 系统要求

- **Node.js** >= 18.0.0
- **操作系统**：Windows 10/11、macOS 10.15+、Linux
- **内存**：建议 4GB+
- **网络**：需要访问所选模型的 API 服务

## 技术栈

- **Electron** - 跨平台桌面框架
- **原生 HTML/CSS/JS** - 零前端框架依赖，轻量快速
- **OpenAI Chat Completions API** - 统一的模型接口标准
- **SSE Streaming** - 实时流式响应

## 隐私与安全

- 所有数据存储在本地（localStorage）
- API Key 仅保存在本地配置中
- 不上传任何数据到第三方服务器（除你配置的 API 端点）
- 文件操作通过 Electron IPC 安全桥接，渲染进程无直接文件系统访问

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

灵感来源于 OpenAI Codex、WorkBuddy、Qoder 等优秀产品。
