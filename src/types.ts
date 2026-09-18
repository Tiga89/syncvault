/**
 * 类型定义与默认设置
 */
import type { EncryptedBody } from "./crypto";

/** 插件设置 */
export interface LiveSyncSettings {
    /** 服务器基础地址，如 http://192.168.1.10:5984 或 https://sync.example.com */
    serverUrl: string;
    /** CouchDB 用户名 */
    username: string;
    /** CouchDB 密码 */
    password: string;
    /** 数据库名 */
    dbName: string;
    /** 启动时自动开始同步 */
    autoStart: boolean;
    /** 实时同步（打开后持续双向复制） */
    liveSync: boolean;
    /** 保存文件后自动同步 */
    syncOnSave: boolean;
    /** 定时完整同步间隔（分钟，0 为关闭） */
    periodicMinutes: number;
    /** 启动时扫描一遍本地库（安全网） */
    startupScan: boolean;
    /** 最大同步文件大小（MB，超过则跳过） */
    maxSizeMB: number;
    /** 忽略的文件/目录（正则，作用于路径，完整匹配） */
    ignoreRegEx: string;
    /** 同步 .obsidian 目录（设置/主题/片段等） */
    syncHidden: boolean;
    /** Markdown 冲突自动合并 */
    autoMerge: boolean;
    /** 端到端加密 */
    encrypt: boolean;
    /** 加密密码（PBKDF2 派生，需所有设备一致） */
    passphrase: string;
    /** 密钥指纹（检测密码/库名变更） */
    keyFingerprint: string;
    /** 最近日志（最多 100 条） */
    log: string[];
}

export const DEFAULT_SETTINGS: LiveSyncSettings = {
    serverUrl: "",
    username: "admin",
    password: "",
    dbName: "obsidian-vault",
    autoStart: false,
    liveSync: true,
    syncOnSave: true,
    periodicMinutes: 10,
    startupScan: true,
    maxSizeMB: 5,
    ignoreRegEx: "",
    syncHidden: false,
    autoMerge: true,
    encrypt: true,
    passphrase: "",
    keyFingerprint: "",
    log: [],
};

/** 同步文档结构（存储在 CouchDB 中） */
export interface SyncDoc {
    _id: string;
    _rev?: string;
    _deleted?: boolean;
    _conflicts?: string[];
    /** 类型：文件 */
    t: "f";
    /** 1 = 端到端加密模式 */
    e?: 1;
    /** 明文模式：文件路径 */
    p?: string;
    /** 明文模式：内容（base64） */
    b?: string;
    /** 加密模式：密文（含路径 + 内容） */
    x?: EncryptedBody;
    /** 内容 SHA-256（十六进制，用于比较） */
    c: string;
    /** 文件修改时间（ms） */
    m: number;
    /** 文件大小（字节） */
    s: number;
}

/** 同步状态 */
export type SyncStatus = "stopped" | "connecting" | "idle" | "syncing" | "error";

/** 同步统计 */
export interface SyncCounters {
    up: number;
    down: number;
    lastError: string | null;
}

/** 加密后的文档体（路径 + 内容） */
export interface FileBody {
    p: string;
    b: string;
}
