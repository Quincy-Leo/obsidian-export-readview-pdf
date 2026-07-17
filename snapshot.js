/*
 * Copyright (c) 2026 QuincyLeo (Gilgamesh-lzq)
 * SPDX-License-Identifier: MIT
 */

"use strict";

const RENDERER_READY_TIMEOUT_MS = 20000;
const DOM_QUIET_MS = 800;
const DOM_SETTLE_TIMEOUT_MS = 120000;

const EXPORT_LAYOUT_CSS = `
html {
    height: auto !important;
    min-height: 100%;
    overflow: visible !important;
    background: var(--background-primary, #ffffff);
}

body.export-readview-document {
    height: auto !important;
    min-height: 100vh;
    margin: 0 !important;
    overflow: visible !important;
    contain: none !important;
    background: var(--background-primary, #ffffff);
    color: var(--text-normal, #1f1f1f);
}

body.export-readview-document .export-readview-root {
    position: relative !important;
    inset: auto !important;
    box-sizing: border-box;
    width: 100% !important;
    height: auto !important;
    min-height: 100vh !important;
    max-height: none !important;
    overflow: visible !important;
    scroll-behavior: auto !important;
}

body.export-readview-document .export-readview-context {
    display: contents !important;
}

.export-readview-root .markdown-preview-view {
    position: relative !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    scrollbar-gutter: auto !important;
}

.export-readview-root .markdown-preview-sizer {
    min-height: 0 !important;
    margin-right: auto !important;
    margin-left: auto !important;
    padding-bottom: 4rem !important;
}

.export-readview-root .markdown-preview-pusher {
    display: none !important;
}

.export-readview-root,
.export-readview-root * {
    animation-play-state: paused !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
}

.export-readview-canvas {
    display: block;
    max-width: 100%;
}

@media print {
    html,
    body.export-readview-document {
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        contain: none !important;
        background: var(--background-primary, #ffffff) !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
    }

    body.export-readview-document .export-readview-root {
        min-height: 0 !important;
    }

    .export-readview-root .markdown-preview-sizer {
        padding-bottom: 0 !important;
    }

    .export-readview-root h1,
    .export-readview-root h2,
    .export-readview-root h3,
    .export-readview-root h4,
    .export-readview-root h5,
    .export-readview-root h6 {
        break-after: avoid-page;
    }

    .export-readview-root .el-p,
    .export-readview-root pre,
    .export-readview-root table,
    .export-readview-root .callout {
        break-inside: avoid-page;
    }
}
`;

class ReadingViewMaterializer {
    static getReadingContainer(view) {
        const previewContainer = view.previewMode && view.previewMode.containerEl;
        if (previewContainer && previewContainer.nodeType === 1) {
            return previewContainer;
        }

        return view.contentEl.querySelector(".markdown-preview-view");
    }

    constructor(app, view, sourceRoot) {
        this.app = app;
        this.view = view;
        this.sourceRoot = sourceRoot;
        this.renderer = view.previewMode && view.previewMode.renderer;
        this.host = null;
        this.root = null;
        this.cleaned = false;
    }

