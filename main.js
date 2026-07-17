/*
 * Copyright (c) 2026 QuincyLeo (Gilgamesh-lzq)
 * SPDX-License-Identifier: MIT
 */

"use strict";

const {
    MarkdownView,
    Notice,
    Plugin,
    setTooltip,
} = require("obsidian");
const fs = require("fs");
const path = require("path");

const PLUGIN_VERSION = "0.4.0";
const EXPORT_COMMAND_ID = "export-read-view-pdf";
const RIBBON_ICON_ID = "book-open-text";
const NOTICE_DURATION_MS = 4000;

class ExportReadViewPdfPlugin extends Plugin {
    constructor(...args) {
        super(...args);
        this.exporting = false;
        this.settings = null;
        this.settingsStore = null;
        this.settingTabClass = null;
        this.exportJobClass = null;
        this.moduleLoader = null;
        this.exportJob = null;
        this.exportCommand = null;
        this.ribbonIconEl = null;
        this.exportReadingView = () => {
            void this.exportActiveReadingView();
        };
    }

    async onload() {
        this.loadPluginModules();
        await this.loadSettings();
        this.exportJob = new this.exportJobClass(this.app, PLUGIN_VERSION);

        this.exportCommand = this.addCommand({
            id: EXPORT_COMMAND_ID,
            name: this.uiText.commandName,
            callback: this.exportReadingView,
        });

        this.ribbonIconEl = this.addRibbonIcon(
            RIBBON_ICON_ID,
            this.uiText.ribbonTitle,
            this.exportReadingView,
        );
        this.addSettingTab(new this.settingTabClass(this.app, this.settingsStore));
    }

    onunload() {
        if (this.exportJob) {
            this.exportJob.dispose();
            this.exportJob = null;
        }
        if (this.moduleLoader) {
            this.moduleLoader.dispose();
            this.moduleLoader = null;
        }
    }

    get uiText() {
        return this.settingsStore
            ? this.settingsStore.uiText
            : {
                commandName: "将当前阅读视图导出为PDF",
                ribbonTitle: "将当前阅读视图导出为PDF",
            };
    }

    loadPluginModules() {
        this.moduleLoader = new PluginModuleLoader(this, require);
        const settingsModule = this.moduleLoader.require("./settings");
        const exportModule = this.moduleLoader.require("./export");
        this.settingTabClass = settingsModule.ExportReadViewPdfSettingTab;
        this.exportJobClass = exportModule.ExportReadViewPdfJob;
        this.settingsStore = new settingsModule.ExportReadViewPdfSettings(this, () => {
            this.settings = this.settingsStore.value;
            this.refreshLocalizedEntryLabels();
        });
    }

    async loadSettings() {
        this.settings = await this.settingsStore.load();
        return this.settings;
    }

    async setLanguage(language) {
        await this.settingsStore.setLanguage(language);
        this.settings = this.settingsStore.value;
    }

    async setPdfOptions(pdfOptions) {
        await this.settingsStore.setPdfOptions(pdfOptions);
        this.settings = this.settingsStore.value;
    }

    async resetPdfOptions() {
        await this.settingsStore.resetPdfOptions();
        this.settings = this.settingsStore.value;
    }

    async setOutputDirectory(outputDirectory) {
        await this.settingsStore.setOutputDirectory(outputDirectory);
        this.settings = this.settingsStore.value;
    }

    async resetOutputDirectory() {
        await this.settingsStore.resetOutputDirectory();
        this.settings = this.settingsStore.value;
    }

    async saveSettings() {
        await this.settingsStore.save();
        this.settings = this.settingsStore.value;
    }

    refreshLocalizedEntryLabels() {
        if (this.exportCommand) {
            if (typeof this.removeCommand === "function") {
                this.removeCommand(EXPORT_COMMAND_ID);
                this.exportCommand = this.addCommand({
                    id: EXPORT_COMMAND_ID,
                    name: this.uiText.commandName,
                    callback: this.exportReadingView,
                });
            } else {
                this.exportCommand.name = this.uiText.commandName;
            }
        }
        if (this.ribbonIconEl) {
            if (typeof setTooltip === "function") {
                setTooltip(this.ribbonIconEl, this.uiText.ribbonTitle);
            }
            this.ribbonIconEl.setAttribute("aria-label", this.uiText.ribbonTitle);
        }
    }

    async exportActiveReadingView() {
        if (this.exporting) {
            new Notice("A read-view export is already in progress.", NOTICE_DURATION_MS);
            return;
        }

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || view.getMode() !== "preview" || !view.file) {
            new Notice("Open a note in Reading view before exporting.", NOTICE_DURATION_MS);
            return;
        }

        if (!this.exportJob || !this.exportJob.getReadingContainer(view)) {
            new Notice(
                "The active Reading view has not finished rendering yet.",
                NOTICE_DURATION_MS,
            );
            return;
        }

        this.exporting = true;
        try {
            new Notice("Rendering read-view PDF...", NOTICE_DURATION_MS);
            const result = await this.exportJob.run(view, this.settings);
            const imageWarning = result.unembeddedLocalImages > 0
                ? ` ${result.unembeddedLocalImages} local image(s) could not be embedded and were kept as links.`
                : "";
            new Notice(
                `Exported read-view PDF to ${result.outputPath}.${imageWarning}`,
                NOTICE_DURATION_MS,
            );
        } catch (error) {
            console.error("export-readview-pdf: export failed", error);
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Read-view export failed: ${message}`, NOTICE_DURATION_MS);
        } finally {
            this.exporting = false;
        }
    }
}

class PluginModuleLoader {
    constructor(plugin, rootRequire) {
        this.rootRequire = rootRequire;
        this.directory = this.getPluginDirectory(plugin);
        this.cache = new Map();
    }

    require(request, parentDirectory = this.directory) {
        if (!request.startsWith(".") && !path.isAbsolute(request)) {
            return this.rootRequire(request);
        }

        let filename = path.resolve(parentDirectory, request);
        if (!path.extname(filename)) {
            filename += ".js";
        }
        if (this.cache.has(filename)) {
            return this.cache.get(filename).exports;
        }

        const module = { exports: {} };
        this.cache.set(filename, module);
        try {
            const source = fs.readFileSync(filename, "utf8");
            const localRequire = (childRequest) => (
                this.require(childRequest, path.dirname(filename))
            );
            const execute = new Function(
                "require",
                "module",
                "exports",
                `${source}\n//# sourceURL=${encodeURI(filename)}`,
            );
            execute(localRequire, module, module.exports);
            return module.exports;
        } catch (error) {
            this.cache.delete(filename);
            throw error;
        }
    }

    getPluginDirectory(plugin) {
        const adapter = plugin.app && plugin.app.vault && plugin.app.vault.adapter;
        const pluginDirectory = plugin.manifest && plugin.manifest.dir;
        if (!adapter || !pluginDirectory) {
            throw new Error("Could not resolve the plugin directory");
        }
        if (typeof adapter.getFullPath === "function") {
            return adapter.getFullPath(pluginDirectory);
        }
        if (typeof adapter.getBasePath === "function") {
            return path.join(adapter.getBasePath(), pluginDirectory);
        }
        throw new Error("The vault adapter does not expose a filesystem path");
    }

    dispose() {
        this.cache.clear();
    }
}

module.exports = ExportReadViewPdfPlugin;
