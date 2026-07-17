# obsidian-export-readview-pdf

[English](./README.md) | **简体中文**

将 Obsidian **当前阅读视图**（Reading view）的实时渲染 DOM 通过 Chromium 原生打印引擎导出为 PDF，忠实保留所见即所得的排版、主题、插件二次渲染的效果。

- **版本**：0.4.0
- **最低 Obsidian 版本**：1.4.0
- **平台**：仅桌面端（`isDesktopOnly: true`，依赖 Electron `BrowserWindow.webContents.printToPDF`）
- **界面语言**：简体中文 / English
- **协议**：MIT

---

## ✨ 特性

- 🖨️ **直接调用 Chromium 打印引擎**，无需外部依赖（wkhtmltopdf、Puppeteer 等）
- 🧩 **兼容各种阅读视图插件**：Dataview、Excalidraw、Interlinear、Mermaid、自定义 canvas 等 <mark>在 Reading view 中被"二次渲染"出来的内容都能被完整捕获</mark>
- 🖼️ **智能资源内联**：本地图片（`app:`、`file:`、`blob:`、`capacitor:`、同源 http）转 Data URL；`<canvas>` 元素快照为 PNG；开放 Shadow DOM 也会跟着复制
- 🎨 **完整样式还原**：抓取所有 `styleSheets` + `adoptedStyleSheets` + CSS 自定义属性（CSS Variables），保证主题、颜色、字体一致
- ⚙️ **PDF 选项可视化配置**：页面尺寸、方向、边距、缩放、页眉页脚、背景打印
- 📁 **输出路径自由**：Vault 根、相对路径、系统绝对路径，支持 `~/` 展开
- 🔒 **安全打印**：打印窗口开启沙盒、`contextIsolation`、禁用 `nodeIntegration` 与 DevTools；快照阶段剥离 `<script>`、`on*` 事件属性、`javascript:` 协议链接
- 🈯 **双语 UI**：设置页可切换中/英，命令名、Ribbon 提示文本同步刷新

---

## 📋 环境要求

| 项目 | 要求 |
|---|---|
| Obsidian | 桌面版 ≥ 1.4.0 （其他版本未测试） |
| 操作系统 | Windows / macOS / Linux（跟随 Obsidian 支持范围）|
| 移动端 | ❌ 不支持（Electron 依赖）|
| 打开笔记 | 必须处于 **Reading view**（`preview` 模式）|

---

## 🚀 安装

**手动安装（当前仅此方式）**

```
<Your Vault>/.obsidian/plugins/export-readview-pdf/
├── main.js
└── manifest.json
```

1. 在你的 Vault 下创建 `.obsidian/plugins/export-readview-pdf/` 目录
2. 在仓库根目录执行 `npm install` 和 `npm run build`
3. 将 `main.js` 和 `manifest.json` 拷贝到插件目录

---

## 🖱️ 使用方式

打开一篇笔记并切到 **Reading view**，然后二选一：

- 点击左侧 Ribbon 图标 📖（图标 id：`book-open-text`）
- 命令面板 → `将当前阅读视图导出为PDF` / `Export Read-view PDF`

导出中会依次出现通知：

```
Rendering read-view PDF...
   ↓
Exported read-view PDF to /path/to/<NoteName>.readview.pdf.
```

若有本地图片未能被内联，会在最后追加 `N local image(s) could not be embedded and were kept as links.`。

前置校验（任一不满足直接提示并中止）：

1. 当前不存在正在进行的导出（`this.exporting` 为 `false`）
2. 活动视图是 `MarkdownView` 且模式为 `preview`
3. 视图已完成渲染（能找到 `.markdown-preview-view` 容器）

---

## ⚙️ 设置项详解

设置路径：`设置 → 第三方插件 → export-readview-pdf`

### 语言 / Language

| 值 | 说明 |
|---|---|
| `zh-CN`（默认）| 中文界面，命令名"将当前阅读视图导出为PDF" |
| `en` | English 界面，命令名"Export Read-view PDF" |

切换后命令面板名称、Ribbon 悬浮提示会自动刷新（内部使用 `removeCommand` + `addCommand` 重新注册）。

### 输出路径（Output path）

- 留空 → 保存到 **Vault 根目录**
- 相对路径 → 相对 Vault 根解析（例如 `exports/pdf`）
- 绝对路径 → 直接使用（例如 `/Users/you/Documents/PDF`、`D:\PDFs`）
- 支持 `~` / `~/` 展开为用户主目录
- 目录不存在时导出会抛出 `PDF output directory does not exist: <path>`

### PDF 导出选项