    async materialize() {
        this.assertActive();
        const renderer = this.renderer;
        if (!renderer || !Array.isArray(renderer.sections) || !renderer.sizerEl || !renderer.previewEl) {
            throw new Error("This Obsidian version does not expose the complete Reading view renderer");
        }

        await this.waitForRendererReady();
        this.assertActive();
        if (typeof renderer.updateShownSections === "function") {
            renderer.updateShownSections();
        }

        const sections = renderer.sections.filter((section) => (
            section
            && section.el
            && section.rendered
            && section.shown !== false
        ));
        if (sections.length === 0) {
            throw new Error("The complete Reading view renderer contains no visible sections");
        }

        const doc = this.sourceRoot.ownerDocument;
        this.root = this.createMaterializedRoot(sections, doc);
        this.host = doc.createElement("div");
        this.host.className = "export-readview-materializer";
        const previewWidth = Math.max(
            320,
            Math.ceil(renderer.previewEl.getBoundingClientRect().width || renderer.previewEl.clientWidth || 0),
        );
        this.host.style.setProperty("position", "fixed", "important");
        this.host.style.setProperty("top", "0", "important");
        this.host.style.setProperty("left", "-100000px", "important");
        this.host.style.setProperty("width", `${previewWidth}px`, "important");
        this.host.style.setProperty("height", "auto", "important");
        this.host.style.setProperty("max-height", "none", "important");
        this.host.style.setProperty("overflow", "visible", "important");
        this.host.style.setProperty("opacity", "0", "important");
        this.host.style.setProperty("pointer-events", "none", "important");
        this.host.style.setProperty("z-index", "-2147483647", "important");
        this.host.appendChild(this.root);

        try {
            this.assertActive();
            this.sourceRoot.appendChild(this.host);
            await this.waitForInjectedContent(this.root);
            if (!this.root.isConnected) {
                throw new Error("The Reading view was closed while it was being materialized");
            }
            return this.root;
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    dispose() {
        if (this.cleaned) return;
        this.cleaned = true;
        const host = this.host;
        this.host = null;
        this.root = null;
        if (host) {
            try {
                host.remove();
            } catch (error) {
                console.warn("export-readview-pdf: failed to remove materialized view", error);
            }
        }
    }

    assertActive() {
        if (this.cleaned) {
            throw new Error("Reading-view export was cancelled");
        }
    }

    async waitForRendererReady() {
        if (!this.rendererIsReady() && typeof this.renderer.queueRender === "function") {
            this.renderer.queueRender();
        }

        const ready = await this.waitForCondition(
            () => this.rendererIsReady(),
            RENDERER_READY_TIMEOUT_MS,
            50,
        );
        if (!ready) {
            throw new Error("Timed out while waiting for Obsidian to render every Reading view section");
        }
    }

    rendererIsReady() {
        const renderer = this.renderer;
        return Array.isArray(renderer.sections)
            && renderer.sections.length > 0
            && renderer.sections.every((section) => section && section.rendered)
            && !renderer.queued
            && !renderer.parsing
            && !renderer.rendered
            && (!Array.isArray(renderer.asyncSections) || renderer.asyncSections.length === 0);
    }

    createMaterializedRoot(sections, doc) {
        const root = this.sourceRoot.cloneNode(true);
        DomSnapshotUtils.syncLiveElementState(this.sourceRoot, root);

        const preview = root.querySelector(":scope > .markdown-preview-view")
            || root.querySelector(".markdown-preview-view");
        const sizer = preview && (
            preview.querySelector(":scope > .markdown-preview-sizer")
            || preview.querySelector(".markdown-preview-sizer")
        );
        if (!preview || !sizer) {
            throw new Error("Could not locate the Reading view section container");
        }

        const sectionClones = sections.map((section) => this.cloneRenderedElement(section.el, doc));
        const pusher = this.renderer.pusherEl
            ? this.renderer.pusherEl.cloneNode(true)
            : doc.createElement("div");
        pusher.classList.add("markdown-preview-pusher");
        pusher.style.marginBottom = "0";
        sizer.replaceChildren(pusher, ...sectionClones);

        root.dataset.exportReadviewSections = String(sectionClones.length);
        root.style.setProperty("height", "auto", "important");
        root.style.setProperty("max-height", "none", "important");
        root.style.setProperty("overflow", "visible", "important");
        preview.style.setProperty("height", "auto", "important");
        preview.style.setProperty("min-height", "0", "important");
        preview.style.setProperty("max-height", "none", "important");
        preview.style.setProperty("overflow", "visible", "important");
        sizer.style.setProperty("min-height", "0", "important");
        sizer.style.setProperty("padding-bottom", "0", "important");
        return root;
    }

    cloneRenderedElement(source, doc) {
        const clone = source.cloneNode(true);
        DomSnapshotUtils.syncLiveElementState(source, clone);
        DomSnapshotUtils.snapshotCanvases(source, clone, doc);
        DomSnapshotUtils.copyOpenShadowRoots(source, clone);
        return clone;
    }

    async waitForInjectedContent(root) {
        const startedAt = Date.now();
        let lastMutationAt = startedAt;
        let observedBusyState = false;
        const MutationObserverClass = root.ownerDocument.defaultView.MutationObserver;
        const observer = new MutationObserverClass(() => {
            lastMutationAt = Date.now();
        });
        observer.observe(root, {
            attributes: true,
            characterData: true,
            childList: true,
            subtree: true,
        });

        try {
            while (true) {
                if (this.cleaned) {
                    throw new Error("Reading-view export was cancelled");
                }
                const now = Date.now();
                const busy = this.isInjectedContentBusy(root);
                observedBusyState = observedBusyState || busy;
                if (!busy && now - lastMutationAt >= DOM_QUIET_MS && now - startedAt >= DOM_QUIET_MS) {
                    return;
                }

                const timeout = observedBusyState ? DOM_SETTLE_TIMEOUT_MS : 5000;
                if (now - startedAt >= timeout) {
                    if (busy) {
                        throw new Error("Timed out while waiting for reading-view plugins to finish rendering");
                    }
                    return;
                }
                await ReadingViewMaterializer.waitMs(100);
            }
        } finally {
            observer.disconnect();
        }
    }

    isInjectedContentBusy(root) {
        if (root.querySelector('.it-loading, [aria-busy="true"]')) {
            return true;
        }

        try {
            const manager = this.app.plugins;
            const interlinear = manager && (
                (typeof manager.getPlugin === "function" && manager.getPlugin("interlinear"))
                || (manager.plugins && manager.plugins.interlinear)
            );
            const controller = interlinear && interlinear.controller;
            return Boolean(
                controller
                && typeof controller.isBusy === "function"
                && controller.isBusy(this.view.file.path),
            );
        } catch (_error) {
            return false;
        }
    }

    async waitForCondition(predicate, timeoutMs, intervalMs) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            this.assertActive();
            if (predicate()) return true;
            await ReadingViewMaterializer.waitMs(intervalMs);
        }
        this.assertActive();
        return predicate();
    }

