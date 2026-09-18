/**
 * 同步引擎
 *
 * 架构（与 Self-hosted LiveSync 同源思路）：
 *   Obsidian Vault ──(事件: create/modify/delete/rename)──▶ 本地 PouchDB（IndexedDB）
 *   本地 PouchDB ◀──(live replication 双向)──▶ 远端 CouchDB
 *   CouchDB 变更 ──(pull change)──▶ 解密落盘到 Vault
 *
 * 关键机制：
 *  - 实时复制：PouchDB live + retry 双向复制，断线自动重连
 *  - 防回声：写入 Vault 后触发的事件通过 applyingRemote 标志 + 内容哈希双重过滤
 *  - 冲突处理：拉取时内容哈希比对 + 复制后 _conflicts 清扫（见 conflict.ts）
 *  - 端到端加密：文档体（路径+内容）在离开本机前用 AES-256-GCM 加密
 */
import { Notice, TFile, Vault, requestUrl } from "obsidian";
import PouchDB from "pouchdb-core";
// @ts-ignore
import idbAdapter from "pouchdb-adapter-idb";
// @ts-ignore
import httpAdapter from "pouchdb-adapter-http";
// @ts-ignore
import replicationPlugin from "pouchdb-replication";

import { deriveSalt, deriveKey, encryptObject, decryptObject, keyFingerprint } from "./crypto";
import {
    base64ToBytes,
    bufferToBase64,
    docIdFromPath,
    getExtension,
    isMarkdownFile,
    isTextFile,
    sha256Hex,
    sleep,
} from "./utils";
import { resolveConflicts } from "./conflict";
import { mergeMarkdown } from "./merge";
import type { FileBody, LiveSyncSettings, SyncCounters, SyncDoc, SyncStatus } from "./types";

PouchDB.plugin(idbAdapter as any).plugin(httpAdapter as any).plugin(replicationPlugin as any);

/** PouchDB 实例的最小接口 */
export interface PouchLike {
    get<T>(id: string, opts?: any): Promise<T>;
    put(doc: any): Promise<any>;
    remove(idOrDoc: any, rev?: string): Promise<any>;
    allDocs(opts?: any): Promise<any>;
    destroy(): Promise<any>;
    replicate: {
        to(remote: PouchLike, opts?: any): any;
        from(remote: PouchLike, opts?: any): any;
    };
}

const REVISION_PREFIX = "livesync-zh_";

/** 事件回调（更新状态栏/界面） */
export interface SyncEngineEvents {
    onStatus(status: SyncStatus, counters: SyncCounters, detail?: string): void;
    onLog(msg: string): void;
}

export class SyncEngine {
    private db: PouchLike | null = null;
    private remote: PouchLike | null = null;
    private pushHandler: any = null;
    private pullHandler: any = null;
    private cryptoKey: CryptoKey | null = null;

    private status: SyncStatus = "stopped";
    private counters: SyncCounters = { up: 0, down: 0, lastError: null };
    private statusDetail = "";

    /** 远端变更待应用队列 */
    private pendingDocs = new Map<string, SyncDoc>();
    private applying = false;
    private applyingRemote = 0;
    /** 最近由同步写入的文件（防回声）：path → 内容哈希 */
    private lastApplied = new Map<string, string>();
    private readonly lastAppliedMax = 5000;

    /** 定时器句柄 */
    private periodicTimer: number | null = null;
    private conflictTimer: number | null = null;
    private stopRequested = false;

    private vault: Vault;

    constructor(
        private settings: () => LiveSyncSettings,
        private events: SyncEngineEvents
    ) {
        this.vault = (globalThis as any).app?.vault;
    }

    // ─────────────────────────── 对外 API ───────────────────────────

    getStatus(): SyncStatus {
        return this.status;
    }
    getCounters(): SyncCounters {
        return this.counters;
    }
    getStatusDetail(): string {
        return this.statusDetail;
    }

