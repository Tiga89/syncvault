/**
 * 集成测试：两台“设备”通过复制机制同步加密文档
 *  - 设备 A：加密文件体 → 写入本地库 → 推送到远端库
 *  - 设备 B：从远端库拉取 → 解密 → 内容一致
 * 使用内存 PouchDB 模拟远端，验证文档格式 + 加密管线在复制链路中的正确性
 */
import PouchDB from "pouchdb-core";
import memoryAdapter from "pouchdb-adapter-memory";
import replication from "pouchdb-replication";
import { deriveSalt, deriveKey, encryptObject, decryptObject } from "../src/crypto";
import { bytesToBase64, base64ToBytes, bufferToBase64, sha256Hex, docIdFromPath } from "../src/utils";

PouchDB.plugin(memoryAdapter).plugin(replication);

let passed = 0;
let failed = 0;
const assert = (name, cond, detail = "") => {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
};

async function main() {
    console.log("== 双设备加密同步（内存 PouchDB 模拟）==");
    const key = await deriveKey("共享密码", await deriveSalt("obsidian-vault"));
    const keyB = await deriveKey("共享密码", await deriveSalt("obsidian-vault")); // 另一台设备派生同一密钥

    const remote = new PouchDB("remote-sync-test", { adapter: "memory" });
    const deviceA = new PouchDB("device-a", { adapter: "memory" });
    const deviceB = new PouchDB("device-b", { adapter: "memory" });

    // 设备 A：两个文件
    const files = [
        { path: "日记/2026-09-17.md", content: "# 今天\n\n写了很多笔记，包含中文与 emoji 🎉\n" },
        { path: "附件/图.png", content: "BINARY-DATA-0101" },
    ];
    for (const f of files) {
        const body = { p: f.path, b: bufferToBase64(new TextEncoder().encode(f.content)) };
        const id = await docIdFromPath(f.path);
        const x = await encryptObject(key, body);
        const c = await sha256Hex(new TextEncoder().encode(f.content));
        await deviceA.put({ _id: id, t: "f", e: 1, x, c, m: Date.now(), s: f.content.length });
    }

    // A 推送到远端
    await deviceA.replicate.to(remote);
    const remoteInfo = await remote.info();
    assert("远端收到 2 个文档", remoteInfo.doc_count === 2, `实际 ${remoteInfo.doc_count}`);

    // 验证远端只有密文，没有明文路径
    const { rows } = await remote.allDocs({ include_docs: true });
    let leaked = false;
    for (const r of rows) {
        const d = r.doc;
        if (d.p !== undefined || (d.x && JSON.stringify(d.x).includes("日记"))) leaked = true;
        if (d.x === undefined && d.b !== undefined) leaked = true;
    }
    assert("远端无明文路径/内容（全部为密文）", !leaked);

    // 设备 B 拉取并解密
    await deviceB.replicate.from(remote);
    for (const f of files) {
        const id = await docIdFromPath(f.path);
        const doc = await deviceB.get(id);
        const dec = await decryptObject(keyB, doc.x);
        const text = new TextDecoder().decode(base64ToBytes(dec.b));
        assert(`设备 B 解密 ${f.path}`, dec.p === f.path && text === f.content);
    }

    // 设备 B 修改后推回，A 拉取（双向）
    const id2 = await docIdFromPath(files[0].path);
    const docA = await deviceA.get(id2);
    const body2 = { p: files[0].path, b: bufferToBase64(new TextEncoder().encode("# 更新后的内容")) };
    await deviceB.put({ ...(await deviceB.get(id2)), x: await encryptObject(keyB, body2), c: await sha256Hex(new TextEncoder().encode("# 更新后的内容")) });
    await deviceB.replicate.to(remote);
    await deviceA.replicate.from(remote);
    const got = await deviceA.get(id2);
    const dec2 = await decryptObject(key, got.x);
    assert("双向同步（B 更新 → A 拉取解密）", dec2.b === bufferToBase64(new TextEncoder().encode("# 更新后的内容")));

    console.log(`\n结果：${passed} 通过，${failed} 失败`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
