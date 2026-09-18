/**
 * 通用工具函数
 */

/** 计算字符串/字节的 SHA-256，返回十六进制字符串 */
export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
    const buf: BufferSource =
        typeof data === "string" ? new TextEncoder().encode(data) : (data as unknown as BufferSource);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
}

export function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

/** Uint8Array → Base64（分块，避免调用栈溢出） */
export function bytesToBase64(bytes: Uint8Array): string {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

/** Base64 → Uint8Array */
export function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** ArrayBuffer / Uint8Array → Base64 */
export function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
    return bytesToBase64(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
}

/** 文本是否属于“文本类”扩展名（决定写入时用 create 还是 createBinary） */
const TEXT_EXTENSIONS = new Set([
    "md", "txt", "markdown", "json", "yaml", "yml", "css", "scss", "less", "js", "mjs", "cjs", "ts",
    "tsx", "jsx", "html", "htm", "xml", "svg", "csv", "tsv", "py", "rb", "go", "rs", "java", "c", "cpp",
    "h", "sh", "bat", "ps1", "ini", "conf", "log", "toml", "tex", "bib", "properties", "gitignore",
    "mdx", "obsidian", "canvas", "dataview", "sql", "graphql",
]);

export function isTextFile(path: string): boolean {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return TEXT_EXTENSIONS.has(ext);
}

/** 是否是 markdown 文件（用于自动合并） */
export function isMarkdownFile(path: string): boolean {
    const lower = path.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown");
}

/** 转义正则 */
export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 由文件路径生成文档 ID：f/ + sha256(路径) */
export async function docIdFromPath(path: string): Promise<string> {
    return "f/" + (await sha256Hex(path));
}

/** 获取扩展名（不含点），无扩展名返回空串 */
export function getExtension(path: string): string {
    const idx = path.lastIndexOf(".");
    if (idx <= 0 || path.lastIndexOf("/") > idx) return "";
    return path.slice(idx + 1);
}

/** 时间格式化（本地时间），用于冲突副本命名 */
export function formatTimestamp(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** 从路径取文件名（去目录） */
export function basename(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(idx + 1) : path;
}

/** 从路径取目录部分，无目录返回空串 */
export function dirname(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(0, idx) : "";
}

/** 挂起若干毫秒 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