    /** 启动同步（打开本地库 → 校验加密 → 全量扫描 → 启动实时复制） */
    async start(): Promise<boolean> {
        if (this.db) return true;
        const s = this.settings();
        if (!s.serverUrl || !s.dbName) {
            this.events.onLog("❌ 未配置服务器地址或数据库名，无法启动同步。");
            return false;
        }
        this.stopRequested = false;
        this.setStatus("connecting");

        try {
            await this.openLocalDb();
            if (s.encrypt && !(await this.ensureCryptoKey())) {
                this.setStatus("stopped");
                return false;
            }
            // 启动时扫描（安全网）
            if (s.startupScan) {
                await this.scanVault();
            }
            if (s.liveSync) {
                await this.startLiveReplication();
            }
            // 定时完整同步
            if (s.periodicMinutes > 0) {
                this.periodicTimer = window.setInterval(() => {
                    void this.syncNow();
                }, s.periodicMinutes * 60 * 1000);
            }
            this.setStatus("idle");
            return true;
        } catch (e: any) {
            this.counters.lastError = String(e?.message ?? e);
            this.events.onLog(`❌ 启动同步失败：${this.counters.lastError}`);
            this.setStatus("error");
            return false;
        }
    }

    /** 停止同步 */
    async stop(): Promise<void> {
        this.stopRequested = true;
        this.cancelReplication();
        if (this.periodicTimer !== null) {
            window.clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
        if (this.conflictTimer !== null) {
            window.clearTimeout(this.conflictTimer);
            this.conflictTimer = null;
        }
        this.db = null;
        this.cryptoKey = null;
        this.setStatus("stopped");
    }

    /** 立即同步一次（双向，一次性复制） */
    async syncNow(): Promise<void> {
        if (!this.db || !this.remote) {
            this.events.onLog("⚠️ 同步未启动，无法立即同步。");
            return;
        }
        this.setStatus("syncing");
        try {
            await this.replicateOnce("push");
            await this.replicateOnce("pull");
            await this.flushApplyQueue();
            await this.scheduleConflictSweep(true);
            this.setStatus("idle");
            this.events.onLog(`✅ 立即同步完成（上传 ${this.counters.up}，下载 ${this.counters.down}）。`);
        } catch (e: any) {
            this.counters.lastError = String(e?.message ?? e);
            this.events.onLog(`❌ 立即同步失败：${this.counters.lastError}`);
            this.setStatus("error");
        }
    }

    /** 全量上传（本地库 → 服务器） */
    async pushAll(): Promise<void> {
        if (!this.db || !this.remote) return;
        this.setStatus("syncing");
        await this.scanVault();
        await this.replicateOnce("push");
        await this.scheduleConflictSweep(true);
        this.setStatus("idle");
        this.events.onLog("✅ 全量上传完成。");
    }

    /** 全量下载（服务器 → 本地库 → Vault） */
    async pullAll(): Promise<void> {
        if (!this.db || !this.remote) return;
        this.setStatus("syncing");
        await this.replicateOnce("pull");
        await this.flushApplyQueue();
        await this.scheduleConflictSweep(true);
        this.setStatus("idle");
        this.events.onLog("✅ 全量下载完成。");
    }

    /** 重置本地数据库（清空后重新开始） */
    async resetLocal(): Promise<void> {
        this.cancelReplication();
        if (this.db) {
            try {
                await this.db.destroy();
            } catch (e: any) {
                this.events.onLog(`⚠️ 销毁本地数据库时出错：${e?.message ?? e}`);
            }
        }
        this.db = null;
        this.cryptoKey = null;
        this.pendingDocs.clear();
        this.lastApplied.clear();
        this.counters = { up: 0, down: 0, lastError: null };
        this.events.onLog("🗑️ 本地数据库已重置。");
    }

    /** 测试服务器连接（使用 Obsidian requestUrl，不受 CORS 限制） */
    async testConnection(): Promise<{ ok: boolean; msg: string }> {
        const s = this.settings();
        const { baseUrl } = this.buildRemoteUrl();
        if (!baseUrl) return { ok: false, msg: "请先填写服务器地址。" };
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const auth = btoa(`${s.username}:${s.password}`);
            headers["Authorization"] = "Basic " + auth;
            const resp = await requestUrl({
                url: `${baseUrl}/${encodeURIComponent(s.dbName)}`,
                method: "GET",
                headers,
                throw: false,
            });
            if (resp.status === 200) {
                return { ok: true, msg: "✅ 连接成功：数据库已存在，配置正确。" };
            }
            if (resp.status === 404) {
                const createResp = await requestUrl({
                    url: `${baseUrl}/${encodeURIComponent(s.dbName)}`,
                    method: "PUT",
                    headers,
                    throw: false,
                });
                if (createResp.status === 201 || createResp.status === 202) {
                    return { ok: true, msg: "✅ 连接成功：已自动创建数据库。" };
                }
                return {
                    ok: false,
                    msg: `❌ 无法创建数据库（HTTP ${createResp.status}）。请确认服务器允许建库，或手动在 CouchDB 中创建。`,
                };
            }
            if (resp.status === 401 || resp.status === 403) {
                return { ok: false, msg: "❌ 认证失败：用户名或密码错误（HTTP 401/403）。" };
            }
            if (resp.status === 404) {
                return { ok: false, msg: "❌ 服务器地址不正确（HTTP 404）。" };
            }
            return { ok: false, msg: `❌ 连接失败（HTTP ${resp.status}）。` };
        } catch (e: any) {
            return { ok: false, msg: `❌ 无法连接服务器：${e?.message ?? e}` };
        }
    }

