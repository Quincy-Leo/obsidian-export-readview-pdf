/*
 * Copyright (c) 2026 QuincyLeo (Gilgamesh-lzq)
 * SPDX-License-Identifier: MIT
 */

"use strict";

const { PluginSettingTab, Setting } = require("obsidian");

const LANGUAGE_OPTIONS = [
    {
        value: "zh-CN",
        label: "中文",
        commandName: "将当前阅读视图导出为PDF",
        ribbonTitle: "将当前阅读视图导出为PDF",
        settingsText: {
            languageName: "Language / 语言",
            languageDesc: "插件显示的界面语言",
            outputSection: "输出",
            outputDirectoryName: "输出路径",
            outputDirectoryDesc: "PDF 保存目录；支持系统绝对路径，留空则使用仓库根目录",
            outputDirectoryPlaceholder: "仓库根目录",
            outputDirectoryReset: "重置",
            pdfSection: "PDF 导出",
            landscapeName: "横向页面",
            landscapeDesc: "使用横向页面方向",
            displayHeaderFooterName: "显示页眉页脚",
            displayHeaderFooterDesc: "在 PDF 中显示自定义页眉和页脚",
            printBackgroundName: "打印背景",
            printBackgroundDesc: "在 PDF 中保留背景颜色和背景图片",
            scaleName: "缩放比例",
            scaleDesc: "设置页面内容的缩放比例（0.1–2.0）",
            pageSizeName: "页面尺寸",
            pageSizeDesc: "设置 PDF 使用的纸张尺寸",
            marginTopName: "上边距",
            marginBottomName: "下边距",
            marginLeftName: "左边距",
            marginRightName: "右边距",
            marginDesc: "页面边距，单位为英寸",
            preferCssPageSizeName: "优先使用 CSS 页面尺寸",
            preferCssPageSizeDesc: "优先采用 CSS @page 定义的尺寸，而不是上面的页面尺寸",
            resetName: "重置 PDF 设置",
            resetDesc: "将所有 PDF 导出选项恢复为默认值",
            resetButton: "重置",
        },
    },
    {
        value: "en",
        label: "English",
        commandName: "Export Read-view PDF",
        ribbonTitle: "Export current reading view as PDF",
        settingsText: {
            languageName: "Language",
            languageDesc: "Interface language for plugin.",
            outputSection: "Output",
            outputDirectoryName: "Output path",
            outputDirectoryDesc: "PDF directory; system paths are allowed. Leave empty for the vault root.",
            outputDirectoryPlaceholder: "Vault root",
            outputDirectoryReset: "Reset",
            pdfSection: "PDF export",
            landscapeName: "Landscape",
            landscapeDesc: "Use landscape page orientation.",
            displayHeaderFooterName: "Display headers and footers",
            displayHeaderFooterDesc: "Display custom headers and footers in the PDF.",
            printBackgroundName: "Print background",
            printBackgroundDesc: "Preserve background colors and images in the PDF.",
            scaleName: "Scale",
            scaleDesc: "Set the page content scale (0.1–2.0).",
            pageSizeName: "Page size",
            pageSizeDesc: "Set the paper size used by the PDF.",
            marginTopName: "Top margin",
            marginBottomName: "Bottom margin",
            marginLeftName: "Left margin",
            marginRightName: "Right margin",
            marginDesc: "Page margin in inches.",
            preferCssPageSizeName: "Prefer CSS page size",
            preferCssPageSizeDesc: "Prefer the size defined by CSS @page over the paper size above.",
            resetName: "Reset PDF settings",
            resetDesc: "Restore every PDF export option to its default value.",
            resetButton: "Reset",
        },
    },
];

const PDF_PAGE_SIZES = ["A3", "A4", "A5", "Legal", "Letter", "Tabloid"];
const PDF_MARGIN_MINIMUM = 0.1;
const PDF_MARGIN_MAXIMUM = 2;
const PDF_MARGIN_STEP = 0.1;

const DEFAULT_PDF_OPTIONS = {
    landscape: false,
    displayHeaderFooter: false,
    printBackground: true,
    scale: 1,
    pageSize: "A4",
    margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    preferCSSPageSize: false,
    generateTaggedPDF: true,
    generateDocumentOutline: true,
};

