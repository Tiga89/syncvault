//@ts-check
import esbuild from "esbuild";
import process from "process";
import fs from "node:fs";

const prod = process.argv[2] === "production";
const manifestJson = JSON.parse(fs.readFileSync("./manifest.json", "utf8"));

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    define: {
        MANIFEST_VERSION: `"${manifestJson.version}"`,
        global: "window",
    },
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
    ],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    platform: "browser",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod,
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}