    // ─────────────────────────── 初始化 ───────────────────────────

    private async openLocalDb(): Promise<void> {
        const vaultPath = this.vault.getRoot().path;
        const name = REVISION_PREFIX + (await sha256Hex(vaultPath || "default")).slice(0, 16);
        const Pouch = PouchDB as any;
        this.db = new Pouch({ name, adapter: "idb" });
        this.events.onLog(`📦 本地数据库已打开：${name}`);
    }

    /** 校验/准备加密密钥 */
    private async ensureCryptoKey(): Promise<boolean> {
        const s = this.settings();
        if (!s.passphrase) {
            this.counters.lastError = "端到端加密已开启，但未设置加密密码。请在设置中填写密码（所有设备需一致）。";
            this.events.onLog(`❌ ${this.counters.lastError}`);
            new Notice("Livesync：未设置加密密码，同步未启动");
            return false;
        }
        const salt = await deriveSalt(s.dbName);
        const fp = await keyFingerprint(s.passphrase, salt);
        if (s.keyFingerprint && s.keyFingerprint !== fp) {
            this.counters.lastError =
                "加密密码或数据库名与上次不同，无法解密已有数据。如确需变更，请先在设置中「重置本地数据库」并重新上传。";
            this.events.onLog(`❌ ${this.counters.lastError}`);
            new Notice("Livesync：加密凭据不一致，同步未启动");
            return false;
        }
        this.cryptoKey = await deriveKey(s.passphrase, salt);
        if (!s.keyFingerprint) {
            const cur = this.settings();
            cur.keyFingerprint = fp;
        }
        return true;
    }

    // ─────────────────────────── 复制 ───────────────────────────