| 选项 | 键 | 默认值 | 取值范围 |
|---|---|---|---|
| 横向页面 | `landscape` | `false` | true / false |
| 显示页眉页脚 | `displayHeaderFooter` | `false` | true / false |
| 打印背景 | `printBackground` | `true` | true / false |
| 缩放比例 | `scale` | `1.0` | 0.1 – 2.0，步进 0.1 |
| 页面尺寸 | `pageSize` | `A4` | A3 / A4 / A5 / Legal / Letter / Tabloid |
| 上边距 | `margins.top` | `0.4` in | 0.1 – 2.0 in |
| 下边距 | `margins.bottom` | `0.4` in | 0.1 – 2.0 in |
| 左边距 | `margins.left` | `0.4` in | 0.1 – 2.0 in |
| 右边距 | `margins.right` | `0.4` in | 0.1 – 2.0 in |
| 优先 CSS 页面尺寸 | `preferCSSPageSize` | `false` | true / false |

**页眉页脚模板**（开启 `displayHeaderFooter` 时生效）：

```
┌────────────────────────────────────────────┐
│ 2026-07-17                       Note Title│  ← 页眉：左日期，右标题（省略号）
├────────────────────────────────────────────┤
│                                            │
│              < 正文内容 >                   │
│                                            │
├────────────────────────────────────────────┤
│                   3/12                     │  ← 页脚：当前页/总页数
└────────────────────────────────────────────┘
```

开启页眉页脚时，上/下边距会被自动拉高到至少 **0.5 in**，避免页眉页脚遮挡正文。

**`preferCSSPageSize` 的影响**：

- `false`（默认）：清除 Obsidian 的"可读行宽"限制（`.is-readable-line-width` / `--file-line-width`），让内容按纸张宽度铺满
- `true`：使用 CSS `@page` 中定义的尺寸，"页面尺寸"下拉框失效

### 重置

- `重置输出路径` → 清空为 Vault 根
- `重置 PDF 设置` → 全部 PDF 选项回到上表默认值

---

## 📤 输出文件命名规则

```
<NoteBaseName>.readview.pdf         ← 首次导出
<NoteBaseName>.readview-1.pdf       ← 重名时递增
<NoteBaseName>.readview-2.pdf
...
<NoteBaseName>.readview-9999.pdf    ← 最多探测到 9999，仍冲突则报错
```

写入使用 `fs.open(path, "wx")`（独占创建），并发导出不会互相覆盖。

---

## 🏗️ 工作流程

```
 ┌──────────────────────────────────────────────────────────────┐
 │  用户点击 Ribbon / 触发命令                                   │
 └────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  main.js · ExportReadViewPdfPlugin.exportActiveReadingView() │
 │  · 校验：非并发 / MarkdownView / preview 模式 / 容器已渲染    │
 └────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  src/export.js · ExportReadViewPdfJob.run()                  │
 └────────────────────────────┬─────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  ① 物化 Reading view    ② 构建 HTML 快照      ③ 打印为 PDF
  ReadingViewMateri-     HtmlSnapshotBuilder   PdfPrinter
  alizer.materialize()   .build()              .render()
        │                     │                     │
        ▼                     ▼                     ▼
  · 等待 renderer.       · 克隆 DOM + 同步       · 隐藏离屏
    sections 全部          input/textarea/         BrowserWindow
    rendered=true          details 等状态        · loadURL(blob:HTML)
  · updateShownSections  · 拷贝所有 stylesheet  · 等图片/字体就绪
  · 克隆每个 section       + adoptedStyleSheets  · webContents
    到离屏 host（-100000  · 内联 CSS 自定义       .printToPDF(opts)
    px、pointer-events:   属性（--*）           · 校验 %PDF- 头
    none、opacity:0）    · 图片转 Data URL        并返回 ArrayBuffer
  · 观察 MutationObserver  <canvas> → <img>
    直到 DOM 静默 800ms    Shadow DOM → <template>
  · 检测 Interlinear      · 剥离 <script>/on*/
    等插件 controller.       javascript:
    isBusy() 状态         · 包裹祖先上下文
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  src/export.js · PdfOutputWriter.writePdf()                  │
 │  · 解析输出目录（vault root / ~/ / 绝对路径）                 │
 │  · fs.open(..., "wx") 独占写入，重名递增编号                  │
 └────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
                       ✅ 通知用户输出路径
```

---

## 🧱 代码结构

```
obsidian-export-readview-pdf/
├── manifest.json          # 插件元数据
├── main.js                # esbuild 构建产物，供 Obsidian 加载
├── package.json           # 构建与开发脚本
│
├── src/
│   ├── main.js            # 插件入口、命令注册、Ribbon
│   │                      #   · ExportReadViewPdfPlugin
│   │
│   ├── settings.js        # 设置存储 + 设置面板 UI
│                          #   · LANGUAGE_OPTIONS   (中/英双语文案)
│                          #   · DEFAULT_PDF_OPTIONS
│                          #   · PdfOptions         (归一化 + 校验)
│                          #   · ExportReadViewPdfSettings (load/save)
│                          #   · ExportReadViewPdfSettingTab (UI)
│
│   ├── export.js          # 导出编排 + Electron 打印 + 文件写入
│                          #   · ExportReadViewPdfJob   (串起三个阶段)
│                          #   · PdfPrinter             (BrowserWindow + printToPDF)
│                          #   · PdfOutputWriter        (目录解析 + 独占写入)
│
│   └── snapshot.js        # DOM 物化 + HTML 快照 + 资源内联
│                          #   · ReadingViewMaterializer  (克隆已渲染 sections)
│                          #   · HtmlSnapshotBuilder      (拼装完整 HTML)
│                          #   · DomSnapshotUtils         (状态同步/canvas/shadow)
│                          #   · StyleSnapshotUtils       (样式表序列化)
│                          #   · ImageSnapshotUtils       (图片 → Data URL)
│                          #   · HtmlSerializationUtils   (转义 & 属性序列化)
│
├── LICENSE                # MIT
└── README.md
```

