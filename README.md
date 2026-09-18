# SyncVault・syncvault

**SyncVault** is a self-hosted, end-to-end encrypted, real-time two-way sync plugin for Obsidian, backed by your own CouchDB server. It is a fully localized (Chinese UI) rewrite inspired by [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) (MIT License). Note contents and file names are encrypted (AES-256-GCM, PBKDF2-derived key) before leaving your device, so your server operator only sees ciphertext. Works on desktop and mobile.

自托管 Obsidian 实时双向同步插件，全中文界面。基于开源项目

[Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync)（MIT License）的核心思路重写，

聚焦个人自用场景：**实时同步 + 端到端加密 + 冲突处理**，配置一目了然，无多余功能。

> ⚠️ 使用前请
>
> **关闭**
>
>  Obsidian 官方同步（Obsidian Sync）、iCloud、坚果云等其他同步方案，
> 避免多套同步互相覆盖造成数据错乱。建议先备份 Vault。



***

## 功能



| 功能     | 说明                                                                   |
| ------ | -------------------------------------------------------------------- |
| 实时双向同步 | 基于 CouchDB 的持续复制（live replication），保存即同步，断线自动重连                      |
| 端到端加密  | AES-256-GCM，密钥由密码经 PBKDF2（31 万次迭代）派生；**文件内容与文件名在离开本机前即加密**，服务器只能看到密文 |
| 冲突处理   | Markdown 冲突自动合并（一方为超集时直接合并，否则冲突标记合并不丢内容）；其他文件冲突自动保存「（冲突 …）」副本        |
| 中文配置界面 | 服务器、加密、同步、冲突、维护操作全中文说明                                               |
| 多设备    | 所有设备填相同的服务器 + 数据库名 + 加密密码即可互相同步                                      |
| 安全兜底   | 定时完整同步、启动扫描、忽略规则、超大文件跳过                                              |

## 安装



1. 将本目录（`syncvault`，含 `main.js`、`manifest.json`、`styles.css`、`versions.json`）复制到：

   `你的库/.obsidian/plugins/syncvault/`

2. 打开 Obsidian → 设置 → 第三方插件 → 开启「SyncVault」

3. 在插件设置页完成三步配置（见下）

## 快速开始

### 1. 准备服务器（CouchDB，已部署则跳过）

你已部署好同步服务器，只需确认两点：



* **启用 CORS**（否则 Obsidian 客户端无法与服务器通信）。在 CouchDB 的

  `local.ini` / `default.ini` 中添加：



```
\[couchdb]

; 若需同步超过 5MB 的文件，调大单文档上限（默认 8MB）

;max\_document\_size = 134217728

\[chttpd]

; 允许跨域

require\_valid\_user = false

\[cors]

origins = \*

credentials = true

methods = GET, PUT, POST, HEAD, DELETE

headers = accept, authorization, content-type, origin, referer, x-csrf-token
```

然后重启 CouchDB。



* **强烈建议使用 HTTPS**（反向代理如 Nginx/Caddy 加证书），保证传输链路加密。

  即使不使用 HTTPS，端到端加密也能保证服务器上无法读取笔记内容。

### 2. 第一台设备



1. 打开插件设置 →「① 服务器设置」：

* 服务器地址：`http://你的服务器:5984` 或 `https://sync.example.com`

* 用户名 / 密码：CouchDB 账号

* 数据库名：任意，如 `obsidian-vault`（所有设备一致）

1. 点击「**测试连接**」—— 若数据库不存在会自动创建。

2. 在「② 端到端加密」开启加密并设置 / 生成**加密密码**。

3. 点击「**启动同步**」，然后「**全量上传**」把当前库推送到服务器。

### 3. 其他设备



1. 安装插件，填**相同的**服务器、账号、数据库名、加密密码。

2. 测试连接 → 启动同步 → 点击「**全量下载**」拉取全部内容。

3. 之后即可实时双向同步。

> 若新设备不想全量覆盖本地已有文件，可先启动实时同步，仅对个别文件执行「立即同步」。

## 端到端加密说明



* 加密算法：AES-256-GCM（带认证标签，可检测篡改）。

* 密钥派生：PBKDF2-SHA256，310,000 次迭代；盐由「数据库名」确定性派生，

  因此同一数据库 + 同一密码在所有设备推导出**同一把密钥**，无需交换密钥文件。

* 加密范围：**文件内容 + 文件路径**（文档体整体加密）；服务器可见的仅剩

  内容哈希、大小、修改时间等元数据。