    private buildRemoteUrl(): { baseUrl: string; remoteUrl: string } {
        const s = this.settings();
        let raw = s.serverUrl.trim();
        if (!raw) return { baseUrl: "", remoteUrl: "" };
        if (!/^https?:\/\//i.test(raw)) raw = "http://" + raw;
        const u = new URL(raw);
        u.username = encodeURIComponent(s.username);
        u.password = encodeURIComponent(s.password);
        const baseUrl = u.origin;
        const dbPath = `/${encodeURIComponent(s.dbName)}`;
        u.pathname = dbPath;
        return { baseUrl, remoteUrl: u.toString() };
    }

    private startLiveReplication(): void {
        const { remoteUrl } = this.buildRemoteUrl();
        if (!remoteUrl || !this.db) return;
        const Pouch = PouchDB as any;
        this.remote = new Pouch(remoteUrl, { skip_setup: true });
        const opts = { live: true, retry: true, batch_size: 200 };

        this.pushHandler = this.db.replicate.to(this.remote as any, opts);
        this.pushHandler.on("change", (info: any) => {
            this.counters.up += (info?.docs?.length ?? 0);
            this.setStatus("syncing");
        });
        this.pushHandler.on("paused", () => {
            if (!this.stopRequested) this.setStatus("idle");
        });
        this.pushHandler.on("error", (err: any) => {
            this.counters.lastError = String(err?.message ?? err);
            this.events.onLog(`⚠️ 上传失败（将自动重试）：${this.counters.lastError}`);
            this.setStatus("error");
        });

        this.pullHandler = this.db.replicate.from(this.remote as any, opts);
        this.pullHandler.on("change", (info: any) => {
            const docs = (info?.docs ?? []) as SyncDoc[];
            this.counters.down += docs.length;
            for (const d of docs) this.enqueueApply(d);
            this.scheduleConflictSweep();
        });
        this.pullHandler.on("paused", () => {
            if (!this.stopRequested) this.setStatus("idle");
        });
        this.pullHandler.on("error", (err: any) => {
            this.counters.lastError = String(err?.message ?? err);
            this.events.onLog(`⚠️ 下载失败（将自动重试）：${this.counters.lastError}`);
            this.setStatus("error");
        });

        this.events.onLog(`🔌 实时同步已启动：${remoteUrl.replace(/:[^:@/]+@/, ":***@")}`);
    }

    private cancelReplication(): void {
        try {
            this.pushHandler?.cancel?.();
            this.pullHandler?.cancel?.();
        } catch {
            /* 忽略 */
        }
        this.pushHandler = null;
        this.pullHandler = null;
        this.remote = null;
    }

    /** 一次性复制（用于立即同步/全量上传/全量下载） */
    private async replicateOnce(dir: "push" | "pull"): Promise<void> {
        const { remoteUrl } = this.buildRemoteUrl();
        if (!remoteUrl || !this.db) return;
        const Pouch = PouchDB as any;
        const remote = new Pouch(remoteUrl, { skip_setup: true });
        try {
            const handler =
                dir === "push" ? this.db.replicate.to(remote as any) : this.db.replicate.from(remote as any);
            await new Promise<void>((resolve, reject) => {
                handler.on("complete", () => resolve());
                handler.on("error", (err: any) => reject(new Error(String(err?.message ?? err))));
                handler.on("denied", (err: any) => reject(new Error("权限不足：" + String(err?.message ?? err))));
            });
        } finally {
            try {
                await remote.close?.();
            } catch {
                /* 忽略 */
            }
        }
    }

    // ─────────────────────────── Vault 反射（本地 → 库） ───────────────────────────

    /** 扫描 Vault：将磁盘上有变更的文件反射到本地库（stat 快速判断 + 哈希兜底） */
    async scanVault(): Promise<void> {
        const files = this.vault.getFiles();
        for (const f of files) {
            if (this.stopRequested) return;
            try {
                await this.reflectFile(f, true);
            } catch (e: any) {
                this.events.onLog(`⚠️ 扫描 ${f.path} 出错：${e?.message ?? e}`);
            }
        }
        this.events.onLog(`🔍 启动扫描完成（共 ${files.length} 个文件）。`);
    }

    /**
     * 将单个文件反射到本地库。
     * @param quick 快速模式：mtime/size 未变则跳过（避免每次全量读文件）
     */
    async reflectFile(file: TFile, quick = false): Promise<void> {
        const s = this.settings();
        const path = file.path;
        if (this.isIgnored(path)) return;
        if (s.maxSizeMB > 0 && file.stat?.size > s.maxSizeMB * 1024 * 1024) {
            this.events.onLog(`⏭️ 跳过超大文件（>${s.maxSizeMB}MB）：${path}`);
            return;
        }
        const id = await docIdFromPath(path);
        const db = this.db;
        if (!db) return;
        const existing = await db.get<SyncDoc>(id).catch(() => null);
        const old = existing && !existing._deleted ? existing : null;

        // 快速判断：元数据未变则跳过（内容未动）
        if (quick && old && file.stat?.mtime <= (old.m ?? 0) && file.stat?.size === (old.s ?? 0)) {
            return;
        }
        const buf = await this.vault.readBinary(file);
        const c = await sha256Hex(buf);
        if (old && old.c === c && old.s === buf.byteLength) {
            if (file.stat?.mtime !== old.m) {
                await db.put({ ...old, m: file.stat?.mtime ?? Date.now() }).catch(() => undefined);
            }
            return;
        }
        const body: FileBody = { p: path, b: bufferToBase64(buf) };
        const base: any = old
            ? { ...old, m: file.stat?.mtime ?? Date.now(), s: buf.byteLength, c }
            : { _id: id, t: "f" as const, m: file.stat?.mtime ?? Date.now(), s: buf.byteLength, c };
        if (s.encrypt && this.cryptoKey) {
            delete base.p;
            delete base.b;
            base.e = 1;
            base.x = await encryptObject(this.cryptoKey, body);
        } else {
            delete base.e;
            delete base.x;
            base.p = path;
            base.b = body.b;
        }
        await db.put(base).catch((err: any) => {
            // 409 冲突：交给冲突清扫处理
            if (err?.status === 409) this.events.onLog(`⚡ ${path} 存在并发冲突，将由冲突处理接管。`);
            else throw err;
        });
    }

    /** 删除文件 → 删除本地文档（推送删除墓碑） */
    async reflectDelete(path: string): Promise<void> {
        if (this.isIgnored(path)) return;
        const db = this.db;
        if (!db) return;
        const id = await docIdFromPath(path);
        const doc = await db.get<SyncDoc>(id).catch(() => null);
        if (doc && !doc._deleted) {
            await db.remove(doc._id, doc._rev!).catch(() => undefined);
        }
    }

    /** 重命名：旧文档删除 + 新文档创建 */
    async reflectRename(oldPath: string, newPath: string): Promise<void> {
        await this.reflectDelete(oldPath);
        const file = this.vault.getAbstractFileByPath(newPath);
        if (file instanceof TFile) {
            await this.reflectFile(file);
        }
    }

    /** 判断路径是否被忽略 */
    isIgnored(path: string): boolean {
        const s = this.settings();
        if (path.startsWith(".trash/") || path === ".trash") return true;
        if (path.startsWith(".obsidian/")) {
            if (!s.syncHidden) return true;
            // 永远不同步本插件自身的配置文件，避免死循环
            if (path.includes("/plugins/obsidian-livesync-zh/data.json")) return true;
        }
        if (s.ignoreRegEx) {
            try {
                if (new RegExp(s.ignoreRegEx).test(path)) return true;
            } catch {
                /* 无效正则忽略 */
            }
        }
        return false;
    }

    // ─────────────────────────── 远端变更应用（库 → Vault） ───────────────────────────

    private enqueueApply(doc: SyncDoc): void {
        this.pendingDocs.set(doc._id, doc);
        void this.flushApplyQueue();
    }

    /** 串行消费应用队列 */
    private async flushApplyQueue(): Promise<void> {
        if (this.applying) return;
        this.applying = true;
        try {
            while (this.pendingDocs.size > 0) {
                const first = this.pendingDocs.keys().next().value as string;
                const doc = this.pendingDocs.get(first)!;
                this.pendingDocs.delete(first);
                if (this.stopRequested) return;
                try {
                    await this.applyRemoteDoc(doc);
                } catch (e: any) {
                    this.events.onLog(`⚠️ 应用远端变更失败（${doc._id}）：${e?.message ?? e}`);
                }
                await sleep(8);
            }
        } finally {
            this.applying = false;
        }
    }

    private async applyRemoteDoc(doc: SyncDoc): Promise<void> {
        const db = this.db;
        if (!db) return;
        this.applyingRemote++;
        try {
            if (doc._deleted) {
                await this.applyRemoteDeletion(doc);
                return;
            }
            const local = await db.get<SyncDoc>(doc._id).catch(() => null);
            let path = doc.p ?? "";
            let content = doc.b ?? "";
            if (doc.e === 1) {
                if (!this.cryptoKey) return;
                const body = await decryptObject<FileBody>(this.cryptoKey, doc.x!);
                path = body.p;
                content = body.b;
            }
            if (!path) return;

            if (!local || local._deleted) {
                if (local?._deleted) await db.remove(local._id, local._rev!).catch(() => undefined);
                await this.writeToVault(path, content, doc.c);
                await db.put(doc).catch((err: any) => {
                    if (err?.status !== 409) throw err;
                });
                return;
            }

            if (local.c === doc.c) {
                // 内容一致：仅对齐元数据；若磁盘缺失则补写
                if (!this.vault.getAbstractFileByPath(path)) {
                    await this.writeToVault(path, content, doc.c);
                }
                await db
                    .put({ ...local, m: doc.m, s: doc.s })
                    .catch((err: any) => {
                        if (err?.status !== 409) throw err;
                    });
                return;
            }

            // 内容不一致：判断本地是否被用户改动过
            const diskHash = await this.diskFileHash(path);
            if (diskHash === null) {
                // 本地文件已被删除（未同步）→ 远端胜出
                await this.writeToVault(path, content, doc.c);
                await db.put(doc).catch(() => undefined);
                return;
            }
            if (diskHash === local.c) {
                // 本地自上次推送后未改动 → 远端覆盖
                await this.writeToVault(path, content, doc.c);
                await db.put(doc).catch(() => undefined);
                return;
            }
            // 真正的冲突：本地有未推送修改，远端也有修改
            await this.handleConflict(local, doc, path, content);
        } finally {
            this.applyingRemote--;
        }
    }

    private async applyRemoteDeletion(doc: SyncDoc): Promise<void> {
        const db = this.db;
        if (!db) return;
        const local = await db.get<SyncDoc>(doc._id).catch(() => null);
        if (!local || local._deleted) return;
        let path = local.p ?? "";
        if (local.e === 1) {
            if (!this.cryptoKey) return;
            const body = await decryptObject<FileBody>(this.cryptoKey, local.x!);
            path = body.p;
        }
        const abs = this.vault.getAbstractFileByPath(path);
        if (abs instanceof TFile) {
            const diskHash = await this.diskFileHash(path);
            if (diskHash === local.c) {
                await this.vault.trash(abs, true).catch((e: any) => this.events.onLog(`⚠️ 删除 ${path} 失败：${e?.message ?? e}`));
            } else {
                this.events.onLog(`🛡️ 远端已删除 ${path}，但本地有未推送的修改，已保留本地文件。`);
            }
        }
        await db.remove(local._id, local._rev!).catch(() => undefined);
    }

    /** 冲突处理（本地未推送修改 vs 远端修改） */
    private async handleConflict(
        local: SyncDoc,
        remote: SyncDoc,
        path: string,
        remoteContent: string
    ): Promise<void> {
        const db = this.db;
        if (!db) return;
        const s = this.settings();
        let localContent = local.b ?? "";
        if (local.e === 1 && this.cryptoKey) {
            const body = await decryptObject<FileBody>(this.cryptoKey, local.x!);
            localContent = body.b;
        }
        this.events.onLog(`⚔️ 检测到冲突：${path}`);

        if (isMarkdownFile(path) && s.autoMerge) {
            const merged = mergeMarkdown(localContent, remoteContent);
            if (merged !== null) {
                const c = await sha256Hex(base64ToBytes(merged));
                await this.writeToVault(path, merged, c);
                await db
                    .put({ ...local, c, m: Date.now(), s: base64ToBytes(merged).byteLength, ...(await this.makeBodyField(path, merged)) })
                    .catch(() => undefined);
                this.events.onLog(`🤝 已自动合并冲突：${path}`);
                return;
            }
        }
        // 无法自动合并：远端版本另存为冲突副本，本地版本保留
        const copyPath = await this.createConflictCopy(path, remoteContent);
        await db.put(local).catch(() => undefined);
        this.events.onLog(`📄 已保留本地版本，远端版本保存为：${copyPath}`);
    }

    /** 构造文档内容字段（按加密模式） */
    private async makeBodyField(path: string, contentBase64: string): Promise<Partial<SyncDoc>> {
        if (this.settings().encrypt && this.cryptoKey) {
            return { e: 1, x: await encryptObject(this.cryptoKey, { p: path, b: contentBase64 }) };
        }
        return { p: path, b: contentBase64 };
    }

    /** 写入 Vault（防回声记录） */
    private async writeToVault(path: string, contentBase64: string, contentHash: string): Promise<void> {
        await this.ensureFolders(path);
        const bytes = base64ToBytes(contentBase64);
        if (isTextFile(path)) {
            const text = new TextDecoder().decode(bytes);
            await this.vault.create(path, text, { overwrite: true } as any);
        } else {
            const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
            await this.vault.createBinary(path, ab, { overwrite: true } as any);
        }
        if (this.lastApplied.size >= this.lastAppliedMax) this.lastApplied.clear();
        this.lastApplied.set(path, contentHash);
    }

    /** 确保父目录存在 */
    private async ensureFolders(path: string): Promise<void> {
        const parts = path.split("/").filter(Boolean);
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
            acc = acc ? acc + "/" + parts[i] : parts[i];
            if (!this.vault.getAbstractFileByPath(acc)) {
                try {
                    await this.vault.createFolder(acc);
                } catch (e: any) {
                    // 目录已存在等并发错误，忽略
                    if (!String(e?.message ?? "").includes("already")) throw e;
                }
            }
        }
    }