class PdfOptions {
    static normalize(value) {
        const options = value && typeof value === "object" ? value : {};
        const margins = options.margins && typeof options.margins === "object"
            ? options.margins
            : {};
        return {
            landscape: this.booleanOrDefault(options.landscape, DEFAULT_PDF_OPTIONS.landscape),
            displayHeaderFooter: this.booleanOrDefault(
                options.displayHeaderFooter,
                DEFAULT_PDF_OPTIONS.displayHeaderFooter,
            ),
            printBackground: this.booleanOrDefault(
                options.printBackground,
                DEFAULT_PDF_OPTIONS.printBackground,
            ),
            scale: this.numberOrDefault(options.scale, DEFAULT_PDF_OPTIONS.scale, 0.1, 2),
            pageSize: PDF_PAGE_SIZES.includes(options.pageSize)
                ? options.pageSize
                : DEFAULT_PDF_OPTIONS.pageSize,
            margins: {
                top: this.numberOrDefault(margins.top, DEFAULT_PDF_OPTIONS.margins.top),
                bottom: this.numberOrDefault(margins.bottom, DEFAULT_PDF_OPTIONS.margins.bottom),
                left: this.numberOrDefault(margins.left, DEFAULT_PDF_OPTIONS.margins.left),
                right: this.numberOrDefault(margins.right, DEFAULT_PDF_OPTIONS.margins.right),
            },
            preferCSSPageSize: this.booleanOrDefault(
                options.preferCSSPageSize,
                DEFAULT_PDF_OPTIONS.preferCSSPageSize,
            ),
            generateTaggedPDF: this.booleanOrDefault(
                options.generateTaggedPDF,
                DEFAULT_PDF_OPTIONS.generateTaggedPDF,
            ),
            generateDocumentOutline: this.booleanOrDefault(
                options.generateDocumentOutline,
                DEFAULT_PDF_OPTIONS.generateDocumentOutline,
            ),
        };
    }

    static clone(value) {
        return this.normalize(value);
    }

    static booleanOrDefault(value, defaultValue) {
        return typeof value === "boolean" ? value : defaultValue;
    }

    static numberOrDefault(value, defaultValue, minimum = -Infinity, maximum = Infinity) {
        return typeof value === "number"
            && Number.isFinite(value)
            && value >= minimum
            && value <= maximum
            ? value
            : defaultValue;
    }
}

class ExportReadViewPdfSettings {
    constructor(plugin, onLanguageChanged) {
        this.plugin = plugin;
        this.onLanguageChanged = onLanguageChanged || (() => {});
        this.value = null;
    }

    get uiText() {
        const language = this.value && this.value.language;
        return LANGUAGE_OPTIONS.find((option) => option.value === language)
            || LANGUAGE_OPTIONS[0];
    }

    async load() {
        const savedData = await this.plugin.loadData();
        const saved = savedData && typeof savedData === "object" ? savedData : {};
        const language = LANGUAGE_OPTIONS.some((option) => option.value === saved.language)
            ? saved.language
            : LANGUAGE_OPTIONS[0].value;
        this.value = {
            language,
            outputDirectory: typeof saved.outputDirectory === "string"
                ? saved.outputDirectory.trim()
                : "",
            pdfOptions: PdfOptions.normalize(saved.pdfOptions),
        };
        return this.value;
    }

    async setLanguage(language) {
        if (!LANGUAGE_OPTIONS.some((option) => option.value === language)) return;
        this.value.language = language;
        await this.save();
        this.onLanguageChanged();
    }

    async setPdfOptions(pdfOptions) {
        this.value.pdfOptions = PdfOptions.normalize(pdfOptions);
        await this.save();
    }

    async resetPdfOptions() {
        await this.setPdfOptions(DEFAULT_PDF_OPTIONS);
    }

    async setOutputDirectory(outputDirectory) {
        this.value.outputDirectory = String(outputDirectory || "").trim();
        await this.save();
    }

    async resetOutputDirectory() {
        await this.setOutputDirectory("");
    }

    async save() {
        try {
            await this.plugin.saveData(this.value);
        } catch (saveError) {
            try {
                await this.load();
                this.onLanguageChanged();
            } catch (loadError) {
                console.error(
                    "export-readview-pdf: failed to reload settings after save failure",
                    loadError,
                );
            }
            throw saveError;
        }
    }
}

class ExportReadViewPdfSettingTab extends PluginSettingTab {
    constructor(app, settings) {
        super(app, settings.plugin);
        this.settings = settings;
    }

