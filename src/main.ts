/**
 * Livesync 实时同步（中文版）—— 插件入口
 *
 * 监听 Vault 事件（create/modify/delete/rename）把变更推入本地 PouchDB，
 * 由同步引擎与远端 CouchDB 做实时双向复制；远端变更自动解密落盘。
 */
import { Modal, Notice, Plugin, Setting, TAbstractFile, TFile } from "obsidian";
import { SyncEngine } from "./syncEngine";
import { LivesyncSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type LiveSyncSettings, type SyncCounters, type SyncStatus } from "./types";

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
            }
        );

        this.settingTab = new LivesyncSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);

        // 状态栏
        this.statusBarEl = this.addStatusBarItem();
        this.updateStatusBar("stopped", this.engine.getCounters());

        // 功能区图标：立即同步
        this.addRibbonIcon("refresh-cw", "Livesync：立即同步", () => {
            void this.engine.syncNow();
        });

        this.registerCommands();
        this.registerVaultEvents();

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoStart) {
                void this.engine.start();
            }
        });
    }

    async onunload(): Promise<void> {
        if (this.reflectTimer !== null) {
            window.clearTimeout(this.reflectTimer);
            this.reflectTimer = null;
        }
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.engine.stop();
    }

    // ─────────────────────────── 命令 ───────────────────────────

    private registerCommands(): void {
        this.addCommand({
            id: "start-sync",
            name: "启动同步",
            callback: () => {
                void this.engine.start();
            },
        });
        this.addCommand({
            id: "stop-sync",
            name: "停止同步",
            callback: () => {
                void this.engine.stop();
            },
        });
        this.addCommand({
            id: "sync-now",
            name: "立即同步",
            callback: () => {
                void this.engine.syncNow();
            },
        });
        this.addCommand({
            id: "push-all",
            name: "全量上传到服务器",
            callback: () => {
                void this.engine.pushAll();
            },
        });
        this.addCommand({
            id: "pull-all",
            name: "从服务器全量下载",
            callback: () => {
                void this.engine.pullAll();
            },
        });
        this.addCommand({
            id: "reset-local",
            name: "重置本地同步数据库",
            callback: () => {
                this.confirmReset();
            },
        });
    }

    private confirmReset(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("确认重置本地同步数据库？");
        modal.contentEl.createEl("p", {
            text: "这将清空本机同步缓存并停止同步。服务器数据与本地笔记文件不会受影响。重置后请重新「启动同步」。",
        });
        new Setting(modal.contentEl)
            .addButton((b) => {
                b.setButtonText("取消").setWarning().onClick(() => modal.close());
            })
            .addButton((b) => {
                b.setButtonText("确认重置").setCta().onClick(async () => {
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
            } catch (e: any) {
                this.addLog(`⚠️ 反射变更失败（${file.path}）：${e?.message ?? e}`);
            }
        }
    }

    // ─────────────────────────── 状态栏与日志 ───────────────────────────

    private updateStatusBar(s: SyncStatus, c: SyncCounters): void {
        if (!this.statusBarEl) return;
        const labels: Record<string, string> = {
            stopped: "⏹ 已停止",
            connecting: "🔌 连接中",
            idle: "💤 待同步",
            syncing: "⚡ 同步中",
            error: "⚠ 同步出错",
        };
        this.statusBarEl.setText(`${labels[s] ?? s}　↑${c.up} ↓${c.down}`);
        this.statusBarEl.removeClass("ls-zh-status-ok", "ls-zh-status-warn", "ls-zh-status-error");
        this.statusBarEl.addClass(
            s === "error" ? "ls-zh-status-error" : s === "syncing" || s === "connecting" ? "ls-zh-status-warn" : "ls-zh-status-ok"
        );
        this.settingTab?.refreshStatus();
        if (s === "error" && c.lastError && Date.now() - this.lastErrorNotice > 30000) {
            this.lastErrorNotice = Date.now();
            new Notice(`Livesync 同步出错：${c.lastError}`, 6000);
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
        const data = await this.loadData();
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
