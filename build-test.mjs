// 把单元测试打成单文件 CJS，便于在 Node 中直接运行
import esbuild from "esbuild";
import fs from "node:fs";

fs.mkdirSync(".test-build", { recursive: true });
await esbuild.build({
    entryPoints: ["test/unit.test.mjs"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile: ".test-build/unit.test.cjs",
    logLevel: "warning",
});
await esbuild.build({
    entryPoints: ["test/integration.test.mjs"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile: ".test-build/integration.test.cjs",
    logLevel: "warning",
});
console.log("测试 bundle 完成");