    static waitMs(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }
}

class HtmlSnapshotBuilder {
    constructor(sourceRoot, sourcePath, title, contextSourceRoot = sourceRoot, pluginVersion = "0.4.0") {
        this.sourceRoot = sourceRoot;
        this.sourcePath = sourcePath;
        this.title = title;
        this.contextSourceRoot = contextSourceRoot;
        this.pluginVersion = pluginVersion;
    }

    async build() {
        const sourceRoot = this.sourceRoot;
        const doc = sourceRoot.ownerDocument;
        const win = doc.defaultView;
        const clone = sourceRoot.cloneNode(true);

        clone.classList.add("export-readview-root");
        clone.removeAttribute("tabindex");

        DomSnapshotUtils.syncLiveElementState(sourceRoot, clone);
        StyleSnapshotUtils.copyCustomProperties(sourceRoot, clone, win);

        // Capture the style and document context before asynchronous asset reads.
        const styleText = [
            StyleSnapshotUtils.collectDocumentStyles(doc),
            StyleSnapshotUtils.customPropertyRule(doc.documentElement, ":root", win),
            StyleSnapshotUtils.customPropertyRule(doc.body, "body.export-readview-document", win),
            EXPORT_LAYOUT_CSS,
        ].filter(Boolean).join("\n\n");
        const htmlAttributes = HtmlSerializationUtils.serializeDocumentAttributes(doc.documentElement);
        const bodyAttributes = HtmlSerializationUtils.serializeDocumentAttributes(
            doc.body,
            "export-readview-document",
        );
        const languageElement = sourceRoot.closest("[lang]");
        const language = (languageElement ? languageElement.getAttribute("lang") : "")
            || doc.documentElement.lang;
        const generatedAt = new Date().toISOString();

        const imageResult = await ImageSnapshotUtils.inlineRenderedImages(sourceRoot, clone, win);
        DomSnapshotUtils.snapshotCanvases(sourceRoot, clone, doc);
        DomSnapshotUtils.copyOpenShadowRoots(sourceRoot, clone);
        const snapshotTree = DomSnapshotUtils.wrapInAncestorContext(this.contextSourceRoot, clone);
        DomSnapshotUtils.sanitizeSnapshot(snapshotTree);

        if (language && !doc.documentElement.hasAttribute("lang")) {
            clone.setAttribute("lang", language);
        }

        const html = `<!DOCTYPE html>
<html${htmlAttributes}>
<head>
    <meta charset="utf-8">
    <base href="${HtmlSerializationUtils.escapeAttribute(doc.baseURI)}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="generator" content="export-readview-pdf ${this.pluginVersion}">
    <meta name="obsidian-source-path" content="${HtmlSerializationUtils.escapeAttribute(this.sourcePath)}">
    <meta name="exported-at" content="${HtmlSerializationUtils.escapeAttribute(generatedAt)}">
    <title>${HtmlSerializationUtils.escapeText(this.title)}</title>
    <style>
${HtmlSerializationUtils.escapeStyleText(styleText)}
    </style>
</head>
<body${bodyAttributes}>
${snapshotTree.outerHTML}
</body>
</html>
`;

        return {
            html,
            unembeddedLocalImages: imageResult.failed,
        };
    }
}