---

## 🔐 安全设计

- **打印 `BrowserWindow`**：
  - `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`
  - `devTools: false`、`focusable: false`、`skipTaskbar: true`、`show: false`
  - `frame: false`，不进入用户视觉
- **HTML 快照消毒**（`DomSnapshotUtils.sanitizeSnapshot`）：
  - 移除所有 `<script>` 元素
  - 移除 `on*` 事件属性、`nonce` 属性
  - `href`/`src` 中的 `javascript:` 协议清空
  - `contenteditable` 强制置 `false`
- **Blob URL 生命周期**：使用 `URL.createObjectURL` 加载快照，导出结束在 `finally` 中 `revokeObjectURL`
- **PDF 校验**：读回的字节前 5 字节必须匹配 `%PDF-`，否则抛错

---

## ⚠️ 已知限制

- 只支持桌面端（`isDesktopOnly: true`）
- 必须在 **Reading view** 触发，Live Preview / Source 模式会被拒绝
- 依赖 `view.previewMode.renderer.sections`、`sizerEl`、`previewEl` 等内部字段；Obsidian 若在未来版本改动这些内部 API，插件会报错 `This Obsidian version does not expose the complete Reading view renderer`
- 跨域 HTTP 图片不会强制内联（仅内联同源、`app:`、`file:`、`blob:`、`capacitor:`）；跨域图会保留原 URL，PDF 中依赖打印窗口的网络访问
- CSS 中的外部字体（`@font-face` 指向远程 URL）不会内联为二进制，但会通过 stylesheet 文本携带 URL
- 单次导出最多探测 10000 个重名文件

---

## 🐛 常见错误信息

| 通知/异常 | 说明 / 处理 |
|---|---|
| `A read-view export is already in progress.` | 已有一次导出未结束，等待完成 |
| `Open a note in Reading view before exporting.` | 当前视图非 Markdown 或非 preview 模式 |
| `The active Reading view has not finished rendering yet.` | Obsidian 内部渲染器尚未准备好，稍等或滚动一下再导出 |
| `Timed out while waiting for Obsidian to render every Reading view section` | 20 秒内未完成分节渲染，通常是笔记很大或后台插件卡住 |
| `Timed out while waiting for reading-view plugins to finish rendering` | 120 秒内 DOM 仍在变化（例如 Interlinear、Dataview 长任务） |
| `PDF output directory does not exist: <path>` | 输出目录不存在，需先创建 |
| `No permission to write PDF to: <path>` | 无写权限（`EACCES` / `EPERM`） |
| `Electron BrowserWindow is unavailable; restart Obsidian and try again` | Electron remote 模块未加载，重启 Obsidian |
| `Electron returned invalid PDF data` | 打印结果非 PDF（打印引擎异常，重试） |

---

## 🛠️ 开发说明

- **打包构建**：测试发现 Obsidian Sync 只会同步插件的 `main.js`，会忽略其引用的其他 JavaScript 文件，因此源模块虽然位于 `src/` 并通过正常的相对路径 `require` 加载，但发布前必须执行 `npm run build`，由 esbuild 将所有模块打包成 Obsidian 加载的根目录 `main.js`
- **无外部依赖**：仅使用 Node 内建（`fs` / `os` / `path`）+ Obsidian API + Electron API
- **调试**：出错日志前缀统一为 `export-readview-pdf:`，在 Obsidian 开发者工具（`Cmd/Ctrl + Shift + I`）过滤即可

### 关键常量

| 常量 | 值 | 位置 |
|---|---|---|
| `RENDERER_READY_TIMEOUT_MS` | 20000 | `src/snapshot.js` |
| `DOM_QUIET_MS` | 800 | `src/snapshot.js` |
| `DOM_SETTLE_TIMEOUT_MS` | 120000 | `src/snapshot.js` |
| `NOTICE_DURATION_MS` | 4000 | `src/main.js` |
| `EXPORT_FILE_SUFFIX` | `.readview.pdf` | `src/export.js` |
| `PDF_HEADER_FOOTER_MINIMUM_MARGIN_INCHES` | 0.5 | `src/export.js` |

---

## 📄 License

MIT © 2026 [QuincyLeo](https://github.com/Quincy-Leo) (Quincy-Leo)

详见 [LICENSE](./LICENSE)。
