/**
 * 冲突清扫：处理 PouchDB/CouchDB 复制后留下的多版本冲突（_conflicts）
 *
 * 规则：
 *  - 相同的失败版本 → 直接删除
 *  - 删除墓碑 vs 有内容的版本 → 保留内容，失败版本转为冲突副本
 *  - 内容不同的版本 → 保持胜者为主，失败版本另存为冲突副本
 */
import { decryptObject } from "./crypto";
import type { SyncEngine } from "./syncEngine";
import type { FileBody, SyncDoc } from "./types";

/** 解码文档 → {path, b64}；删除墓碑返回 null */
async function decodeDoc(engine: SyncEngine, doc: SyncDoc): Promise<FileBody | null> {
    if (doc._deleted) return null;
    if (doc.e === 1) {
        const key = engine.getCryptoKey();
        if (!key) return null;
        try {
            return await decryptObject<FileBody>(key, doc.x!);
        } catch {
            return null;
        }
    }
    return { p: doc.p ?? "", b: doc.b ?? "" };
}

export async function resolveConflicts(engine: SyncEngine): Promise<void> {
    const db = engine.getDb();
    if (!db) return;

    const res = await db.allDocs({ conflicts: true });
    const rows = res?.rows ?? [];

    for (const row of rows) {
        if (engine.isStopping()) return;
        const conflictRevs = row.value?.conflicts ?? row.value?._conflicts;
        if (!conflictRevs || conflictRevs.length === 0) continue;

        const winner = await db.get<SyncDoc>(row.id, { conflicts: true }).catch(() => null);
        if (!winner) continue;
        const winnerRevs = winner._conflicts ?? conflictRevs;
        const winnerBody = await decodeDoc(engine, winner);

        for (const rev of winnerRevs) {
            if (engine.isStopping()) return;
            const loser = await db.get<SyncDoc>(row.id, { rev }).catch(() => null);
            if (!loser) {
                await db.remove(row.id, rev).catch(() => undefined);
                continue;
            }
            if (loser._deleted) {
                // 失败版本是删除：若胜者还有内容则保留胜者
                await db.remove(row.id, rev).catch(() => undefined);
                continue;
            }
            const loserBody = await decodeDoc(engine, loser);
            if (!loserBody || !loserBody.b) {
                await db.remove(row.id, rev).catch(() => undefined);
                continue;
            }
            if (winner._deleted) {
                // 胜者是删除，但失败版本仍有内容 → 恢复为冲突副本，避免数据丢失
                const copyPath = await engine.createConflictCopy(loserBody.p || "restored.md", loserBody.b);
                engine.onLog(`♻️ 检测到删除与内容冲突，已恢复内容为：${copyPath}`);
                await db.remove(row.id, rev).catch(() => undefined);
                continue;
            }
            if (winnerBody && winnerBody.b === loserBody.b) {
                // 内容相同，仅版本不同
                await db.remove(row.id, rev).catch(() => undefined);
                continue;
            }
            // 内容不同：失败版本保存为冲突副本
            const copyPath = await engine.createConflictCopy(winnerBody?.p || loserBody.p || "conflict.md", loserBody.b);
            engine.onLog(`📄 冲突版本已保存为：${copyPath}`);
            await db.remove(row.id, rev).catch(() => undefined);
        }
    }

    const resolved = rows.filter((r) => r.value?.conflicts || r.value?._conflicts).length;
    if (resolved > 0) {
        engine.onLog(`🧹 冲突清扫完成：处理 ${resolved} 个冲突文档。`);
    }
}