class DomSnapshotUtils {
    static wrapInAncestorContext(sourceRoot, cloneRoot) {
        let sourceParent = sourceRoot.parentElement;
        let tree = cloneRoot;

        while (sourceParent && sourceParent !== sourceRoot.ownerDocument.body) {
            const wrapper = sourceParent.cloneNode(false);
            wrapper.removeAttribute("id");
            wrapper.classList.add("export-readview-context");
            wrapper.appendChild(tree);
            tree = wrapper;
            sourceParent = sourceParent.parentElement;
        }

        return tree;
    }

    static copyOpenShadowRoots(sourceRoot, cloneRoot) {
        const sourceElements = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
        const cloneElements = [cloneRoot, ...cloneRoot.querySelectorAll("*")];
        const count = Math.min(sourceElements.length, cloneElements.length);

        for (let index = 0; index < count; index += 1) {
            const source = sourceElements[index];
            const shadowRoot = source.shadowRoot;
            if (!shadowRoot || shadowRoot.mode !== "open") {
                continue;
            }

            const template = cloneRoot.ownerDocument.createElement("template");
            template.setAttribute("shadowrootmode", "open");
            template.innerHTML = shadowRoot.innerHTML;
            cloneElements[index].insertBefore(template, cloneElements[index].firstChild);
        }
    }

    static syncLiveElementState(sourceRoot, cloneRoot) {
        this.forEachElementPair(sourceRoot, cloneRoot, "input", (source, clone) => {
            clone.setAttribute("value", source.value);
            this.syncBooleanAttribute(clone, "checked", source.checked);
            if (source.indeterminate) {
                clone.setAttribute("aria-checked", "mixed");
            }
        });

        this.forEachElementPair(sourceRoot, cloneRoot, "textarea", (source, clone) => {
            clone.textContent = source.value;
        });

        this.forEachElementPair(sourceRoot, cloneRoot, "option", (source, clone) => {
            this.syncBooleanAttribute(clone, "selected", source.selected);
        });

        this.forEachElementPair(sourceRoot, cloneRoot, "details", (source, clone) => {
            this.syncBooleanAttribute(clone, "open", source.open);
        });

        this.forEachElementPair(sourceRoot, cloneRoot, "dialog", (source, clone) => {
            this.syncBooleanAttribute(clone, "open", source.open);
        });

        this.forEachElementPair(sourceRoot, cloneRoot, "progress, meter", (source, clone) => {
            clone.setAttribute("value", String(source.value));
        });
    }

    static forEachElementPair(sourceRoot, cloneRoot, selector, callback) {
        const sourceElements = sourceRoot.querySelectorAll(selector);
        const cloneElements = cloneRoot.querySelectorAll(selector);
        const count = Math.min(sourceElements.length, cloneElements.length);

        for (let index = 0; index < count; index += 1) {
            callback(sourceElements[index], cloneElements[index]);
        }
    }

    static syncBooleanAttribute(element, name, enabled) {
        if (enabled) {
            element.setAttribute(name, "");
        } else {
            element.removeAttribute(name);
        }
    }

    static snapshotCanvases(sourceRoot, cloneRoot, doc) {
        const sourceCanvases = sourceRoot.querySelectorAll("canvas");
        const cloneCanvases = cloneRoot.querySelectorAll("canvas");
        const count = Math.min(sourceCanvases.length, cloneCanvases.length);

        for (let index = 0; index < count; index += 1) {
            const source = sourceCanvases[index];
            const clone = cloneCanvases[index];
            try {
                const image = doc.createElement("img");
                for (const attribute of Array.from(clone.attributes)) {
                    image.setAttribute(attribute.name, attribute.value);
                }
                image.classList.add("export-readview-canvas");
                image.setAttribute("src", source.toDataURL("image/png"));
                image.setAttribute("width", String(source.width));
                image.setAttribute("height", String(source.height));
                image.setAttribute("alt", image.getAttribute("aria-label") || "Canvas snapshot");
                clone.replaceWith(image);
            } catch (error) {
                console.warn("export-readview-pdf: could not snapshot canvas", error);
            }
        }
    }

