/**
 * 中文设置界面
 */
import { App, Modal, Notice, PluginSettingTab, Setting, TextComponent, type SettingDefinition } from "obsidian";
import { generateStrongPassphrase } from "./crypto";
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

    // ─────────────────────────── 快速开始 ───────────────────────────

    private renderQuickStart(parent: HTMLElement): void {
        new Setting(parent).setName("① 服务器设置").setHeading();
        new Setting(parent).setName("快速开始").setDesc(
            "三步完成配置：① 填写服务器地址与账号 → ② 填写数据库名并「测试连接」→ ③ 打开端到端加密、设置密码 → 点击「启动同步」。所有设备使用相同配置即可互相同步。"
        );

        new Setting(parent)
            .setName("服务器地址")
            .setDesc("CouchDB 服务地址，例如 http://192.168.1.10:5984 或 https://sync.example.com。生产环境建议使用 HTTPS 加密传输。")
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
            .setName("用户名")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.username)
                    .onChange(async (v) => {
                        this.plugin.settings.username = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(parent)
            .setName("密码")
            .addText((text) => {
                text.inputEl.type = "password";
                return text.setValue(this.plugin.settings.password).onChange(async (v) => {
                    this.plugin.settings.password = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(parent)
            .setName("数据库名")
            .setDesc("CouchDB 中用于存储笔记的数据库。所有设备必须一致。若不存在，插件会在测试连接时尝试自动创建。")
            .addText((text) =>
                text
                    .setPlaceholder("obsidian-vault")
                    .setValue(this.plugin.settings.dbName)
                    .onChange(async (v) => {
                        this.plugin.settings.dbName = v.trim().replace(/[^a-z0-9_$()+-]/gi, "-");
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(parent).setName("连接状态").setDesc("查看服务器连接与同步状态。").addButton((btn) => {
            btn.setButtonText("测试连接").setCta().onClick(async () => {
                btn.setDisabled(true);
                btn.setButtonText("测试中…");
                const r = await this.plugin.engine.testConnection();
                btn.setDisabled(false);
                btn.setButtonText("测试连接");
                new Notice(r.msg, 5000);
                this.plugin.addLog(r.msg);
            });
        });

        this.statusEl = parent.createDiv({ cls: "ls-zh-settings-section" });
        this.renderStatus(this.statusEl);

        new Setting(parent).addButton((btn) => {
            btn.setButtonText("▶ 启动同步").setCta().onClick(() => {
                void this.plugin.engine.start();
            });
        }).addButton((btn) => {
            btn.setButtonText("⏹ 停止同步").onClick(() => {
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
            stopped: "⏹ 已停止",
            connecting: "🔌 连接中…",
            idle: "💤 同步空闲",
            syncing: "⚡ 同步中…",
            error: "⚠ 出错",
        };
        const cls = st === "error" ? "ls-zh-status-error" : st === "syncing" ? "ls-zh-status-warn" : "ls-zh-status-ok";
        el.createDiv({ cls, text: `${labels[st] ?? st} ↑ 上传 ${cnt.up} ↓ 下载 ${cnt.down}` });
        if (st === "error" && cnt.lastError) {
            el.createDiv({ cls: "ls-zh-status-error", text: `错误：${cnt.lastError}` });
        }
    }

    // ─────────────────────────── 端到端加密 ───────────────────────────

    private renderEncryption(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName("② 端到端加密").setHeading();

        new Setting(section)
            .setName("启用端到端加密")
            .setDesc(
                "开启后，所有笔记内容与文件名会在离开本机前使用 AES-256-GCM 加密（密钥由密码经 PBKDF2 派生）。服务器管理员、机房运维只能看到密文，无法读取你的笔记。"
            )
            .addToggle((t) =>
                t.setValue(this.plugin.settings.encrypt).onChange(async (v) => {
                    this.plugin.settings.encrypt = v;
                    await this.plugin.saveSettings();
                    this.refreshStatus();
                })
            );

        const passSetting = new Setting(section)
            .setName("加密密码")
            .setDesc(
                "用于派生加密密钥，所有设备必须填写相同密码与数据库名。请务必牢记：忘记密码将无法解密任何已同步的数据；密码保存在本机配置文件中，请妥善保管 Vault。"
            );
        passSetting.addText((text) => {
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
            btn.setButtonText("生成随机密码").onClick(async () => {
                const p = generateStrongPassphrase();
                this.plugin.settings.passphrase = p;
                this.plugin.settings.keyFingerprint = "";
                if (this.passInput) this.passInput.setValue(p);
                await this.plugin.saveSettings();
                new Notice("已生成随机密码，请复制并妥善保存（所有设备需一致）", 6000);
                this.renderFingerprint();
            })
        );
        passSetting.addButton((btn) => {
            let hidden = true;
            btn.setButtonText("显示").onClick(() => {
                hidden = !hidden;
                btn.setButtonText(hidden ? "显示" : "隐藏");
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
                text: "🔓 未启用加密：内容将以明文存储在服务器数据库中。",
            });
            return;
        }
        if (!s.passphrase) {
            this.fingerprintEl.createEl("small", { text: "⚠️ 未设置加密密码。" });
            return;
        }
        const fp = s.keyFingerprint || "（尚未生成，启动同步后自动生成）";
        this.fingerprintEl.createEl("small", { text: `🔐 密钥指纹：${fp}　（各设备此值应一致）` });
    }

    // ─────────────────────────── 同步设置 ───────────────────────────

    private renderSyncSettings(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName("③ 同步设置").setHeading();

        new Setting(section)
            .setName("实时同步")
            .setDesc("打开后持续监控变更并双向复制；断线自动重连。关闭后仅按定时任务或手动同步。")
            .addToggle((t) =>
                t.setValue(this.plugin.settings.liveSync).onChange(async (v) => {
                    this.plugin.settings.liveSync = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName("保存后自动同步")
            .setDesc("文件保存（Ctrl+S）后立即触发同步。")
            .addToggle((t) =>
                t.setValue(this.plugin.settings.syncOnSave).onChange(async (v) => {
                    this.plugin.settings.syncOnSave = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName("启动时自动开始同步")
            .setDesc("打开 Obsidian 后自动启动同步。")
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoStart).onChange(async (v) => {
                    this.plugin.settings.autoStart = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName("定时完整同步（分钟）")
            .setDesc("每隔指定时间执行一次完整双向同步，作为实时同步的兜底。0 表示关闭。")
            .addText((text) => {
                text.inputEl.type = "number";
                return text.setValue(String(this.plugin.settings.periodicMinutes)).onChange(async (v) => {
                    const n = parseInt(v, 10);
                    this.plugin.settings.periodicMinutes = isNaN(n) || n < 0 ? 0 : n;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(section)
            .setName("启动时扫描本地库")
            .setDesc("启动同步时检查磁盘文件是否有遗漏变更（安全网，防止插件关闭期间的外部修改漏同步）。")
            .addToggle((t) =>
                t.setValue(this.plugin.settings.startupScan).onChange(async (v) => {
                    this.plugin.settings.startupScan = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(section)
            .setName("最大同步文件大小（MB）")
            .setDesc("超过该大小的文件将被跳过（CouchDB 单文档大小有限制，可同时调大服务器 max_document_size）。")
            .addText((text) => {
                text.inputEl.type = "number";
                return text.setValue(String(this.plugin.settings.maxSizeMB)).onChange(async (v) => {
                    const n = parseFloat(v);
                    this.plugin.settings.maxSizeMB = isNaN(n) || n <= 0 ? 0 : n;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(section)
            .setName("忽略规则（正则）")
            .setDesc("匹配的路径将不同步。作用于完整路径，例如：^附件/ 表示忽略“附件”目录。留空表示全部同步。")
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
            .setName(`同步配置目录（${this.app.vault.configDir}）`)
            .setDesc("同步设置、主题、代码片段等（不包括本插件自身的配置文件）。建议在普通笔记同步稳定后再开启。")
            .addToggle((t) =>
                t.setValue(this.plugin.settings.syncHidden).onChange(async (v) => {
                    this.plugin.settings.syncHidden = v;
                    await this.plugin.saveSettings();
                })
            );
    }

    // ─────────────────────────── 冲突处理 ───────────────────────────

    private renderConflict(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName("④ 冲突处理").setHeading();

        new Setting(section)
            .setName("自动合并 Markdown 冲突")
            .setDesc(
                "当同一篇笔记在两台设备上都被修改时：若一方是另一方的超集则自动合并；否则用冲突标记（<<<<<<< / ======= / >>>>>>>）合并到原文件，双方内容都不丢失。关闭后，远端版本将另存为「（冲突 …）」副本。"
            )
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoMerge).onChange(async (v) => {
                    this.plugin.settings.autoMerge = v;
                    await this.plugin.saveSettings();
                })
            );
    }

    // ─────────────────────────── 维护与日志 ───────────────────────────

    private renderMaintenance(parent: HTMLElement): void {
        const section = parent.createDiv({ cls: "ls-zh-settings-section" });
        new Setting(section).setName("⑤ 维护操作").setHeading();

        new Setting(section)
            .setName("立即同步")
            .setDesc("手动执行一次完整的双向同步。")
            .addButton((btn) =>
                btn.setButtonText("立即同步").setCta().onClick(() => {
                    void this.plugin.engine.syncNow();
                })
            );

        new Setting(section)
            .setName("全量上传")
            .setDesc("把当前 Vault 的所有文件上传到服务器（覆盖远端同路径文件）。适合第一台设备初始化。")
            .addButton((btn) =>
                btn.setButtonText("全量上传").onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText("上传中…");
                    await this.plugin.engine.pushAll();
                    btn.setDisabled(false);
                    btn.setButtonText("全量上传");
                    this.refreshStatus();
                })
            );

        new Setting(section)
            .setName("全量下载")
            .setDesc("从服务器下载全部内容并覆盖本地同路径文件。适合第二台设备初始化。")
            .addButton((btn) =>
                btn.setButtonText("全量下载").onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText("下载中…");
                    await this.plugin.engine.pullAll();
                    btn.setDisabled(false);
                    btn.setButtonText("全量下载");
                    this.refreshStatus();
                })
            );

        new Setting(section)
            .setName("重置本地数据库")
            .setDesc("清空本机的同步数据库与所有远端缓存记录（不影响服务器数据与本地笔记文件）。加密密码或数据库名变更后必须重置。")
            .addButton((btn) =>
                btn.setButtonText("重置本地数据库").onClick(() => {
                    const modal = new Modal(this.app);
                    modal.titleEl.setText("确认重置本地同步数据库？");
                    modal.contentEl.createEl("p", {
                        text: "这将清空本机同步缓存并停止同步。服务器数据与本地笔记文件不会受影响。重置后请重新「启动同步」（建议随后执行全量上传或全量下载）。",
                    });
                    new Setting(modal.contentEl)
                        .addButton((b) => {
                            b.setButtonText("取消").setDestructive().onClick(() => modal.close());
                        })
                        .addButton((b) => {
                            b.setButtonText("确认重置").setCta().onClick(async () => {
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
        new Setting(section).setName("⑥ 同步日志").setHeading();
        this.logEl = section.createEl("textarea", {
            cls: "ls-zh-log-area",
            attr: { readonly: "readonly", spellcheck: "false" },
        });
        this.updateLogArea();
        new Setting(section).addButton((btn) =>
            btn.setButtonText("清空日志").onClick(async () => {
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
