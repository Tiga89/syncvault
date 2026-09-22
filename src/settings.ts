/**
 * SyncVault 设置界面（中英双语）
 *
 * 说明：getSettingDefinitions() 当前返回空数组。Obsidian 1.13+ 一旦返回
 * 带 control 的定义，就会用声明式渲染接管整个设置页（替代本文件手写 UI），
 * 这会改动现有布局与自定义组件（Modal、日志区、指纹展示等）。为保持
 * 现有功能稳定，暂不迁移，仅保留空的搜索占位。
 */
import {
    App,
    Modal,
    Notice,
    PluginSettingTab,
    Setting,
    TextComponent,
    type SettingDefinition,
} from "obsidian";
import { exportRecovery, importRecovery } from "./recovery";
import { generateStrongPassphrase } from "./crypto";
import { t, type Lang } from "./i18n";
import { errMsg } from "./utils";
import type LivesyncZhPlugin from "./main";

export class LivesyncSettingTab extends PluginSettingTab {
    private statusEl: HTMLElement | null = null;
    private logEl: HTMLTextAreaElement | null = null;
    private passInput: TextComponent | null = null;
    private fingerprintEl: HTMLElement | null = null;
    private visible = false;

    /** 声明式设置定义（Obsidian 1.13+ 设置搜索用） */
    getSettingDefinitions(): SettingDefinition[] {
        return [];
    }

    private lang(): Lang {
        return this.plugin.settings.uiLang === "en" ? "en" : "zh";
    }

    private tt(key: Parameters<typeof t>[1], vars?: Record<string, string | number>): string {
        return t(this.lang(), key, vars);
    }

    constructor(app: App, private plugin: LivesyncZhPlugin) {
        super(app, plugin);
    }

    override display(): void {
        this.visible = true;
        const { containerEl } = this;
        containerEl.empty();

        this.renderQuickStart(containerEl);
        this.renderEncryption(containerEl);
        this.renderSyncSettings(containerEl);
        this.renderConflict(containerEl);
        this.renderMobile(containerEl);
        this.renderSelective(containerEl);
        this.renderLanguage(containerEl);
        this.renderSecurity(containerEl);
        this.renderMaintenance(containerEl);
        this.renderLog(containerEl);
    }

    override hide(): void {
        this.visible = false;
    }

    /** 由插件状态回调调用（仅当设置页可见时刷新） */
    refreshStatus(): void {
        if (!this.visible) return;
        this.renderStatus(this.statusEl);
        this.renderFingerprint();
    }

    // ─────────────────────────── 服务器设置 ───────────────────────────