    static sanitizeSnapshot(root) {
        this.sanitizeNodeTree(root);
        for (const template of root.querySelectorAll("template[shadowrootmode]")) {
            this.sanitizeNodeTree(template.content);
        }
    }

    static sanitizeNodeTree(root) {
        for (const script of root.querySelectorAll("script")) {
            script.remove();
        }

        const elements = root.nodeType === 1
            ? [root, ...root.querySelectorAll("*")]
            : [...root.querySelectorAll("*")];

        for (const element of elements) {
            for (const attribute of Array.from(element.attributes)) {
                const name = attribute.name.toLowerCase();
                const value = attribute.value.trim().toLowerCase();
                if (name.startsWith("on") || name === "nonce") {
                    element.removeAttribute(attribute.name);
                } else if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
                    element.removeAttribute(attribute.name);
                }
            }

            if (element.hasAttribute("contenteditable")) {
                element.setAttribute("contenteditable", "false");
            }
        }
    }
}

class StyleSnapshotUtils {
    static copyCustomProperties(source, clone, win) {
        if (!win || typeof win.getComputedStyle !== "function") {
            return;
        }

        let computed;
        try {
            computed = win.getComputedStyle(source);
        } catch (_error) {
            return;
        }

        for (let index = 0; index < computed.length; index += 1) {
            const property = computed.item(index);
            if (property.startsWith("--")) {
                clone.style.setProperty(property, computed.getPropertyValue(property));
            }
        }
    }

    static customPropertyRule(element, selector, win) {
        if (!element || !win || typeof win.getComputedStyle !== "function") {
            return "";
        }

        let computed;
        try {
            computed = win.getComputedStyle(element);
        } catch (_error) {
            return "";
        }

        const declarations = [];
        for (let index = 0; index < computed.length; index += 1) {
            const property = computed.item(index);
            if (!property.startsWith("--")) {
                continue;
            }

            const value = computed.getPropertyValue(property);
            if (value) {
                declarations.push(`  ${property}: ${value};`);
            }
        }

        return declarations.length > 0
            ? `${selector} {\n${declarations.join("\n")}\n}`
            : "";
    }

    static collectDocumentStyles(doc) {
        const sheets = [];
        const seen = new Set();

        for (const sheet of Array.from(doc.styleSheets || [])) {
            sheets.push(sheet);
            seen.add(sheet);
        }

        for (const sheet of Array.from(doc.adoptedStyleSheets || [])) {
            if (!seen.has(sheet)) {
                sheets.push(sheet);
            }
        }

        return sheets.map((sheet) => this.serializeStyleSheet(sheet)).filter(Boolean).join("\n\n");
    }

    static serializeStyleSheet(sheet) {
        if (sheet.disabled) {
            return "";
        }

        let css = "";
        try {
            css = Array.from(sheet.cssRules || [], (rule) => rule.cssText).join("\n");
        } catch (_error) {
            const owner = sheet.ownerNode;
            if (owner && owner.tagName === "STYLE") {
                css = owner.textContent || "";
            } else if (sheet.href) {
                css = `@import url(${JSON.stringify(sheet.href)});`;
            }
        }

        if (!css) {
            return "";
        }

        const media = sheet.media && sheet.media.mediaText;
        if (media && media !== "all") {
            return `@media ${media} {\n${css}\n}`;
        }

        return css;
    }
}

class ImageSnapshotUtils {
    static async inlineRenderedImages(sourceRoot, cloneRoot, win) {
        const sourceImages = sourceRoot.querySelectorAll("img");
        const cloneImages = cloneRoot.querySelectorAll("img");
        const count = Math.min(sourceImages.length, cloneImages.length);
        let failed = 0;

        for (let index = 0; index < count; index += 1) {
            const source = sourceImages[index];
            const clone = cloneImages[index];
            const sourceUrl = source.currentSrc || source.src;
            if (!sourceUrl) {
                continue;
            }

            clone.setAttribute("src", sourceUrl);
            clone.removeAttribute("srcset");
            clone.removeAttribute("sizes");
            clone.setAttribute("loading", "eager");

            if (!this.shouldInlineUrl(sourceUrl, win)) {
                continue;
            }

            try {
                clone.setAttribute("src", await this.resourceToDataUrl(sourceUrl, win));
            } catch (fetchError) {
                try {
                    clone.setAttribute("src", this.renderedImageToDataUrl(source, win));
                } catch (canvasError) {
                    failed += 1;
                    console.warn(
                        "export-readview-pdf: could not embed image",
                        sourceUrl,
                        fetchError,
                        canvasError,
                    );
                }
            }
        }

        return { failed };
    }