* 密钥保存在本机插件配置（`data.json`）中，**不会上传**；请妥善保管 Vault 与密码。

* ⚠️ **忘记密码 = 数据永久无法解密**；⚠️ 修改密码或数据库名后，必须先在旧配置下

  「重置本地数据库」再重新上传，否则旧数据无法解密（插件会检测密钥指纹并阻止错误同步）。

## 冲突处理



* 同一文件在两台设备都被修改时：


  * **Markdown**：若一方是另一方的超集（按行）→ 自动取合并结果；

    否则用 `<<<<<<< 本地版本 / ======= / >>>>>>> 远端版本` 标记合并进原文件，双方内容都不丢失，便于人工复核。

  * **其他文件**：本地版本保留，远端版本另存为 `原文件名（冲突 时间戳）.ext`。

* 可在「④ 冲突处理」关闭自动合并（一律存冲突副本）。

## 常用命令



| 命令          | 作用                    |
| ----------- | --------------------- |
| 启动同步 / 停止同步 | 手动控制同步引擎              |
| 立即同步        | 手动双向同步一次              |
| 全量上传到服务器    | 第一台设备初始化              |
| 从服务器全量下载    | 第二台设备初始化              |
| 重置本地同步数据库   | 清空本地同步缓存（不影响服务器与笔记文件） |

功能区（左侧栏）的刷新图标 = 立即同步；底部状态栏显示同步状态与上传 / 下载计数。

## 配置项速查



| 配置              | 默认    | 说明                                    |
| --------------- | ----- | ------------------------------------- |
| 实时同步            | 开     | 持续复制，断线自动重连                           |
| 保存后自动同步         | 开     | Ctrl+S 后立即同步                          |
| 定时完整同步          | 10 分钟 | 兜底完整同步；0 关闭                           |
| 启动时扫描           | 开     | 补同步插件关闭期间的外部修改                        |
| 最大同步文件大小        | 5 MB  | 超过则跳过（可调大服务器 `max_document_size` 后放宽） |
| 忽略规则（正则）        | 空     | 匹配的路径不同步，如 `^附件/`                     |
| 同步 .obsidian 配置 | 关     | 同步设置 / 主题 / 片段（不含本插件 data.json）       |

## 常见问题

**连接失败 / 一直重试？**



1. 先点「测试连接」看具体报错：401/403 是账号密码错误；404 是地址不对；无法连接请检查端口与防火墙。

2. 若「测试连接」成功但复制一直失败，通常是 **CORS 未配置**，按上文在 CouchDB 中启用 CORS 并重启。

**需要同步大于 5MB 的文件？**

调大插件「最大同步文件大小」，并在 CouchDB 中把 `max_document_size` 调大（如 134217728 = 128MB）后重启。

**加密开关 / 密码改了之后同步报 “凭据不一致”？**

先「重置本地数据库」，再重新「全量上传」或「全量下载」。注意：以新密码上传的数据，旧密码设备将无法解密。

**我的笔记会不会出现在服务器明文里？**

开启端到端加密后不会 —— 密文只在你的设备上解密。加密密码不出本机。

**与官方 Obsidian Sync 兼容吗？**

不兼容，且不应同时使用。请只保留一种同步方案。

## 开发者



```
npm install        # 安装依赖

npm run dev        # 监听构建（开发）

npm run build      # 生产构建 → main.js

npm run typecheck  # 类型检查

node build-test.mjs && node .test-build/unit.test.cjs        # 单元测试

node build-test.mjs && node .test-build/integration.test.cjs # 复制链路集成测试
```

## 目录结构



```
syncvault/

├── manifest.json      # 插件清单（id/名称/版本）

├── main.js            # 构建产物（Obsidian 实际加载的文件）

├── styles.css         # 样式

├── versions.json      # 版本兼容

├── src/

│   ├── main.ts        # 插件入口：命令、状态栏、Vault 事件

│   ├── syncEngine.ts  # 同步引擎：PouchDB + CouchDB 实时复制、防回声、冲突处理

│   ├── crypto.ts      # 端到端加密（AES-256-GCM + PBKDF2）

│   ├── conflict.ts    # 冲突清扫（\_conflicts 多版本处理）

│   ├── merge.ts       # Markdown 行级合并（纯函数）

│   ├── settings.ts    # 中文设置界面

│   ├── types.ts       # 类型与默认配置

│   └── utils.ts       # 工具函数

└── test/              # 单元 + 集成测试
```

## License

MIT。参考项目：[Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync)（MIT）。