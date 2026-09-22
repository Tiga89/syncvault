/**
 * 恢复密钥：防止忘记加密密码导致数据永久无法解密。
 *
 * 设计：
 *  - 用「恢复密码 + 数据库名」经独立盐派生一把恢复密钥（与主密钥路径隔离，
 *    恢复密码泄漏不会暴露任何已同步数据）。
 *  - 恢复密钥用于加密「主加密密码」，生成可导出的恢复文件（JSON 文本）。
 *  - 忘记主密码时，用恢复文件 + 恢复密码即可还原主密码，重新派生主密钥。
 */
import { deriveKey, deriveSalt, encryptObject, decryptObject, keyFingerprint } from "./crypto";
import { hexToBytes, sha256Hex } from "./utils";

const RECOVERY_PREFIX = "syncvault:recovery:v1:";

/** 恢复密钥的确定性盐（与主密钥盐不同，独立派生路径） */
export async function recoverySalt(dbName: string): Promise<Uint8Array> {
    return hexToBytes(await sha256Hex(RECOVERY_PREFIX + dbName)).slice(0, 16);
}

/** 恢复文件结构 */
export interface RecoveryFile {
    /** 格式版本 */
    v: 1;
    /** 数据库名（派生密钥所需） */
    db: string;
    /** 主密钥指纹（用于人工核对） */
    fp: string;
    /** AES-GCM 密文（加密的是主加密密码） */
    ct: string;
    /** IV（base64） */
    iv: string;
}

/** 导出恢复密钥文件（文本） */
export async function exportRecovery(
    passphrase: string,
    recoveryPassword: string,
    dbName: string
): Promise<string> {
    const salt = await recoverySalt(dbName);
    const key = await deriveKey(recoveryPassword, salt);
    const body = { p: passphrase };
    const enc = await encryptObject(key, body);
    const fp = await keyFingerprint(passphrase, await deriveSalt(dbName));
    const file: RecoveryFile = { v: 1, db: dbName, fp, ct: enc.ct, iv: enc.iv };
    return JSON.stringify(file);
}

/** 从恢复文件还原主加密密码 */
export async function importRecovery(
    content: string,
    recoveryPassword: string
): Promise<{ passphrase: string; dbName: string; fingerprint: string }> {
    let file: RecoveryFile;
    try {
        file = JSON.parse(content) as RecoveryFile;
    } catch {
        throw new Error("invalid recovery file");
    }
    if (file.v !== 1 || !file.db || !file.ct || !file.iv) {
        throw new Error("unsupported recovery file");
    }
    const salt = await recoverySalt(file.db);
    const key = await deriveKey(recoveryPassword, salt);
    const body = await decryptObject<{ p: string }>(key, { iv: file.iv, ct: file.ct });
    if (!body || typeof body.p !== "string") {
        throw new Error("invalid recovery payload");
    }
    return { passphrase: body.p, dbName: file.db, fingerprint: file.fp };
}