    /** 创建冲突副本，返回副本路径 */
    async createConflictCopy(path: string, contentBase64: string): Promise<string> {
        const ext = getExtension(path);
        const stem = ext ? path.slice(0, -(ext.length + 1)) : path;
        const suffix = `（冲突 ${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)}）`;
        let candidate = ext ? `${stem}${suffix}.${ext}` : `${stem}${suffix}`;
        let n = 2;
        while (this.vault.getAbstractFileByPath(candidate)) {
            candidate = ext ? `${stem}${suffix}-${n}.${ext}` : `${stem}${suffix}-${n}`;
            n++;
        }
        const c = await sha256Hex(base64ToBytes(contentBase64));
        await this.writeToVault(candidate, contentBase64, c);
        this.events.onLog(`📄 冲突副本已创建：${candidate}`);
        // 主动推送副本（可能在远端应用期间创建，vault 事件会被抑制）
        const file = this.vault.getAbstractFileByPath(candidate);
        if (file instanceof TFile) {
            await this.reflectFile(file).catch((e: any) =>
                this.events.onLog(`⚠️ 推送冲突副本失败：${e?.message ?? e}`)
            );
        }
        return candidate;
    }

    /** 计算磁盘文件的哈希，文件不存在返回 null */
    private async diskFileHash(path: string): Promise<string | null> {
        const abs = this.vault.getAbstractFileByPath(path);
        if (!(abs instanceof TFile)) return null;
        try {
            const buf = await this.vault.readBinary(abs);
            return await sha256Hex(buf);
        } catch {
            return null;
        }
    }