    static shouldInlineUrl(sourceUrl, win) {
        let url;
        try {
            url = new URL(sourceUrl, win && win.document ? win.document.baseURI : undefined);
        } catch (_error) {
            return true;
        }

        if (url.protocol === "data:") {
            return false;
        }

        if (["app:", "file:", "blob:", "capacitor:"].includes(url.protocol)) {
            return true;
        }

        return Boolean(win && win.location && url.origin === win.location.origin);
    }

    static async resourceToDataUrl(sourceUrl, win) {
        const fetchFunction = win && typeof win.fetch === "function"
            ? win.fetch.bind(win)
            : globalThis.fetch.bind(globalThis);
        const response = await fetchFunction(sourceUrl);
        if (!response.ok && response.status !== 0) {
            throw new Error(`HTTP ${response.status}`);
        }

        let blob = await response.blob();
        if (!blob.type) {
            const mimeType = this.imageMimeType(sourceUrl);
            if (mimeType) {
                const BlobClass = win && win.Blob ? win.Blob : globalThis.Blob;
                blob = new BlobClass([await blob.arrayBuffer()], { type: mimeType });
            }
        }

        return this.blobToDataUrl(blob, win);
    }

    static renderedImageToDataUrl(image, win) {
        if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
            throw new Error("The rendered image is not loaded");
        }

        const doc = win && win.document ? win.document : image.ownerDocument;
        const canvas = doc.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("A 2D canvas context is unavailable");
        }

        context.drawImage(image, 0, 0);
        return canvas.toDataURL("image/png");
    }

    static blobToDataUrl(blob, win) {
        const FileReaderClass = win && win.FileReader ? win.FileReader : globalThis.FileReader;
        return new Promise((resolve, reject) => {
            const reader = new FileReaderClass();
            reader.addEventListener("load", () => resolve(String(reader.result)));
            reader.addEventListener("error", () => reject(reader.error || new Error("FileReader failed")));
            reader.readAsDataURL(blob);
        });
    }

    static imageMimeType(sourceUrl) {
        let path = sourceUrl;
        try {
            path = new URL(sourceUrl).pathname;
        } catch (_error) {
            // Keep the original value for relative URLs.
        }

        const extension = path.split(".").pop().toLowerCase();
        return {
            avif: "image/avif",
            bmp: "image/bmp",
            gif: "image/gif",
            ico: "image/x-icon",
            jpeg: "image/jpeg",
            jpg: "image/jpeg",
            png: "image/png",
            svg: "image/svg+xml",
            webp: "image/webp",
        }[extension] || "";
    }
}

class HtmlSerializationUtils {
    static serializeDocumentAttributes(element, extraClass = "") {
        if (!element) {
            return extraClass ? ` class="${this.escapeAttribute(extraClass)}"` : "";
        }

        const attributes = [];
        const classes = new Set((element.getAttribute("class") || "").split(/\s+/).filter(Boolean));
        for (const className of extraClass.split(/\s+/).filter(Boolean)) {
            classes.add(className);
        }

        for (const attribute of Array.from(element.attributes)) {
            const name = attribute.name.toLowerCase();
            if (name === "class" || name.startsWith("on") || name === "nonce") {
                continue;
            }
            attributes.push(`${attribute.name}="${this.escapeAttribute(attribute.value)}"`);
        }

        if (classes.size > 0) {
            attributes.unshift(`class="${this.escapeAttribute(Array.from(classes).join(" "))}"`);
        }

        return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
    }

    static escapeText(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }

    static escapeAttribute(value) {
        return this.escapeText(value).replaceAll('"', "&quot;");
    }

    static escapeStyleText(value) {
        return String(value).replace(/<\/style/gi, "<\\/style");
    }
}

module.exports = {
    DomSnapshotUtils,
    HtmlSerializationUtils,
    HtmlSnapshotBuilder,
    ImageSnapshotUtils,
    ReadingViewMaterializer,
    StyleSnapshotUtils,
};
