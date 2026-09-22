/**
 * SyncVault 实时同步 —— 插件入口
 *
 * 监听 Vault 事件（create/modify/delete/rename）把变更推入本地 PouchDB，
 * 由同步引擎与远端 CouchDB 做实时双向复制；远端变更自动解密落盘。
 */
import { Modal, Notice, Plugin, Setting, TAbstractFile, TFile } from "obsidian";
import { SyncEngine } from "./syncEngine";
import { LivesyncSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type LiveSyncSettings, type SyncCounters, type SyncStatus } from "./types";
import { t, type Lang } from "./i18n";
import { buildDiagnosticsText } from "./diagnostics";

export default class LivesyncZhPlugin extends Plugin {
    settings: LiveSyncSettings = { ...DEFAULT_SETTINGS };
    engine!: SyncEngine;
    private statusBarEl: HTMLElement | null = null;
    private settingTab: LivesyncSettingTab | null = null;
    private reflectQueue = new Map<string, TFile>();
    private reflectTimer: number | null = null;
    private saveTimer: number | null = null;
    private lastErrorNotice = 0;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.engine = new SyncEngine(
            () => this.settings,
            {
                onStatus: (s: SyncStatus, c: SyncCounters) => this.updateStatusBar(s, c),
                onLog: (msg: string) => this.addLog(msg),
            },
            this.app.vault
        );

