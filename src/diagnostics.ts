/**
 * 诊断信息导出：收集插件运行状态（脱敏后）生成文本，
 * 用于快速排障（CORS、防火墙、版本不匹配等问题定位）。
 */
export interface DiagInput {
    version: string;
    serverUrl: string;
    dbName: string;
    username: string;
    encrypt: boolean;
    pullOnStart: boolean;
    excludeFolders: string;
    status: string;
    statusDetail: string;
    up: number;
    down: number;
    lastError: string | null;
    log: string[];
}

/** 敏感值打码：短值全打码，长值保留首尾 */
export function maskSecret(s: string): string {
    if (!s) return "";
    if (s.length <= 4) return "****";
    return s.slice(0, 2) + "****" + s.slice(-2);
}

/** 服务器地址脱敏：隐藏 URL 中的密码 */
export function maskUrl(url: string): string {
    return url.replace(/(:\/\/[^:/\s@]+):([^@/\s]+)@/, "$1:***@");
}

/** 生成诊断文本（纯函数，便于测试） */
export function buildDiagnosticsText(input: DiagInput): string {
    const lines: string[] = [];
    lines.push("=== SyncVault 诊断信息 ===");
    lines.push(`生成时间: ${new Date().toLocaleString()}`);
    lines.push(`插件版本: ${input.version}`);
    lines.push(`服务器地址: ${maskUrl(input.serverUrl)}`);
    lines.push(`数据库名: ${input.dbName}`);
    lines.push(`用户名: ${input.username}`);
    lines.push(`端到端加密: ${input.encrypt ? "开" : "关"}`);
    lines.push(`启动后自动同步: ${input.pullOnStart ? "开" : "关"}`);
    lines.push(`排除文件夹: ${input.excludeFolders.trim() ? input.excludeFolders.trim().split(/\r?\n/).join(", ") : "(无)"}`);
    lines.push(`同步状态: ${input.status}${input.statusDetail ? "（" + input.statusDetail + "）" : ""}`);
    lines.push(`统计: 上传 ${input.up}，下载 ${input.down}`);
    lines.push(`最近错误: ${input.lastError ?? "(无)"}`);
    lines.push("");
    lines.push("--- 最近日志（最多 100 条） ---");
    if (input.log.length === 0) {
        lines.push("（暂无日志）");
    } else {
        for (const l of input.log.slice(-100)) lines.push(l);
    }
    return lines.join("\n");
}
