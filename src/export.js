/*
 * Copyright (c) 2026 QuincyLeo (Quincy-Leo)
 * SPDX-License-Identifier: MIT
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { PdfOptions } = require("./settings");
const { HtmlSnapshotBuilder, ReadingViewMaterializer } = require("./snapshot");

const EXPORT_FILE_SUFFIX = ".readview.pdf";
const PDF_MINIMUM_MARGIN_INCHES = 0.1;
const PDF_MAXIMUM_MARGIN_INCHES = 2;
const PDF_HEADER_FOOTER_MINIMUM_MARGIN_INCHES = 0.5;
const PDF_HEADER_TEMPLATE = `
<div style="
    box-sizing: border-box;
    color: #666;
    display: flex;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 10px;
    gap: 12px;
    padding: 0 0.4in;
    width: 100%;
">
    <span class="date" style="flex: none;"></span>
    <span class="title" style="
        flex: 1;
        overflow: hidden;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
    "></span>
</div>`;
const PDF_FOOTER_TEMPLATE = `
<div style="
    box-sizing: border-box;
    color: #666;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 10px;
    padding: 0 0.4in;
    text-align: center;
    width: 100%;
">
    <span class="pageNumber"></span>/<span class="totalPages"></span>
</div>`;
const PDF_FULL_WIDTH_STYLE = `
body.export-readview-document,
.export-readview-root,
.export-readview-root.markdown-preview-view,
.export-readview-root .markdown-preview-view,
.export-readview-root.markdown-preview-sizer,
.export-readview-root .markdown-preview-sizer,
.export-readview-root.markdown-preview-section,
.export-readview-root .markdown-preview-section {
    box-sizing: border-box !important;
    max-width: none !important;
    width: 100% !important;
}

body.export-readview-document,
.export-readview-root,
.export-readview-root.markdown-preview-view,
.export-readview-root .markdown-preview-view,
.export-readview-root.markdown-preview-sizer,
.export-readview-root .markdown-preview-sizer,
.export-readview-root.markdown-preview-section,
.export-readview-root .markdown-preview-section {
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
}`;

class ExportReadViewPdfJob {
    constructor(app, pluginVersion) {
        this.app = app;
        this.pluginVersion = pluginVersion;
        this.pdfPrinter = new PdfPrinter();
        this.activeMaterializer = null;
    }

    getReadingContainer(view) {
        return ReadingViewMaterializer.getReadingContainer(view);
    }

    async run(view, settings) {
        const readingContainer = this.getReadingContainer(view);
        if (!readingContainer) {
            throw new Error("The active Reading view has not finished rendering yet");
        }

        let materializer = null;
        try {
            materializer = new ReadingViewMaterializer(this.app, view, readingContainer);
            this.activeMaterializer = materializer;
            const materializedRoot = await materializer.materialize();
            const snapshot = await new HtmlSnapshotBuilder(
                materializedRoot,
                view.file.path,
                view.file.basename,
                readingContainer,
                this.pluginVersion,
            ).build();

            materializer.dispose();
            this.clearMaterializer(materializer);
            materializer = null;

            const pdfData = await this.pdfPrinter.render(
                snapshot.html,
                readingContainer.ownerDocument.defaultView,
                view.file.basename,
                settings.pdfOptions,
            );
            const outputPath = await PdfOutputWriter.writePdf(
                this.app.vault,
                settings.outputDirectory,
                view.file.basename,
                pdfData,
            );
            return {
                outputPath,
                unembeddedLocalImages: snapshot.unembeddedLocalImages,
            };
        } finally {
            if (materializer) {
                materializer.dispose();
                this.clearMaterializer(materializer);
            }
        }
    }

    clearMaterializer(materializer) {
        if (this.activeMaterializer === materializer) {
            this.activeMaterializer = null;
        }
    }

    dispose() {
        if (this.activeMaterializer) {
            this.activeMaterializer.dispose();
            this.activeMaterializer = null;
        }
        this.pdfPrinter.dispose();
    }
}

class PdfPrinter {
    constructor() {
        this.printWindows = new Set();
        this.disposed = false;
    }

    dispose() {
        this.disposed = true;
        for (const printWindow of this.printWindows) {
            this.destroyPrintWindow(printWindow);
        }
        this.printWindows.clear();
    }

    async render(html, sourceWindow, title, pdfOptions) {
        if (this.disposed) {
            throw new Error("The PDF printer is no longer available");
        }

        const blobUrl = this.createHtmlBlobUrl(html, sourceWindow);
        const printOptions = PdfOptions.normalize(pdfOptions);
        let printWindow = null;
        try {
            printWindow = this.createPrintWindow(sourceWindow, title);
            this.printWindows.add(printWindow);

            await printWindow.loadURL(blobUrl);
            if (!printOptions.preferCSSPageSize) {
                await this.clearReadableLineWidth(printWindow.webContents);
            }
            const layout = await this.waitForPrintableLayout(printWindow.webContents);
            if (!layout || layout.height < 1 || layout.textLength < 1) {
                throw new Error("The print window rendered an empty document");
            }

            for (const side of ["top", "bottom", "left", "right"]) {
                printOptions.margins[side] = Math.min(
                    PDF_MAXIMUM_MARGIN_INCHES,
                    Math.max(PDF_MINIMUM_MARGIN_INCHES, printOptions.margins[side]),
                );
            }
            if (printOptions.displayHeaderFooter) {
                printOptions.headerTemplate = PDF_HEADER_TEMPLATE;
                printOptions.footerTemplate = PDF_FOOTER_TEMPLATE;
                printOptions.margins.top = Math.max(
                    PDF_HEADER_FOOTER_MINIMUM_MARGIN_INCHES,
                    printOptions.margins.top,
                );
                printOptions.margins.bottom = Math.max(
                    PDF_HEADER_FOOTER_MINIMUM_MARGIN_INCHES,
                    printOptions.margins.bottom,
                );
            }
            const pdfBuffer = await printWindow.webContents.printToPDF(printOptions);
            return PdfPrinter.toVerifiedArrayBuffer(pdfBuffer);
        } finally {
            if (printWindow) {
                this.printWindows.delete(printWindow);
                this.destroyPrintWindow(printWindow);
            }
            this.revokeHtmlBlobUrl(blobUrl, sourceWindow);
        }
    }

    createHtmlBlobUrl(html, sourceWindow) {
        const BlobClass = sourceWindow && sourceWindow.Blob;
        const urlApi = sourceWindow && sourceWindow.URL;
        if (
            typeof BlobClass !== "function"
            || !urlApi
            || typeof urlApi.createObjectURL !== "function"
        ) {
            throw new Error("The Obsidian window does not expose the Blob URL API");
        }

        const blob = new BlobClass([html], { type: "text/html;charset=utf-8" });
        return urlApi.createObjectURL(blob);
    }

    async clearReadableLineWidth(webContents) {
        const styleText = JSON.stringify(PDF_FULL_WIDTH_STYLE);
        await webContents.executeJavaScript(`
            (() => {
                document.querySelectorAll(".is-readable-line-width").forEach((element) => {
                    element.classList.remove("is-readable-line-width");
                });

                document.documentElement.style.setProperty("--file-line-width", "100%");
                const existingStyle = document.getElementById("export-readview-full-width-style");
                if (existingStyle) existingStyle.remove();

                const style = document.createElement("style");
                style.id = "export-readview-full-width-style";
                style.textContent = ${styleText};
                document.head.appendChild(style);
            })();
        `);
    }

    revokeHtmlBlobUrl(blobUrl, sourceWindow) {
        try {
            const urlApi = sourceWindow && sourceWindow.URL;
            if (urlApi && typeof urlApi.revokeObjectURL === "function") {
                urlApi.revokeObjectURL(blobUrl);
            }
        } catch (error) {
            console.warn("export-readview-pdf: failed to revoke HTML Blob URL", error);
        }
    }

    createPrintWindow(sourceWindow, title) {
        const electron = sourceWindow && sourceWindow.electron;
        const remote = electron && electron.remote;
        let BrowserWindow = remote && remote.BrowserWindow;

        if (typeof BrowserWindow !== "function" && sourceWindow && typeof sourceWindow.require === "function") {
            try {
                BrowserWindow = sourceWindow.require("@electron/remote").BrowserWindow;
            } catch (_error) {
                // The Obsidian-provided remote object is the primary path.
            }
        }

        if (typeof BrowserWindow !== "function") {
            throw new Error("Electron BrowserWindow is unavailable; restart Obsidian and try again");
        }

        let printWindow = null;
        try {
            printWindow = new BrowserWindow({
                title: `${title} - read-view PDF`,
                width: 900,
                height: 1200,
                show: false,
                frame: false,
                focusable: false,
                skipTaskbar: true,
                backgroundColor: "#ffffff",
                webPreferences: {
                    backgroundThrottling: false,
                    contextIsolation: true,
                    devTools: false,
                    javascript: true,
                    nodeIntegration: false,
                    sandbox: true,
                    spellcheck: false,
                },
            });

            printWindow.setMenuBarVisibility(false);
            printWindow.webContents.setZoomFactor(1);
            return printWindow;
        } catch (error) {
            if (printWindow) {
                this.destroyPrintWindow(printWindow);
            }
            throw error;
        }
    }

    async waitForPrintableLayout(webContents) {
        return webContents.executeJavaScript(`
            (() => {
                const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
                const images = Array.from(document.images);
                const waitForImage = (image) => {
                    if (image.complete) return Promise.resolve();
                    return Promise.race([
                        new Promise((resolve) => {
                            image.addEventListener("load", resolve, { once: true });
                            image.addEventListener("error", resolve, { once: true });
                        }),
                        delay(5000),
                    ]);
                };
                const fontsReady = document.fonts
                    ? Promise.race([document.fonts.ready.catch(() => undefined), delay(5000)])
                    : Promise.resolve();

                return Promise.all([Promise.all(images.map(waitForImage)), fontsReady])
                    .then(() => delay(100))
                    .then(() => {
                        window.scrollTo(0, 0);
                        const root = document.documentElement;
                        const body = document.body;
                        return {
                            height: Math.max(
                                root.scrollHeight,
                                root.offsetHeight,
                                body.scrollHeight,
                                body.offsetHeight,
                                body.getBoundingClientRect().height,
                            ),
                            textLength: (body.textContent || "").trim().length,
                            imageCount: images.length,
                        };
                    });
            })()
        `, true);
    }

    destroyPrintWindow(printWindow) {
        try {
            if (!printWindow.isDestroyed()) {
                printWindow.destroy();
            }
        } catch (error) {
            console.warn("export-readview-pdf: failed to destroy print window", error);
        }
    }

    static toVerifiedArrayBuffer(value) {
        let arrayBuffer;
        if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") {
            arrayBuffer = value.slice(0);
        } else if (ArrayBuffer.isView(value)) {
            arrayBuffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        } else if (value && value.type === "Buffer" && Array.isArray(value.data)) {
            arrayBuffer = Uint8Array.from(value.data).buffer;
        } else if (value && typeof value.length === "number") {
            arrayBuffer = Uint8Array.from(value).buffer;
        } else {
            throw new Error("Electron returned an unsupported PDF buffer");
        }

        const bytes = new Uint8Array(arrayBuffer);
        const signature = String.fromCharCode(...bytes.slice(0, 5));
        if (bytes.byteLength < 5 || signature !== "%PDF-") {
            throw new Error("Electron returned invalid PDF data");
        }

        return arrayBuffer;
    }
}

class PdfOutputWriter {
    static async writePdf(vault, configuredDirectory, sourceBaseName, pdfData) {
        const directory = this.resolveOutputDirectory(vault, configuredDirectory);
        const bytes = this.toBytes(pdfData);
        const safeBaseName = path.basename(String(sourceBaseName || "untitled"));

        for (let suffix = 0; suffix < 10000; suffix += 1) {
            const fileName = suffix === 0
                ? `${safeBaseName}${EXPORT_FILE_SUFFIX}`
                : `${safeBaseName}.readview-${suffix}.pdf`;
            const candidate = path.join(directory, fileName);
            try {
                await this.writeFileExclusive(candidate, bytes);
                return candidate;
            } catch (error) {
                if (error && error.code === "EEXIST") {
                    continue;
                }
                throw this.formatWriteError(error, directory);
            }
        }

        throw new Error("Could not find an available export filename");
    }

    static async writeFileExclusive(candidate, bytes) {
        let fileHandle = null;
        try {
            fileHandle = await fs.promises.open(candidate, "wx");
            await fileHandle.writeFile(bytes);
            await fileHandle.close();
            fileHandle = null;
        } catch (error) {
            if (fileHandle) {
                try {
                    await fileHandle.close();
                } catch (closeError) {
                    console.warn("export-readview-pdf: failed to close partial PDF", closeError);
                }
                try {
                    await fs.promises.unlink(candidate);
                } catch (removeError) {
                    if (!removeError || removeError.code !== "ENOENT") {
                        console.warn(
                            "export-readview-pdf: failed to remove partial PDF",
                            removeError,
                        );
                    }
                }
            }
            throw error;
        }
    }

    static resolveOutputDirectory(vault, configuredDirectory) {
        const value = String(configuredDirectory || "").trim();
        const vaultRoot = this.getVaultRoot(vault);
        if (!value) {
            return vaultRoot;
        }

        const expandedValue = this.expandHomeDirectory(value);
        return path.isAbsolute(expandedValue)
            ? path.normalize(expandedValue)
            : path.resolve(vaultRoot, expandedValue);
    }

    static getVaultRoot(vault) {
        const adapter = vault && vault.adapter;
        if (!adapter || typeof adapter.getBasePath !== "function") {
            throw new Error("Could not resolve the vault root path");
        }
        return adapter.getBasePath();
    }

    static expandHomeDirectory(value) {
        if (value === "~") {
            return os.homedir();
        }
        if (value.startsWith("~/") || value.startsWith("~\\")) {
            return path.join(os.homedir(), value.slice(2));
        }
        return value;
    }

    static toBytes(pdfData) {
        if (pdfData instanceof ArrayBuffer) {
            return Buffer.from(pdfData);
        }
        if (ArrayBuffer.isView(pdfData)) {
            return Buffer.from(pdfData.buffer, pdfData.byteOffset, pdfData.byteLength);
        }
        throw new Error("Could not prepare PDF data for writing");
    }

    static formatWriteError(error, directory) {
        const code = error && error.code;
        if (code === "ENOENT") {
            return new Error(`PDF output directory does not exist: ${directory}`);
        }
        if (code === "EACCES" || code === "EPERM") {
            return new Error(`No permission to write PDF to: ${directory}`);
        }
        if (code === "ENOTDIR") {
            return new Error(`PDF output path is not a directory: ${directory}`);
        }

        const detail = error && error.message ? ` ${error.message}` : "";
        return new Error(`Could not write PDF to ${directory}.${detail}`);
    }
}

module.exports = {
    ExportReadViewPdfJob,
    PdfOutputWriter,
    PdfPrinter,
    ExportPathUtils: PdfOutputWriter,
};