    private renderQuickStart(parent: HTMLElement): void {
        new Setting(parent).setName(this.tt("sec_server")).setHeading();
        new Setting(parent).setName("SyncVault").setDesc(this.tt("sec_quickstart_desc"));

        new Setting(parent)
            .setName(this.tt("server_url"))
            .setDesc(this.tt("server_url_desc"))
            .addText((text) =>
                text
                    .setPlaceholder("http://192.168.1.10:5984")
                    .setValue(this.plugin.settings.serverUrl)
                    .onChange(async (v) => {
                        this.plugin.settings.serverUrl = v.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(parent)
            .setName(this.tt("username"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.username)
                    .onChange(async (v) => {
                        this.plugin.settings.username = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(parent)
            .setName(this.tt("password"))
            .addText((text) => {
                text.inputEl.type = "password";
                return text.setValue(this.plugin.settings.password).onChange(async (v) => {
                    this.plugin.settings.password = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(parent)
            .setName(this.tt("db_name"))
            .setDesc(this.tt("db_name_desc"))
            .addText((text) =>
                text
                    .setPlaceholder("obsidian-vault")
                    .setValue(this.plugin.settings.dbName)
                    .onChange(async (v) => {
                        this.plugin.settings.dbName = v.trim().replace(/[^a-z0-9_$()+-]/gi, "-");
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(parent).setName(this.tt("conn_status")).setDesc(this.tt("conn_status_desc")).addButton((btn) => {
            btn.setButtonText(this.tt("test_conn")).setCta().onClick(async () => {
                btn.setDisabled(true);
                btn.setButtonText(this.tt("testing"));
                const r = await this.plugin.engine.testConnection();
                btn.setDisabled(false);
                btn.setButtonText(this.tt("test_conn"));
                new Notice(r.msg, 5000);
                this.plugin.addLog(r.msg);
            });
        });

        this.statusEl = parent.createDiv({ cls: "ls-zh-settings-section" });
        this.renderStatus(this.statusEl);

        new Setting(parent)
            .addButton((btn) => {
                btn.setButtonText(this.tt("start_sync")).setCta().onClick(() => {
                    void this.plugin.engine.start();
                });
            })
            .addButton((btn) => {
                btn.setButtonText(this.tt("stop_sync")).onClick(() => {
                    void this.plugin.engine.stop();
                });
            });
    }

    private renderStatus(el: HTMLElement | null): void {
        if (!el) return;
        el.empty();
        const st = this.plugin.engine.getStatus();
        const cnt = this.plugin.engine.getCounters();
        const labels: Record<string, string> = {
            stopped: this.tt("st_stopped"),
            connecting: this.tt("st_connecting"),
            idle: this.tt("st_idle"),
            syncing: this.tt("st_syncing"),
            error: this.tt("st_error"),
        };
        const line = `${labels[st] ?? st} ↑${cnt.up} ↓${cnt.down}`;
        el.createEl("small", { text: cnt.lastError ? `${line}（${cnt.lastError}）` : line });
    }

    // ─────────────────────────── 端到端加密 ───────────────────────────

    private renderEncryption(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_encrypt")).setHeading();

        new Setting(section)
            .setName(this.tt("encrypt_toggle"))
            .setDesc(this.tt("encrypt_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.encrypt).onChange(async (v) => {
                    this.plugin.settings.encrypt = v;
                    if (!v) this.plugin.settings.keyFingerprint = "";
                    await this.plugin.saveSettings();
                    this.renderFingerprint();
                })
            );

        const passSetting = new Setting(section)
            .setName(this.tt("passphrase"))
            .setDesc(this.tt("passphrase_desc"))
            .addText((text) => {
                text.inputEl.type = "password";
                this.passInput = text;
                return text.setValue(this.plugin.settings.passphrase).onChange(async (v) => {
                    this.plugin.settings.passphrase = v;
                    this.plugin.settings.keyFingerprint = "";
                    await this.plugin.saveSettings();
                    this.renderFingerprint();
                });
            });
        passSetting.addButton((btn) =>
            btn.setButtonText(this.tt("gen_password")).onClick(async () => {
                const p = generateStrongPassphrase();
                this.plugin.settings.passphrase = p;
                this.plugin.settings.keyFingerprint = "";
                if (this.passInput) this.passInput.setValue(p);
                await this.plugin.saveSettings();
                new Notice(this.tt("gen_password_done"), 6000);
                this.renderFingerprint();
            })
        );
        passSetting.addButton((btn) => {
            let hidden = true;
            btn.setButtonText(this.tt("show")).onClick(() => {
                hidden = !hidden;
                btn.setButtonText(hidden ? this.tt("show") : this.tt("hide"));
                if (this.passInput) this.passInput.inputEl.type = hidden ? "password" : "text";
            });
        });

        this.fingerprintEl = section.createDiv({ cls: "ls-zh-settings-section" });
        this.renderFingerprint();
    }

    private renderFingerprint(): void {
        if (!this.fingerprintEl) return;
        this.fingerprintEl.empty();
        const s = this.plugin.settings;
        if (!s.encrypt) {
            this.fingerprintEl.createEl("small", {
                text: this.tt("fp_not_encrypted"),
            });
            return;
        }
        if (!s.passphrase) {
            this.fingerprintEl.createEl("small", { text: this.tt("fp_no_pass") });
            return;
        }
        const fp = s.keyFingerprint || this.tt("fp_pending");
        this.fingerprintEl.createEl("small", { text: this.tt("fp_fingerprint", { fp }) });
    }

    // ─────────────────────────── 同步设置 ───────────────────────────

    private renderSyncSettings(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_sync")).setHeading();

        new Setting(section)
            .setName(this.tt("live_sync"))
            .setDesc(this.tt("live_sync_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.liveSync).onChange(async (v) => {
                    this.plugin.settings.liveSync = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName(this.tt("sync_on_save"))
            .setDesc(this.tt("sync_on_save_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.syncOnSave).onChange(async (v) => {
                    this.plugin.settings.syncOnSave = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName(this.tt("auto_start"))
            .setDesc(this.tt("auto_start_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.autoStart).onChange(async (v) => {
                    this.plugin.settings.autoStart = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName(this.tt("periodic"))
            .setDesc(this.tt("periodic_desc"))
            .addText((text) => {
                text.inputEl.type = "number";
                return text.setValue(String(this.plugin.settings.periodicMinutes)).onChange(async (v) => {
                    const n = parseInt(v, 10);
                    this.plugin.settings.periodicMinutes = isNaN(n) || n < 0 ? 0 : n;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(section)
            .setName(this.tt("startup_scan"))
            .setDesc(this.tt("startup_scan_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.startupScan).onChange(async (v) => {
                    this.plugin.settings.startupScan = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName(this.tt("max_size"))
            .setDesc(this.tt("max_size_desc"))
            .addText((text) => {
                text.inputEl.type = "number";
                return text.setValue(String(this.plugin.settings.maxSizeMB)).onChange(async (v) => {
                    const n = parseFloat(v);
                    this.plugin.settings.maxSizeMB = isNaN(n) || n <= 0 ? 0 : n;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(section)
            .setName(this.tt("ignore_regex"))
            .setDesc(this.tt("ignore_regex_desc"))
            .addText((text) =>
                text
                    .setPlaceholder("^附件/|^tmp/")
                    .setValue(this.plugin.settings.ignoreRegEx)
                    .onChange(async (v) => {
                        this.plugin.settings.ignoreRegEx = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(section)
            .setName(this.tt("sync_config_dir", { cfg: this.app.vault.configDir }))
            .setDesc(this.tt("sync_config_dir_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.syncHidden).onChange(async (v) => {
                    this.plugin.settings.syncHidden = v;
                    await this.plugin.saveSettings();
                })
            );
    }

    // ─────────────────────────── 冲突处理 ───────────────────────────

    private renderConflict(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_conflict")).setHeading();

        new Setting(section)
            .setName(this.tt("auto_merge"))
            .setDesc(this.tt("auto_merge_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.autoMerge).onChange(async (v) => {
                    this.plugin.settings.autoMerge = v;
                    await this.plugin.saveSettings();
                })
            );
    }

    // ─────────────────────────── 移动端 ───────────────────────────

    private renderMobile(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_mobile")).setHeading();

        new Setting(section)
            .setName(this.tt("pull_on_start"))
            .setDesc(this.tt("pull_on_start_desc"))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.pullOnStart).onChange(async (v) => {
                    this.plugin.settings.pullOnStart = v;
                    await this.plugin.saveSettings();
                })
            );
    }

    // ─────────────────────────── 选择性同步 ───────────────────────────

    private renderSelective(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_selective")).setHeading();

        new Setting(section)
            .setName(this.tt("exclude_folders"))
            .setDesc(this.tt("exclude_folders_desc"))
            .addTextArea((ta) =>
                ta
                    .setPlaceholder("附件/\n备份/")
                    .setValue(this.plugin.settings.excludeFolders)
                    .onChange(async (v) => {
                        this.plugin.settings.excludeFolders = v;
                        await this.plugin.saveSettings();
                    })
            );
    }

    // ─────────────────────────── 界面语言 ───────────────────────────

    private renderLanguage(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_lang")).setHeading();

        new Setting(section)
            .setName(this.tt("ui_lang"))
            .setDesc(this.tt("ui_lang_desc"))
            .addDropdown((dd) =>
                dd
                    .addOption("zh", this.tt("lang_zh"))
                    .addOption("en", this.tt("lang_en"))
                    .setValue(this.plugin.settings.uiLang)
                    .onChange(async (v) => {
                        this.plugin.settings.uiLang = v === "en" ? "en" : "zh";
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );
    }

    // ─────────────────────────── 数据安全（恢复密钥） ───────────────────────────

    private renderSecurity(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_security")).setHeading();

        new Setting(section)
            .setName(this.tt("export_recovery"))
            .setDesc(this.tt("export_recovery_desc"))
            .addButton((btn) =>
                btn.setButtonText(this.tt("do_export_recovery")).setCta().onClick(() => {
                    void this.showExportRecovery();
                })
            )
            .addButton((btn) =>
                btn.setButtonText(this.tt("do_import_recovery")).onClick(() => {
                    void this.showImportRecovery();
                })
            );
    }

    /** 导出恢复密钥：输入恢复密码 → 生成恢复文件 → 复制剪贴板 */
    private async showExportRecovery(): Promise<void> {
        const modal = new Modal(this.app);
        modal.titleEl.setText(this.tt("export_recovery"));
        let recoveryPassword = "";
        const s = this.plugin.settings;
        if (!s.passphrase) {
            modal.contentEl.createEl("p", {
                text: this.tt("fp_no_pass"),
            });
            new Setting(modal.contentEl).addButton((b) => {
                b.setButtonText(this.tt("cancel")).setDestructive().onClick(() => modal.close());
            });
            modal.open();
            return;
        }
        modal.contentEl.createEl("p", { text: this.tt("recovery_password_desc") });
        new Setting(modal.contentEl)
            .setName(this.tt("recovery_password"))
            .addText((text) => {
                text.inputEl.type = "password";
                return text.onChange((v) => {
                    recoveryPassword = v;
                });
            });
        const output = modal.contentEl.createEl("textarea", {
            cls: "ls-zh-log-area",
            attr: { rows: "6", readonly: "readonly", spellcheck: "false" },
        });
        output.hide();
        new Setting(modal.contentEl)
            .addButton((b) =>
                b
                    .setButtonText(this.tt("do_export_recovery"))
                    .setCta()
                    .onClick(async () => {
                        if (!recoveryPassword) {
                            new Notice(this.tt("recovery_password_required"), 5000);
                            return;
                        }
                        try {
                            const fileText = await exportRecovery(s.passphrase, recoveryPassword, s.dbName);
                            output.value = fileText;
                            output.show();
                            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                                await navigator.clipboard.writeText(fileText);
                            }
                            new Notice(this.tt("recovery_exported"), 8000);
                        } catch (e) {
                            new Notice(this.tt("diag_failed") + errMsg(e), 6000);
                        }
                    })
            )
            .addButton((b) => {
                b.setButtonText(this.tt("cancel")).setDestructive().onClick(() => modal.close());
            });
        modal.open();
    }

    /** 导入恢复密钥：输入恢复密码 + 恢复文件 → 还原主加密密码 */
    private async showImportRecovery(): Promise<void> {
        const modal = new Modal(this.app);
        modal.titleEl.setText(this.tt("do_import_recovery"));
        let recoveryPassword = "";
        let fileContent = "";
        modal.contentEl.createEl("p", { text: this.tt("recovery_password_desc") });
        new Setting(modal.contentEl)
            .setName(this.tt("recovery_password"))
            .addText((text) => {
                text.inputEl.type = "password";
                return text.onChange((v) => {
                    recoveryPassword = v;
                });
            });
        new Setting(modal.contentEl)
            .setName(this.tt("recovery_file"))
            .setDesc(this.tt("recovery_file_desc"))
            .addTextArea((ta) =>
                ta.setPlaceholder('{"v":1,...}').onChange((v) => {
                    fileContent = v;
                })
            );
        new Setting(modal.contentEl)
            .addButton((b) =>
                b
                    .setButtonText(this.tt("do_import_recovery"))
                    .setCta()
                    .onClick(async () => {
                        try {
                            const result = await importRecovery(fileContent, recoveryPassword);
                            this.plugin.settings.passphrase = result.passphrase;
                            this.plugin.settings.dbName = result.dbName;
                            this.plugin.settings.keyFingerprint = result.fingerprint;
                            if (this.passInput) this.passInput.setValue(result.passphrase);
                            await this.plugin.saveSettings();
                            this.renderFingerprint();
                            modal.close();
                            new Notice(this.tt("recovery_import_ok"), 6000);
                        } catch (e) {
                            new Notice(this.tt("recovery_import_fail") + "（" + errMsg(e) + "）", 6000);
                        }
                    })
            )
            .addButton((b) => {
                b.setButtonText(this.tt("cancel")).setDestructive().onClick(() => modal.close());
            });
        modal.open();
    }

    // ─────────────────────────── 维护与日志 ───────────────────────────

    private renderMaintenance(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_maint")).setHeading();

        new Setting(section)
            .setName(this.tt("sync_now"))
            .setDesc(this.tt("sync_now_desc"))
            .addButton((btn) =>
                btn.setButtonText(this.tt("sync_now")).setCta().onClick(() => {
                    void this.plugin.engine.syncNow();
                })
            );

        new Setting(section)
            .setName(this.tt("full_upload"))
            .setDesc(this.tt("full_upload_desc"))
            .addButton((btn) =>
                btn.setButtonText(this.tt("full_upload")).onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText(this.tt("uploading"));
                    await this.plugin.engine.pushAll();
                    btn.setDisabled(false);
                    btn.setButtonText(this.tt("full_upload"));
                    this.refreshStatus();
                })
            );

        new Setting(section)
            .setName(this.tt("full_download"))
            .setDesc(this.tt("full_download_desc"))
            .addButton((btn) =>
                btn.setButtonText(this.tt("full_download")).onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText(this.tt("downloading"));
                    await this.plugin.engine.pullAll();
                    btn.setDisabled(false);
                    btn.setButtonText(this.tt("full_download"));
                    this.refreshStatus();
                })
            );

        new Setting(section)
            .setName(this.tt("reset_db"))
            .setDesc(this.tt("reset_db_desc"))
            .addButton((btn) =>
                btn.setButtonText(this.tt("reset_db")).onClick(() => {
                    const modal = new Modal(this.app);
                    modal.titleEl.setText(this.tt("reset_confirm_title"));
                    modal.contentEl.createEl("p", {
                        text: this.tt("reset_confirm_body"),
                    });
                    new Setting(modal.contentEl)
                        .addButton((b) => {
                            b.setButtonText(this.tt("cancel")).setDestructive().onClick(() => modal.close());
                        })
                        .addButton((b) => {
                            b.setButtonText(this.tt("confirm_reset")).setCta().onClick(async () => {
                                await this.plugin.engine.resetLocal();
                                modal.close();
                                this.refreshStatus();
                            });
                        });
                    modal.open();
                })
            );
    }

    private renderLog(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName(this.tt("sec_log")).setHeading();
        this.logEl = section.createEl("textarea", {
            cls: "ls-zh-log-area",
            attr: { readonly: "readonly", spellcheck: "false" },
        });
        this.updateLogArea();
        new Setting(section).addButton((btn) =>
            btn.setButtonText(this.tt("clear_log")).onClick(async () => {
                this.plugin.settings.log = [];
                await this.plugin.saveSettings();
                this.updateLogArea();
            })
        );
    }

    updateLogArea(): void {
        if (this.logEl) {
            this.logEl.value = this.plugin.settings.log.slice(-100).join("\n");
            this.logEl.scrollTop = this.logEl.scrollHeight;
        }
    }
}
