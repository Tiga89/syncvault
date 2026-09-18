/**
 * Markdown 冲突自动合并（纯函数，可独立测试）
 *
 * 规则：
 *  - 一方是另一方的超集（按行集合判断）→ 取较长版本
 *  - 双方都有独有内容 → 冲突标记合并（<<<<<<< / ======= / >>>>>>>），不丢失任何一行
 * 输入输出均为 base64 内容
 */
import { base64ToBytes, bufferToBase64 } from "./utils";

export function mergeMarkdown(localB64: string, remoteB64: string): string | null {
    const toLines = (b64: string) => new TextDecoder().decode(base64ToBytes(b64)).split(/\r?\n/);
    const lLines = toLines(localB64);
    const rLines = toLines(remoteB64);
    const lSet = new Set(lLines);
    const rSet = new Set(rLines);
    const localOnly = lLines.filter((l) => !rSet.has(l));
    const remoteOnly = rLines.filter((r) => !lSet.has(r));
    if (localOnly.length === 0 && remoteOnly.length === 0) return localB64;
    if (localOnly.length === 0) return remoteB64;
    if (remoteOnly.length === 0) return localB64;
    const localText = new TextDecoder().decode(base64ToBytes(localB64));
    const remoteText = new TextDecoder().decode(base64ToBytes(remoteB64));
    const merged = `<<<<<<< 本地版本\n${localText}\n=======\n${remoteText}\n>>>>>>> 远端版本\n`;
    return bufferToBase64(new TextEncoder().encode(merged));
}