    /** 供 Vault 事件调用：检查是否为同步回声（由本插件写入） */
    isEcho(path: string, contentHash: string): boolean {
        const h = this.lastApplied.get(path);
        if (h && h === contentHash) {
            this.lastApplied.delete(path);
            return true;
        }
        return this.applyingRemote > 0;
    }

    /** 是否正在应用远端变更 */
    isApplyingRemote(): boolean {
        return this.applyingRemote > 0;
    }

    // ─────────────────────────── 冲突清扫 ───────────────────────────

    private scheduleConflictSweep(immediate = false): void {
        if (this.conflictTimer !== null) return;
        this.conflictTimer = window.setTimeout(() => {
            this.conflictTimer = null;
            void resolveConflicts(this).catch((e: any) => {
                this.events.onLog(`⚠️ 冲突清扫出错：${e?.message ?? e}`);
            });
        }, immediate ? 100 : 2000);
    }

    // ─────────────────────────── 状态 ───────────────────────────

    private setStatus(s: SyncStatus, detail?: string): void {
        this.status = s;
        if (detail !== undefined) this.statusDetail = detail;
        this.events.onStatus(s, this.counters, this.statusDetail);
    }

    onLog(msg: string): void {
        this.events.onLog(msg);
    }

    getSettings(): LiveSyncSettings {
        return this.settings();
    }

    getVault(): Vault {
        return this.vault;
    }

    getDb(): PouchLike | null {
        return this.db;
    }

    /** 供冲突处理使用的加密密钥 */
    getCryptoKey(): CryptoKey | null {
        return this.cryptoKey;
    }

    /** 是否已请求停止（用于长循环中退出） */
    isStopping(): boolean {
        return this.stopRequested;
    }
}
