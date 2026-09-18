# 发布指南（路径 C）

把插件发布到 GitHub，手机上用 **BRAT** 安装/更新。两种形态：

- **私有仓库 + BRAT** → 仅自己可用（推荐，符合"只自己用"的需求）
- **公开仓库 + 社区市场** → 全世界可用

---

## 一、准备仓库（一次性，两种形态共用）

```bash
# 在插件目录内执行（本仓库已 init 并提交，直接加远程即可）
git remote add origin https://github.com/Tiga89/syncvault.git
git push -u origin main
```

仓库根目录已包含：`manifest.json`、`main.js`、`styles.css`、`versions.json`、`README.md`、`LICENSE`、`.github/workflows/release.yml`。

---

## 二、形态 A：私有仓库 + BRAT（仅自己用）

1. **GitHub 新建仓库**：Settings → New repository → 名称 `syncvault` → **Private**（私有）。
2. 执行上面的 `git remote add` + `git push`。
3. 生成访问令牌（手机端安装私有插件用）：
   GitHub → 头像 → Settings → Developer settings → Personal access tokens → Tokens (classic) →
   Generate new token → 勾选 `repo` 权限 → 生成后**复制保存**（只显示一次）。
4. 手机 Obsidian：设置 → 第三方插件 → 关闭受限模式 → 社区插件市场搜索 **BRAT** 安装。
5. BRAT 设置 → **Add Beta plugin** → 粘贴 `https://github.com/Tiga89/syncvault`。
6. 私有仓库需在 BRAT 设置里为插件填入**步骤 3 的令牌**（BRAT 设置页有 token 输入框）。
7. 安装后插件列表出现「SyncVault 实时同步」，启用即可。

以后电脑端改了代码 `git push`，手机上在 BRAT 里点 **Check for updates** 即可更新。
（也可打 tag 触发 GitHub Actions 自动构建 Release，BRAT 会优先用 Release。）

---

## 三、形态 B：公开仓库 + 社区市场（全世界可用）

1. GitHub 仓库改为 **Public**。
2. 打标签触发自动发布（GitHub Actions 会构建并生成 Release）：

   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```

   到仓库 Actions 页确认构建通过，Release 页应出现 `main.js`、`manifest.json`、`styles.css`、
   `versions.json` 和 `syncvault.zip`。
3. 提交到社区目录（官方新流程）：
   - 打开 Obsidian 官网的插件开发者仪表盘（developer dashboard），登录后连接 GitHub 账号，
     选择本仓库提交；
   - 也可走经典 PR 流程：Fork `obsidianmd/obsidian-releases`，在 `community-plugins.json`
     末尾添加条目，提交 PR 等待审核。
4. 审核通过后约 24 小时内上架，全平台 Obsidian 用户可搜到。

### 提交前合规自查（官方要求）

- [x] 仓库根目录有 `README.md`（用途 + 使用方法）
- [x] 仓库根目录有 `LICENSE`（已含原项目 Self-hosted LiveSync 的 MIT 版权声明）
- [x] `manifest.json` / `versions.json` 完整（id 与仓库一致）
- [x] 有对应版本的 GitHub Release，且含 `main.js`、`manifest.json`、`styles.css`
- [x] 说明文字 ≤250 字符、以动词开头、无 emoji

> 注意：社区市场没有"私有上架"选项，发布即公开；若只想自己用，用形态 A。

---

## 四、许可证与署名（侵权合规要点）

- 原项目 Self-hosted LiveSync 为 **MIT License**：允许修改、再分发、商用，**必须保留原版权声明**。
- 本插件 `LICENSE` 已包含原项目作者（vrtmrz）的署名与本项目声明，满足 MIT 要求。
- 插件名保留 "Livesync" 无版权问题，但请勿声称是原项目的官方版本。
