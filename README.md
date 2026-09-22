# SyncVault

**[English](README.md) | [中文](README.zh-CN.md)**

SyncVault is a self-hosted, end-to-end encrypted, real-time two-way sync plugin for [Obsidian](https://obsidian.md), backed by your own CouchDB server. It is a fully localized (Chinese UI) rewrite inspired by the design of [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) (MIT License).

Your note contents and file names are encrypted (AES-256-GCM, key derived via PBKDF2) **before they leave your device**, so your server operator can only see ciphertext. Works on desktop and mobile.

> ⚠️ Before using SyncVault, **disable** other sync methods for the same vault — Obsidian Sync, iCloud, Nutstore, etc. — to avoid conflicts and data corruption. Back up your vault first.

---

## Features

| Feature | Description |
| --- | --- |
| Real-time two-way sync | Continuous CouchDB replication; changes sync on save, reconnects automatically after disconnects |
| End-to-end encryption | AES-256-GCM; key derived from your passphrase with PBKDF2 (310,000 iterations); **file content and file names are encrypted before leaving your device** — the server only sees ciphertext |
| Conflict handling | Markdown conflicts auto-merge (if one side is a superset, it merges directly; otherwise conflict markers merge both versions without losing content); other files keep the local version and save the remote one as a "（冲突 …）" copy |
| Localized Chinese UI | Server, encryption, sync, conflict and maintenance settings fully explained in Chinese |
| Multi-device | Fill in the same server + database name + passphrase on every device and they stay in sync |
| Safety nets | Periodic full sync, startup scan, ignore rules, oversized-file skipping |

## Installation

1. Copy this directory (`syncvault`, containing `main.js`, `manifest.json`, `styles.css`, `versions.json`) into:
   `YourVault/.obsidian/plugins/syncvault/`
2. Open Obsidian → Settings → Community plugins → enable **SyncVault**.
3. Complete the three-step setup on the plugin settings page (see below).

## Quick start

### 1. Prepare the server (CouchDB — skip if already deployed)

You have already deployed your sync server. Two things to confirm:

- **Enable CORS** (otherwise the Obsidian client cannot talk to the server). In CouchDB's `local.ini` / `default.ini`:

```
[couchdb]
; if you need to sync files larger than 5MB, raise the single-doc limit (default 8MB)
;max_document_size = 134217728

[chttpd]
; allow cross-origin
require_valid_user = false

[cors]
origins = *
credentials = true
methods = GET, PUT, POST, HEAD, DELETE
headers = accept, authorization, content-type, origin, referer, x-csrf-token
```

Then restart CouchDB.

- **HTTPS is strongly recommended** (reverse proxy such as Nginx/Caddy with a certificate) to protect the transport link. Even without HTTPS, end-to-end encryption guarantees the server cannot read your notes.

### 2. First device

1. Open plugin settings → "① 服务器":
   - Server address: `http://your-server:5984` or `https://sync.example.com`
   - Username / password: your CouchDB account
   - Database name: anything, e.g. `obsidian-vault` (must be the same on all devices)
2. Click **测试连接** (Test connection) — the database is created automatically if it does not exist.
3. Under "② 端到端加密", enable encryption and set / generate a **passphrase**.
4. Click **启动同步** (Start sync), then **全量上传到服务器** (Full upload) to push your vault to the server.

### 3. Other devices

1. Install the plugin and fill in the **same** server, account, database name and passphrase.
2. Test connection → start sync → click **从服务器全量下载** (Full download) to pull everything.
3. Real-time two-way sync runs from then on.

> If you do not want the new device to overwrite local files wholesale, start live sync first and run "立即同步" (Sync now) only for individual files.

## End-to-end encryption details

- Algorithm: AES-256-GCM (authenticated, detects tampering).
- Key derivation: PBKDF2-SHA256, 310,000 iterations; the salt is derived deterministically from the **database name**, so the same database + same passphrase derives the **same key** on every device — no key exchange files needed.
- Scope: **file content + file path** (the whole document body is encrypted); the server only sees metadata such as content hashes, sizes and mtimes.
- The key stays in the local plugin config (`data.json`) and is **never uploaded**; keep your vault and passphrase safe.
- ⚠️ **Losing the passphrase means the data can never be decrypted again**; ⚠️ after changing the passphrase or database name, you must first "重置本地数据库" (Reset local database) under the old config and re-upload, otherwise old data cannot be decrypted (the plugin detects the key fingerprint and blocks the wrong sync).

## Conflict handling

- When the same file is modified on two devices:
  - **Markdown**: if one side is a superset of the other (line-based), the merge result is taken automatically; otherwise both versions are merged into the original file with `<<<<<<< 本地版本 / ======= / >>>>>>> 远端版本` markers so nothing is lost and you can review manually.
  - **Other files**: the local version is kept and the remote version is saved as `original-name（冲突 timestamp）.ext`.
- You can disable auto-merge under "④ 冲突处理" (always save a conflict copy instead).

## Commands

| Command | Purpose |
| --- | --- |
| 启动同步 / 停止同步 (Start/Stop sync) | Manually control the sync engine |
| 立即同步 (Sync now) | One manual two-way sync |
| 全量上传到服务器 (Full upload) | First-device initialization |
| 从服务器全量下载 (Full download) | Second-device initialization |
| 重置本地同步数据库 (Reset local sync database) | Clear the local sync cache (does not affect the server or your notes) |

The refresh icon in the left ribbon = sync now; the status bar at the bottom shows sync status and up/download counters.

## Settings reference

| Setting | Default | Description |
| --- | --- | --- |
| 实时同步 (Live sync) | On | Continuous replication with auto-reconnect |
| 保存后自动同步 (Sync on save) | On | Sync immediately after Ctrl+S |
| 定时完整同步 (Periodic full sync) | 10 min | Fallback full sync; 0 disables |
| 启动时扫描 (Startup scan) | On | Picks up external changes made while the plugin was off |
| 最大同步文件大小 (Max file size) | 5 MB | Larger files are skipped (raise `max_document_size` on the server to relax) |
| 忽略规则 (Ignore regex) | empty | Matching paths are not synced, e.g. `^附件/` |
| 同步配置目录 (Sync config dir) | Off | Sync settings/themes/snippets (excluding the plugin's own `data.json`) |

## FAQ

**Connection fails / keeps retrying?**

1. Click "测试连接" first and read the error: 401/403 means wrong credentials; 404 means a wrong address; cannot connect → check the port and firewall.
2. If "测试连接" succeeds but replication keeps failing, CORS is usually not configured — enable CORS in CouchDB as above and restart.

**Need to sync files larger than 5MB?**

Raise the plugin's "最大同步文件大小" and increase `max_document_size` in CouchDB (e.g. 134217728 = 128MB), then restart.

**Sync reports "凭据不一致" after toggling encryption / changing the passphrase?**

First "重置本地数据库" (Reset local database), then re-run "全量上传" or "全量下载". Note: data uploaded with a new passphrase cannot be decrypted by devices using the old one.

**Will my notes ever appear in plaintext on the server?**

No, when end-to-end encryption is on — ciphertext is only decrypted on your devices. The passphrase never leaves your machine.

**Compatible with official Obsidian Sync?**

No, and they should not be used together. Keep only one sync solution.

## Development

```
npm install        # install dependencies
npm run dev        # watch build (development)
npm run build      # production build → main.js
npm run typecheck  # type check
node build-test.mjs && node .test-build/unit.test.cjs        # unit tests
node build-test.mjs && node .test-build/integration.test.cjs # replication integration tests
```

## Project structure

```
syncvault/
├── manifest.json      # plugin manifest (id/name/version)
├── main.js            # build output (the file Obsidian loads)
├── styles.css         # styles
├── versions.json      # version compatibility
├── src/
│   ├── main.ts        # plugin entry: commands, status bar, vault events
│   ├── syncEngine.ts  # sync engine: PouchDB + CouchDB live replication, echo suppression, conflict handling
│   ├── crypto.ts      # end-to-end encryption (AES-256-GCM + PBKDF2)
│   ├── conflict.ts    # conflict sweep (_conflicts multi-revision handling)
│   ├── merge.ts       # Markdown line-level merge (pure functions)
│   ├── settings.ts    # localized Chinese settings UI
│   ├── types.ts       # types and default config
│   └── utils.ts       # utilities
└── test/              # unit + integration tests
```

## License

MIT. Inspired by [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) (MIT).
