# obsidian-export-readview-pdf

**English** | [简体中文](./README.zh-CN.md)

Export the active Obsidian **Reading view**'s live rendered DOM to PDF via Chromium's native print engine. Faithfully preserves the WYSIWYG layout, theme, and content produced by second-pass plugin rendering.

- **Version**: 0.4.0
- **Minimum Obsidian version**: 1.4.0
- **Platforms**: Desktop only (`isDesktopOnly: true`; depends on Electron's `BrowserWindow.webContents.printToPDF`)
- **UI languages**: Simplified Chinese / English
- **License**: MIT

---

## ✨ Features

- 🖨️ **Direct Chromium print engine** — no external dependencies (no wkhtmltopdf, no Puppeteer)
- 🧩 **Compatible with reading-view plugins**: Dataview, Excalidraw, Interlinear, Mermaid, custom canvases — <mark>anything "second-pass rendered" into the Reading view is fully captured</mark>
- 🖼️ **Smart resource inlining**: local images (`app:`, `file:`, `blob:`, `capacitor:`, same-origin http) are converted to Data URLs; `<canvas>` elements are snapshotted as PNGs; open Shadow DOM is cloned along with everything else
- 🎨 **Faithful style reproduction**: captures every `styleSheet` + `adoptedStyleSheets` + CSS custom properties (CSS Variables), so theme/colors/fonts stay consistent
- ⚙️ **Visual PDF options**: page size, orientation, margins, scale, header/footer, background printing
- 📁 **Flexible output path**: vault root, relative path, or system absolute path; supports `~/` expansion
- 🔒 **Secure printing**: the print window enables sandbox, `contextIsolation`, disables `nodeIntegration` and DevTools; during snapshotting `<script>` tags, `on*` event attributes, and `javascript:` URLs are stripped
- 🈯 **Bilingual UI**: switch between Chinese/English in settings; command names and Ribbon tooltips refresh in place

---

## 📋 Requirements

| Item | Requirement |
|---|---|
| Obsidian | Desktop ≥ 1.4.0 (other versions untested) |
| OS | Windows / macOS / Linux (follows Obsidian's support range) |
| Mobile | ❌ Not supported (Electron dependency) |
| Note state | Must be in **Reading view** (`preview` mode) |

---

## 🚀 Installation

**Manual install (only supported method for now)**

```
<Your Vault>/.obsidian/plugins/export-readview-pdf/
├── main.js
└── manifest.json
```

1. Create the directory `.obsidian/plugins/export-readview-pdf/` inside your vault
2. Run `npm install` and `npm run build` in the repository root
3. Copy `main.js` and `manifest.json` into the plugin directory

---

## 🖱️ Usage

Open a note, switch to **Reading view**, then choose one of:

- Click the 📖 Ribbon icon on the left (icon id: `book-open-text`)
- Command palette → `Export Read-view PDF` / `将当前阅读视图导出为PDF`

Notifications during export:

```
Rendering read-view PDF...
   ↓
Exported read-view PDF to /path/to/<NoteName>.readview.pdf.
```

If any local images could not be inlined, an extra message is appended: `N local image(s) could not be embedded and were kept as links.`

Pre-flight checks (export aborts with a notice if any fails):

1. No export is currently in progress (`this.exporting` is `false`)
2. Active view is a `MarkdownView` in `preview` mode
3. The view has finished rendering (a `.markdown-preview-view` container exists)

---

## ⚙️ Settings

Path: `Settings → Community plugins → export-readview-pdf`

### Language

| Value | Description |
|---|---|
| `zh-CN` (default) | Chinese UI, command name "将当前阅读视图导出为PDF" |
| `en` | English UI, command name "Export Read-view PDF" |

Switching updates the command palette entry and Ribbon tooltip live (internally re-registers via `removeCommand` + `addCommand`).

### Output path

- Empty → save to the **vault root**
- Relative path → resolved against the vault root (e.g. `exports/pdf`)
- Absolute path → used as-is (e.g. `/Users/you/Documents/PDF`, `D:\PDFs`)
- Supports `~` / `~/` expansion to the home directory
- If the directory does not exist, the export throws `PDF output directory does not exist: <path>`

### PDF export options

| Option | Key | Default | Range |
|---|---|---|---|
| Landscape | `landscape` | `false` | true / false |
| Display headers and footers | `displayHeaderFooter` | `false` | true / false |
| Print background | `printBackground` | `true` | true / false |
| Scale | `scale` | `1.0` | 0.1 – 2.0, step 0.1 |
| Page size | `pageSize` | `A4` | A3 / A4 / A5 / Legal / Letter / Tabloid |
| Top margin | `margins.top` | `0.4` in | 0.1 – 2.0 in |
| Bottom margin | `margins.bottom` | `0.4` in | 0.1 – 2.0 in |
| Left margin | `margins.left` | `0.4` in | 0.1 – 2.0 in |
| Right margin | `margins.right` | `0.4` in | 0.1 – 2.0 in |
| Prefer CSS page size | `preferCSSPageSize` | `false` | true / false |

**Header/footer template** (only when `displayHeaderFooter` is on):

```
┌────────────────────────────────────────────┐
│ 2026-07-17                       Note Title│  ← Header: date on the left, title (ellipsis) on the right
├────────────────────────────────────────────┤
│                                            │
│              < Note content >              │
│                                            │
├────────────────────────────────────────────┤
│                   3/12                     │  ← Footer: current page / total pages
└────────────────────────────────────────────┘
```

When headers/footers are enabled, top/bottom margins are auto-bumped to at least **0.5 in** so they don't overlap the body.

**Effect of `preferCSSPageSize`**:

- `false` (default): clears Obsidian's "readable line width" cap (`.is-readable-line-width` / `--file-line-width`) so content fills the full paper width
- `true`: uses the size defined in CSS `@page`; the "page size" dropdown is ignored

### Reset

- `Reset output path` → clears back to vault root
- `Reset PDF settings` → all PDF options restored to the defaults in the table above

---

## 📤 Output filename rules

```
<NoteBaseName>.readview.pdf         ← first export
<NoteBaseName>.readview-1.pdf       ← incremented on name collision
<NoteBaseName>.readview-2.pdf
...
<NoteBaseName>.readview-9999.pdf    ← up to 9999; if still colliding, error out
```

Files are written with `fs.open(path, "wx")` (exclusive create), so concurrent exports never overwrite each other.

---

## 🏗️ Workflow

```
 ┌──────────────────────────────────────────────────────────────┐
 │  User clicks Ribbon / triggers command                       │
 └────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  main.js · ExportReadViewPdfPlugin.exportActiveReadingView() │
 │  · Check: not concurrent / MarkdownView / preview / rendered │
 └────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  src/export.js · ExportReadViewPdfJob.run()                  │
 └────────────────────────────┬─────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  ① Materialize view    ② Build HTML snapshot  ③ Print to PDF
  ReadingViewMateri-     HtmlSnapshotBuilder   PdfPrinter
  alizer.materialize()   .build()              .render()
        │                     │                     │
        ▼                     ▼                     ▼
  · Wait until every     · Clone DOM + sync      · Off-screen
    renderer.section        input/textarea/         BrowserWindow
    is rendered=true        details state         · loadURL(blob:HTML)
  · updateShownSections  · Copy every            · Wait for images
  · Clone each section     stylesheet +            + fonts to settle
    into an off-screen     adoptedStyleSheets    · webContents
    host (-100000 px,    · Inline CSS custom       .printToPDF(opts)
    pointer-events:        properties (--*)      · Verify %PDF- header
    none, opacity:0)     · Images → Data URL       and return an
  · MutationObserver       <canvas> → <img>        ArrayBuffer
    until DOM is quiet     Shadow DOM → <template>
    for 800ms            · Strip <script>/on*/
  · Detect plugin          javascript:
    controller.isBusy()  · Wrap in ancestor
    (e.g. Interlinear)     context
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  src/export.js · PdfOutputWriter.writePdf()                  │
 │  · Resolve output dir (vault root / ~/ / absolute)           │
 │  · fs.open(..., "wx") exclusive write, increment on collision│
 └────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
                     ✅ Notify user of output path
```

---

## 🧱 Code layout

```
obsidian-export-readview-pdf/
├── manifest.json          # Plugin metadata
├── main.js                # esbuild output; the file loaded by Obsidian
├── package.json           # Build and development scripts
│
├── src/
│   ├── main.js            # Plugin entry, command/Ribbon registration
│   │                      #   · ExportReadViewPdfPlugin
│   │
│   ├── settings.js        # Settings store + settings UI
│                          #   · LANGUAGE_OPTIONS         (bilingual copy)
│                          #   · DEFAULT_PDF_OPTIONS
│                          #   · PdfOptions               (normalize + validate)
│                          #   · ExportReadViewPdfSettings (load/save)
│                          #   · ExportReadViewPdfSettingTab (UI)
│
│   ├── export.js          # Export orchestration + Electron print + file write
│                          #   · ExportReadViewPdfJob   (chains the three phases)
│                          #   · PdfPrinter             (BrowserWindow + printToPDF)
│                          #   · PdfOutputWriter        (path resolution + exclusive write)
│
│   └── snapshot.js        # DOM materialization + HTML snapshot + resource inlining
│                          #   · ReadingViewMaterializer  (clones rendered sections)
│                          #   · HtmlSnapshotBuilder      (assembles the full HTML)
│                          #   · DomSnapshotUtils         (state sync / canvas / shadow)
│                          #   · StyleSnapshotUtils       (stylesheet serialization)
│                          #   · ImageSnapshotUtils       (image → Data URL)
│                          #   · HtmlSerializationUtils   (escaping & attribute serialization)
│
├── LICENSE                # MIT
└── README.md
```

---

## 🔐 Security design

- **Print `BrowserWindow`**:
  - `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
  - `devTools: false`, `focusable: false`, `skipTaskbar: true`, `show: false`
  - `frame: false`, never visible to the user
- **HTML snapshot sanitization** (`DomSnapshotUtils.sanitizeSnapshot`):
  - Removes every `<script>` element
  - Strips `on*` event attributes and `nonce` attributes
  - Clears `href`/`src` values starting with `javascript:`
  - Forces `contenteditable` to `false`
- **Blob URL lifecycle**: loads the snapshot via `URL.createObjectURL`, then `revokeObjectURL` in the `finally` block
- **PDF validation**: the first 5 bytes returned must match `%PDF-`; otherwise the export errors out

---

## ⚠️ Known limitations

- Desktop only (`isDesktopOnly: true`)
- Must be triggered from **Reading view**; Live Preview / Source mode is rejected
- Depends on internals: `view.previewMode.renderer.sections`, `sizerEl`, `previewEl`, etc. If Obsidian changes these APIs, the plugin errors with `This Obsidian version does not expose the complete Reading view renderer`
- Cross-origin HTTP images are not force-inlined (only same-origin, `app:`, `file:`, `blob:`, `capacitor:` are inlined); cross-origin images keep their original URL and depend on the print window's network access
- External fonts in CSS (`@font-face` pointing at remote URLs) are not inlined as binaries, but their URLs are carried through in the stylesheet text
- A single export probes at most 10000 name collisions

---

## 🐛 Common error messages

| Notice / Exception | Explanation / Handling |
|---|---|
| `A read-view export is already in progress.` | Another export is still running; wait for it to finish |
| `Open a note in Reading view before exporting.` | Current view is not a Markdown view, or not in preview mode |
| `The active Reading view has not finished rendering yet.` | Obsidian's internal renderer isn't ready; scroll a bit and retry |
| `Timed out while waiting for Obsidian to render every Reading view section` | Section rendering didn't complete within 20s; usually a huge note or a stuck background plugin |
| `Timed out while waiting for reading-view plugins to finish rendering` | The DOM kept mutating for 120s (e.g. long-running Interlinear or Dataview task) |
| `PDF output directory does not exist: <path>` | Output directory missing; create it first |
| `No permission to write PDF to: <path>` | No write permission (`EACCES` / `EPERM`) |
| `Electron BrowserWindow is unavailable; restart Obsidian and try again` | Electron remote module isn't loaded; restart Obsidian |
| `Electron returned invalid PDF data` | Print result isn't a PDF (print engine glitch); retry |

---

## 🛠️ Development notes

- **Bundled build**: testing found that Obsidian Sync only syncs a plugin's `main.js` and ignores other JavaScript files referenced by it. The source modules therefore live under `src/` and use normal relative `require` calls during development, but `npm run build` must be run before distribution so esbuild bundles every module into the root `main.js` loaded by Obsidian
- **No external dependencies**: only Node built-ins (`fs` / `os` / `path`) + Obsidian API + Electron API
- **Debugging**: every log is prefixed with `export-readview-pdf:`; filter for it in Obsidian's DevTools (`Cmd/Ctrl + Shift + I`)

### Key constants

| Constant | Value | Location |
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

See [LICENSE](./LICENSE) for details.
