/**
 * 端到端加密模块
 *
 * 设计：
 *  - 密钥派生：PBKDF2-SHA256（310,000 次迭代），由用户密码 + 确定性盐（由数据库名派生）生成 AES-256-GCM 密钥。
 *  - 所有设备使用相同「数据库名 + 密码」即可推导出同一把密钥，无需交换密钥文件。
 *  - 每个文档随机生成 96 位 IV，AES-GCM 加密整个文档体（含文件路径 + 内容），
 *    服务器上只能看到密文与少量元数据（哈希/时间/大小），无法获知任何笔记内容与文件名。
 *  - GCM 认证标签（16 字节）附加在密文末尾，防篡改。
 */
import { sha256Hex, bytesToHex, base64ToBytes, bytesToBase64, hexToBytes } from "./utils";

export const PBKDF2_ITERATIONS = 310000;
const KEY_LENGTH_BITS = 256;
const IV_LENGTH = 12; // GCM 推荐 96 位

export interface EncryptedBody {
    iv: string; // base64
    ct: string; // base64（含 GCM 认证标签）
}

/** 由数据库名生成确定性盐（同一数据库在所有设备上得到同一密钥） */
export async function deriveSalt(dbName: string): Promise<Uint8Array> {
    const hex = await sha256Hex("obsidian-livesync-zh:v1:" + dbName);
    return hexToBytes(hex).slice(0, 16);
}

/** 由密码 + 盐派生 AES-GCM 密钥（不可导出，保证安全性） */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
        "deriveKey",
        "deriveBits",
    ]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
        baseKey,
        { name: "AES-GCM", length: KEY_LENGTH_BITS },
        false,
        ["encrypt", "decrypt"]
    );
}

/** 生成密钥指纹（用 deriveBits 得到派生密钥字节后取哈希，密钥本身保持不可导出） */
export async function keyFingerprint(passphrase: string, salt: Uint8Array): Promise<string> {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
        baseKey,
        KEY_LENGTH_BITS
    );
    return (await sha256Hex(bits)).slice(0, 16);
}

/** 加密一个 JSON 对象 → EncryptedBody */
export async function encryptObject(key: CryptoKey, obj: unknown): Promise<EncryptedBody> {
    const json = JSON.stringify(obj);
    const data = new TextEncoder().encode(json);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource);
    return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

/** 解密 EncryptedBody → 原始 JSON 对象 */
export async function decryptObject<T>(key: CryptoKey, body: EncryptedBody): Promise<T> {
    const iv = base64ToBytes(body.iv);
    const ct = base64ToBytes(body.ct);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** 便捷：加密字符串 */
export async function encryptText(key: CryptoKey, text: string): Promise<EncryptedBody> {
    return encryptObject(key, { t: text });
}

/** 便捷：解密字符串 */
export async function decryptText(key: CryptoKey, body: EncryptedBody): Promise<string> {
    const obj = await decryptObject<{ t: string }>(key, body);
    return obj.t;
}

/** 生成强随机密码（用于“生成随机密码”按钮） */
export function generateStrongPassphrase(length = 24): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    let out = "";
    for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
    return out;
}

/** 导出密钥指纹的十六进制展示（用于设置页显示） */
export async function fingerprintDisplay(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("raw", key);
    return bytesToHex(new Uint8Array(raw)).slice(0, 8);
}