        this.settingTab = new LivesyncSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);

        // 状态栏
        this.statusBarEl = this.addStatusBarItem();
        this.updateStatusBar("stopped", this.engine.getCounters());

        // 功能区图标：立即同步
        this.addRibbonIcon("refresh-cw", t(this.settings.uiLang, "ribbon_tooltip"), () => {
            void this.engine.syncNow();
        });

        this.registerCommands();
        this.registerVaultEvents();

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoStart) {
                void this.engine.start().then(() => {
                    if (this.settings.pullOnStart) void this.engine.syncNow();
                });
            }
        });
    }

    onunload(): void {
        if (this.reflectTimer !== null) {
            window.clearTimeout(this.reflectTimer);
            this.reflectTimer = null;
        }
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        void this.engine.stop();
    }

    // ─────────────────────────── 命令 ───────────────────────────

    private lang(): Lang {
        return this.settings.uiLang === "en" ? "en" : "zh";
    }

    private registerCommands(): void {
        this.addCommand({
            id: "start-sync",
            name: t(this.lang(), "cmd_start"),
            callback: () => {
                void this.engine.start();
            },
        });
        this.addCommand({
            id: "stop-sync",
            name: t(this.lang(), "cmd_stop"),
            callback: () => {
                void this.engine.stop();
            },
        });
        this.addCommand({
            id: "sync-now",
            name: t(this.lang(), "cmd_sync_now"),
            callback: () => {
                void this.engine.syncNow();
            },
        });
        this.addCommand({
            id: "push-all",
            name: t(this.lang(), "cmd_push_all"),
            callback: () => {
                void this.engine.pushAll();
            },
        });
        this.addCommand({
            id: "pull-all",
            name: t(this.lang(), "cmd_pull_all"),
            callback: () => {
                void this.engine.pullAll();
            },
        });
        this.addCommand({
            id: "reset-local",
            name: t(this.lang(), "cmd_reset"),
            callback: () => {
                this.confirmReset();
            },
        });
        this.addCommand({
            id: "export-diagnostics",
            name: t(this.lang(), "cmd_export_diag"),
            callback: () => {
                void this.exportDiagnostics();
            },
        });
    }

    /** 导出诊断信息（脱敏后复制到剪贴板） */
    private async exportDiagnostics(): Promise<void> {
        try {
            const c = this.engine.getCounters();
            const st = this.engine.getStatus();
            const text = buildDiagnosticsText({
                version: this.manifest.version,
                serverUrl: this.settings.serverUrl,
                dbName: this.settings.dbName,
                username: this.settings.username,
                encrypt: this.settings.encrypt,
                pullOnStart: this.settings.pullOnStart,
                excludeFolders: this.settings.excludeFolders,
                status: st,
                statusDetail: c.lastError ?? "",
                up: c.up,
                down: c.down,
                lastError: c.lastError,
                log: this.settings.log,
            });
            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(text);
                new Notice(t(this.lang(), "diag_copied"), 6000);
            } else {
                new Notice(text, 10000);
            }
        } catch (e) {
            new Notice(t(this.lang(), "diag_failed") + (e instanceof Error ? e.message : String(e)), 6000);
        }
    }

    private confirmReset(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(t(this.lang(), "reset_confirm_title"));
        modal.contentEl.createEl("p", {
            text: t(this.lang(), "reset_confirm_body"),
        });
        new Setting(modal.contentEl)
            .addButton((b) => {
                b.setButtonText(t(this.lang(), "cancel")).setDestructive().onClick(() => modal.close());
            })
            .addButton((b) => {
                b.setButtonText(t(this.lang(), "confirm_reset")).setCta().onClick(async () => {
                    await this.engine.resetLocal();
                    modal.close();
                    this.updateStatusBar("stopped", this.engine.getCounters());
                });
            });
        modal.open();
    }

    // ─────────────────────────── Vault 事件 ───────────────────────────

    private registerVaultEvents(): void {
        this.registerEvent(
            this.app.vault.on("create", (file: TAbstractFile) => {
                if (file instanceof TFile) this.scheduleReflect(file);
            })
        );
        this.registerEvent(
            this.app.vault.on("modify", (file: TAbstractFile) => {
                if (file instanceof TFile) this.scheduleReflect(file);
            })
        );
        this.registerEvent(
            this.app.vault.on("delete", (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    void this.engine.reflectDelete(file.path);
                }
            })
        );
        this.registerEvent(
            this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile) {
                    void this.engine.reflectRename(oldPath, file.path);
                }
            })
        );
    }

    private scheduleReflect(file: TFile): void {
        if (this.engine.isIgnored(file.path)) return;
        if (this.engine.isApplyingRemote()) return; // 应用远端期间的事件为回声，跳过
        this.reflectQueue.set(file.path, file);
        if (this.reflectTimer === null) {
            this.reflectTimer = window.setTimeout(() => {
                this.reflectTimer = null;
                void this.flushReflect();
            }, 250);
        }
    }

    private async flushReflect(): Promise<void> {
        const items = [...this.reflectQueue.values()];
        this.reflectQueue.clear();
        for (const file of items) {
            if (this.engine.isApplyingRemote()) continue;
            try {
                await this.engine.reflectFile(file);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.addLog(`⚠️ 反射变更失败（${file.path}）：${msg}`);
            }
        }
    }

    // ─────────────────────────── 状态栏与日志 ───────────────────────────

    private updateStatusBar(s: SyncStatus, c: SyncCounters): void {
        if (!this.statusBarEl) return;
        const labels: Record<string, string> = {
            stopped: t(this.lang(), "st_stopped"),
            connecting: t(this.lang(), "st_connecting"),
            idle: t(this.lang(), "st_idle"),
            syncing: t(this.lang(), "st_syncing"),
            error: t(this.lang(), "st_error"),
        };
        this.statusBarEl.setText(`${labels[s] ?? s} ↑${c.up} ↓${c.down}`);
        this.statusBarEl.removeClass("ls-zh-status-ok", "ls-zh-status-warn", "ls-zh-status-error");
        this.statusBarEl.addClass(
            s === "error" ? "ls-zh-status-error" : s === "syncing" || s === "connecting" ? "ls-zh-status-warn" : "ls-zh-status-ok"
        );
        this.settingTab?.refreshStatus();
        if (s === "error" && c.lastError && Date.now() - this.lastErrorNotice > 30000) {
            this.lastErrorNotice = Date.now();
            new Notice(`${t(this.lang(), "st_error")}：${c.lastError}`, 6000);
        }
    }

    addLog(msg: string): void {
        this.settings.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (this.settings.log.length > 200) this.settings.log.splice(0, this.settings.log.length - 200);
        this.settingTab?.updateLogArea();
        this.scheduleSave();
    }

    // ─────────────────────────── 设置持久化 ───────────────────────────

    async loadSettings(): Promise<void> {
        const data = (await this.loadData()) as Partial<LiveSyncSettings> | null;
        this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    private scheduleSave(): void {
        if (this.saveTimer !== null) return;
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            void this.saveData(this.settings).catch((e) => console.error("保存设置失败", e));
        }, 2000);
    }
}
