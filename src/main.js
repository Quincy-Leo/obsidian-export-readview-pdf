/*
 * Copyright (c) 2026 QuincyLeo (Quincy-Leo)
 * SPDX-License-Identifier: MIT
 */

"use strict";

const {
    MarkdownView,
    Notice,
    Plugin,
    setTooltip,
} = require("obsidian");
const {
    ExportReadViewPdfSettingTab,
    ExportReadViewPdfSettings,
} = require("./settings");
const { ExportReadViewPdfJob } = require("./export");

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
        this.exportJob = null;
        this.exportCommand = null;
        this.ribbonIconEl = null;
        this.exportReadingView = () => {
            void this.exportActiveReadingView();
        };
    }

    async onload() {
        this.settingsStore = new ExportReadViewPdfSettings(this, () => {
            this.settings = this.settingsStore.value;
            this.refreshLocalizedEntryLabels();
        });
        await this.loadSettings();
        this.exportJob = new ExportReadViewPdfJob(this.app, PLUGIN_VERSION);

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
        this.addSettingTab(new ExportReadViewPdfSettingTab(this.app, this.settingsStore));
    }

    onunload() {
        if (this.exportJob) {
            this.exportJob.dispose();
            this.exportJob = null;
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

module.exports = ExportReadViewPdfPlugin;
