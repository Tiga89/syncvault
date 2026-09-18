/**
 * 核心逻辑单元测试（在 Node 中运行，不依赖 Obsidian 环境）
 * 构建：node build-test.mjs && node .test-build/unit.test.cjs
 */
import {
    bytesToBase64,
    base64ToBytes,
    bufferToBase64,
    sha256Hex,
    docIdFromPath,
    isTextFile,
    getExtension,
} from "../src/utils";
import {
    deriveSalt,
    deriveKey,
    keyFingerprint,
    encryptObject,
    decryptObject,
    generateStrongPassphrase,
} from "../src/crypto";
import { mergeMarkdown } from "../src/merge";

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
    if (cond) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        console.log(`  ❌ ${name} ${detail}`);
    }
}

const b64 = (s) => bufferToBase64(new TextEncoder().encode(s));
const str = (b64s) => new TextDecoder().decode(base64ToBytes(b64s));

async function main() {
    console.log("== utils ==");
    assert("base64 往返（文本）", str(b64("你好，Obsidian 同步！")) === "你好，Obsidian 同步！");
    const rand = crypto.getRandomValues(new Uint8Array(4096));
    assert("base64 往返（4096 随机字节）", bytesToBase64(base64ToBytes(bytesToBase64(rand))).length === bytesToBase64(rand).length);
    assert("sha256 确定", (await sha256Hex("abc")) === (await sha256Hex("abc")));
    const d1 = await docIdFromPath("笔记/测试.md");
    const d2 = await docIdFromPath("笔记/测试.md");
    const d3 = await docIdFromPath("笔记/测试2.md");
    assert("docId 确定性", d1 === d2 && d1.startsWith("f/"));
    assert("docId 区分路径", d1 !== d3);
    assert("isTextFile", isTextFile("a/b.md") && isTextFile("x.json") && !isTextFile("a.png") && !isTextFile("noext"));
    assert("getExtension", getExtension("a/b.md") === "md" && getExtension("a/b") === "");

    console.log("== crypto ==");
    const saltA = await deriveSalt("obsidian-vault");
    const saltB = await deriveSalt("other-vault");
    assert("盐确定性", (await deriveSalt("obsidian-vault")).join(",") === saltA.join(","));
    assert("盐随库名变化", saltA.join(",") !== saltB.join(","));

    const key1 = await deriveKey("my-secret-密码", saltA);
    const key2 = await deriveKey("my-secret-密码", saltA);
    const key3 = await deriveKey("wrong-密码", saltA);
    const fp1 = await keyFingerprint("my-secret-密码", saltA);
    const fp2 = await keyFingerprint("my-secret-密码", saltA);
    const fp3 = await keyFingerprint("wrong-密码", saltA);
    assert("同密码同库 → 密钥指纹一致", fp1 === fp2);
    assert("不同密码 → 指纹不同", fp1 !== fp3);

    const body = { p: "日记/2026-09-17.md", b: b64("# 今天\n\n写了一段内容") };
    const enc1 = await encryptObject(key1, body);
    const enc2 = await encryptObject(key1, body);
    assert("两次加密密文不同（随机 IV）", enc1.iv !== enc2.iv && enc1.ct !== enc2.ct);
    const dec = await decryptObject(key1, enc1);
    assert("加解密往返", dec.p === body.p && dec.b === body.b);
    // 防篡改
    const tampered = { iv: enc1.iv, ct: enc1.ct.slice(0, -2) + (enc1.ct.endsWith("AA") ? "BB" : "AA") };
    let threw = false;
    try {
        await decryptObject(key1, tampered);
    } catch {
        threw = true;
    }
    assert("篡改检测（GCM 认证失败抛错）", threw);
    // 错误密钥解不开
    let threw2 = false;
    try {
        await decryptObject(key3, enc1);
    } catch {
        threw2 = true;
    }
    assert("错误密钥无法解密", threw2);
    assert("随机密码生成", generateStrongPassphrase().length === 24 && generateStrongPassphrase() !== generateStrongPassphrase());

    // 大文件（2MB）性能与往返
    const big = new Uint8Array(2 * 1024 * 1024);
    for (let i = 0; i < big.length; i += 65536) {
        big.set(crypto.getRandomValues(new Uint8Array(Math.min(65536, big.length - i))), i);
    }
    const bigB64 = bytesToBase64(big);
    const t0 = Date.now();
    const bigEnc = await encryptObject(key1, { p: "big.bin", b: bigB64 });
    const bigDec = await decryptObject(key1, bigEnc);
    const t1 = Date.now();
    assert("2MB 加解密往返", bigDec.b === bigB64);
    console.log(`  （2MB 加解密耗时 ${t1 - t0}ms）`);

    console.log("== mergeMarkdown ==");
    const local1 = b64("A\nB\nC\n");
    const remote1 = b64("A\nB\nC\nD\nE\n");
    assert("远端是超集 → 取远端", str(mergeMarkdown(local1, remote1)) === "A\nB\nC\nD\nE\n");
    const local2 = b64("A\nB\nC\nD\n");
    const remote2 = b64("A\nB\nC\n");
    assert("本地是超集 → 取本地", str(mergeMarkdown(local2, remote2)) === "A\nB\nC\nD\n");
    const l3 = b64("标题\n\n本地新增段落\n");
    const r3 = b64("标题\n\n远端新增段落\n");
    const merged3 = str(mergeMarkdown(l3, r3));
    assert("双方独有 → 冲突标记合并且不丢内容", merged3.includes("本地新增段落") && merged3.includes("远端新增段落") && merged3.includes("<<<<<<< 本地版本") && merged3.includes(">>>>>>> 远端版本"));

    console.log(`\n结果：${passed} 通过，${failed} 失败`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