    display() {
        this.containerEl.empty();
        const text = this.settings.uiText.settingsText;
        const value = this.settings.value;

        new Setting(this.containerEl)
            .setName(text.languageName)
            .setDesc(text.languageDesc)
            .addDropdown((dropdown) => {
                for (const option of LANGUAGE_OPTIONS) dropdown.addOption(option.value, option.label);
                dropdown.setValue(value.language).onChange(async (language) => {
                    try {
                        await this.settings.setLanguage(language);
                    } finally {
                        this.display();
                    }
                });
            });

        this.containerEl.createEl("h2", { text: text.outputSection });
        new Setting(this.containerEl)
            .setName(text.outputDirectoryName)
            .setDesc(text.outputDirectoryDesc)
            .addText((input) => {
                input.setPlaceholder(text.outputDirectoryPlaceholder)
                    .setValue(value.outputDirectory)
                    .onChange(async (directory) => this.settings.setOutputDirectory(directory));
            })
            .addButton((button) => {
                button.setButtonText(text.outputDirectoryReset).onClick(async () => {
                    button.setDisabled(true);
                    try { await this.settings.resetOutputDirectory(); } finally { this.display(); }
                });
            });

        this.containerEl.createEl("h2", { text: text.pdfSection });
        this.addToggle("landscape", text.landscapeName, text.landscapeDesc);
        this.addToggle("displayHeaderFooter", text.displayHeaderFooterName, text.displayHeaderFooterDesc);
        this.addToggle("printBackground", text.printBackgroundName, text.printBackgroundDesc);

        const scaleSetting = new Setting(this.containerEl)
            .setName(text.scaleName)
            .setDesc(text.scaleDesc);
        scaleSetting.addSlider((slider) => {
            slider.setLimits(0.1, 2, 0.1).setValue(value.pdfOptions.scale);
            if (typeof slider.setDynamicTooltip === "function") slider.setDynamicTooltip();
            const updateValue = this.addVisibleSliderValue(
                scaleSetting,
                slider,
                value.pdfOptions.scale,
                (scale) => `${scale.toFixed(1)}x`,
            );
            slider.onChange(async (scale) => {
                updateValue(scale);
                await this.updatePdfOption("scale", scale);
            });
        });

        new Setting(this.containerEl).setName(text.pageSizeName).setDesc(text.pageSizeDesc)
            .addDropdown((dropdown) => {
                for (const size of PDF_PAGE_SIZES) dropdown.addOption(size, size);
                dropdown.setValue(value.pdfOptions.pageSize)
                    .onChange(async (size) => this.updatePdfOption("pageSize", size));
            });

        this.addMargin("top", text.marginTopName, text.marginDesc);
        this.addMargin("bottom", text.marginBottomName, text.marginDesc);
        this.addMargin("left", text.marginLeftName, text.marginDesc);
        this.addMargin("right", text.marginRightName, text.marginDesc);
        this.addToggle("preferCSSPageSize", text.preferCssPageSizeName, text.preferCssPageSizeDesc);

        new Setting(this.containerEl).setName(text.resetName).setDesc(text.resetDesc)
            .addButton((button) => {
                button.setButtonText(text.resetButton).onClick(async () => {
                    button.setDisabled(true);
                    try { await this.settings.resetPdfOptions(); } finally { this.display(); }
                });
            });
    }

    addToggle(name, label, description) {
        new Setting(this.containerEl).setName(label).setDesc(description).addToggle((toggle) => {
            toggle.setValue(this.settings.value.pdfOptions[name])
                .onChange(async (enabled) => this.updatePdfOption(name, enabled));
        });
    }

    addMargin(side, label, description) {
        const marginSetting = new Setting(this.containerEl).setName(label).setDesc(description);
        marginSetting.addSlider((slider) => {
            slider.setLimits(PDF_MARGIN_MINIMUM, PDF_MARGIN_MAXIMUM, PDF_MARGIN_STEP)
                .setValue(this.settings.value.pdfOptions.margins[side]);
            if (typeof slider.setDynamicTooltip === "function") slider.setDynamicTooltip();
            const updateValue = this.addVisibleSliderValue(
                marginSetting,
                slider,
                this.settings.value.pdfOptions.margins[side],
                (margin) => `${margin.toFixed(1)}`,
            );
            slider.onChange(async (margin) => {
                updateValue(margin);
                const options = PdfOptions.normalize(this.settings.value.pdfOptions);
                options.margins[side] = margin;
                await this.settings.setPdfOptions(options);
            });
        });
    }

    addVisibleSliderValue(setting, slider, initialValue, formatter) {
        const valueEl = setting.controlEl.createEl("output", {
            cls: "export-readview-pdf-slider-value",
        });
        slider.sliderEl.before(valueEl);
        valueEl.style.display = "inline-block";
        valueEl.style.fontVariantNumeric = "tabular-nums";
        valueEl.style.minWidth = "4.5em";
        valueEl.style.textAlign = "right";
        valueEl.style.whiteSpace = "nowrap";

        const update = (value) => {
            const formatted = formatter(value);
            valueEl.value = formatted;
            valueEl.setText(formatted);
            slider.sliderEl.setAttribute("aria-valuetext", formatted);
        };
        update(initialValue);
        return update;
    }

    async updatePdfOption(name, value) {
        const options = PdfOptions.normalize(this.settings.value.pdfOptions);
        options[name] = value;
        await this.settings.setPdfOptions(options);
    }
}

module.exports = {
    DEFAULT_PDF_OPTIONS,
    ExportReadViewPdfSettingTab,
    LANGUAGE_OPTIONS,
    PdfOptions,
    PdfOptionsUtils: PdfOptions,
    ExportReadViewPdfSettings,
    PluginSettings: ExportReadViewPdfSettings,
};
