/**
 * 界面国际化：中文 / English 文案表
 *
 * 设计约束：仅覆盖用户可见的 UI 文案（设置页、命令、状态栏、主要按钮/提示）。
 * 同步日志为运行时记录（历史数据），保持生成时的语言，不做翻译映射。
 */
export type Lang = "zh" | "en";

export type StrKey =
    // 设置页分节
    | "sec_server"
    | "sec_quickstart_desc"
    | "sec_encrypt"
    | "sec_sync"
    | "sec_conflict"
    | "sec_maint"
    | "sec_log"
    | "sec_mobile"
    | "sec_selective"
    | "sec_lang"
    | "sec_security"
    // 服务器
    | "server_url"
    | "server_url_desc"
    | "username"
    | "password"
    | "db_name"
    | "db_name_desc"
    | "conn_status"
    | "conn_status_desc"
    | "test_conn"
    | "testing"
    | "start_sync"
    | "stop_sync"
    // 状态
    | "st_stopped"
    | "st_connecting"
    | "st_idle"
    | "st_syncing"
    | "st_error"
    // 加密
    | "encrypt_toggle"
    | "encrypt_desc"
    | "passphrase"
    | "passphrase_desc"
    | "gen_password"
    | "gen_password_done"
    | "show"
    | "hide"
    | "fp_not_encrypted"
    | "fp_no_pass"
    | "fp_fingerprint"
    | "fp_pending"
    // 同步设置
    | "live_sync"
    | "live_sync_desc"
    | "sync_on_save"
    | "sync_on_save_desc"
    | "auto_start"
    | "auto_start_desc"
    | "periodic"
    | "periodic_desc"
    | "startup_scan"
    | "startup_scan_desc"
    | "max_size"
    | "max_size_desc"
    | "ignore_regex"
    | "ignore_regex_desc"
    | "sync_config_dir"
    | "sync_config_dir_desc"
    // 冲突
    | "auto_merge"
    | "auto_merge_desc"
    // 维护
    | "sync_now"
    | "sync_now_desc"
    | "full_upload"
    | "full_upload_desc"
    | "uploading"
    | "full_download"
    | "full_download_desc"
    | "downloading"
    | "reset_db"
    | "reset_db_desc"
    | "reset_confirm_title"
    | "reset_confirm_body"
    | "cancel"
    | "confirm_reset"
    // 日志
    | "clear_log"
    // 移动端 / 选择性同步 / 语言
    | "pull_on_start"
    | "pull_on_start_desc"
    | "exclude_folders"
    | "exclude_folders_desc"
    | "ui_lang"
    | "ui_lang_desc"
    // 数据安全（恢复密钥）
    | "export_recovery"
    | "export_recovery_desc"
    | "recovery_password"
    | "recovery_password_desc"
    | "recovery_password_required"
    | "recovery_file"
    | "recovery_file_desc"
    | "do_export_recovery"
    | "recovery_exported"
    | "recovery_copy_hint"
    | "do_import_recovery"
    | "recovery_import_ok"
    | "recovery_import_fail"
    // 诊断
    | "cmd_export_diag"
    | "diag_copied"
    | "diag_failed"
    // 命令
    | "cmd_start"
    | "cmd_stop"
    | "cmd_sync_now"
    | "cmd_push_all"
    | "cmd_pull_all"
    | "cmd_reset"
    // 其他
    | "ribbon_tooltip"
    | "lang_zh"
    | "lang_en";

const STRINGS: Record<Lang, Record<StrKey, string>> = {
    zh: {
        sec_server: "① 服务器",
        sec_quickstart_desc:
            "三步完成配置：① 填写服务器地址与账号 → ② 填写数据库名并「测试连接」→ ③ 打开端到端加密、设置密码 → 点击「启动同步」。所有设备使用相同配置即可互相同步。",
        sec_encrypt: "② 端到端加密",
        sec_sync: "③ 同步",
        sec_conflict: "④ 冲突处理",
        sec_maint: "⑤ 维护操作",
        sec_log: "⑥ 同步日志",
        sec_mobile: "⑦ 移动端",
        sec_selective: "⑧ 选择性同步",
        sec_lang: "⑨ 界面语言",
        sec_security: "⑩ 数据安全",
        server_url: "服务器地址",
        server_url_desc:
            "CouchDB 服务地址，例如 http://192.168.1.10:5984 或 https://sync.example.com。生产环境建议使用 HTTPS 加密传输。",
        username: "用户名",
        password: "密码",
        db_name: "数据库名",
        db_name_desc:
            "CouchDB 中用于存储笔记的数据库。所有设备必须一致。若不存在，插件会在测试连接时尝试自动创建。",
        conn_status: "连接状态",
        conn_status_desc: "查看服务器连接与同步状态。",
        test_conn: "测试连接",
        testing: "测试中…",
        start_sync: "▶ 启动同步",
        stop_sync: "⏹ 停止同步",
        st_stopped: "⏹ 已停止",
        st_connecting: "🔌 连接中",
        st_idle: "💤 待同步",
        st_syncing: "⚡ 同步中",
        st_error: "⚠ 同步出错",
        encrypt_toggle: "启用端到端加密",
        encrypt_desc:
            "开启后，所有笔记内容与文件名会在离开本机前使用 AES-256-GCM 加密（密钥由密码经 PBKDF2 派生）。服务器管理员、机房运维只能看到密文，无法读取你的笔记。",
        passphrase: "加密密码",
        passphrase_desc:
            "用于派生加密密钥，所有设备必须填写相同密码与数据库名。请务必牢记：忘记密码将无法解密任何已同步的数据；密码保存在本机配置文件中，请妥善保管 Vault。",
        gen_password: "生成随机密码",
        gen_password_done: "已生成随机密码，请复制并妥善保存（所有设备需一致）",
        show: "显示",
        hide: "隐藏",
        fp_not_encrypted: "🔓 未启用加密：内容将以明文存储在服务器数据库中。",
        fp_no_pass: "⚠️ 未设置加密密码。",
        fp_fingerprint: "🔐 密钥指纹：{fp} （各设备此值应一致）",
        fp_pending: "（尚未生成，启动同步后自动生成）",
        live_sync: "实时同步",
        live_sync_desc: "打开后持续监控变更并双向复制；断线自动重连。关闭后仅按定时任务或手动同步。",
        sync_on_save: "保存后自动同步",
        sync_on_save_desc: "文件保存（Ctrl+S）后立即触发同步。",
        auto_start: "启动时自动开始同步",
        auto_start_desc: "打开 Obsidian 后自动启动同步。",
        periodic: "定时完整同步（分钟）",
        periodic_desc: "每隔指定时间执行一次完整双向同步，作为实时同步的兜底。0 表示关闭。",
        startup_scan: "启动时扫描本地库",
        startup_scan_desc:
            "启动同步时检查磁盘文件是否有遗漏变更（安全网，防止插件关闭期间的外部修改漏同步）。",
        max_size: "最大同步文件大小（MB）",
        max_size_desc:
            "超过该大小的文件将被跳过（CouchDB 单文档大小有限制，可同时调大服务器 max_document_size）。",
        ignore_regex: "忽略规则（正则）",
        ignore_regex_desc: "匹配的路径将不同步。作用于完整路径，例如：^附件/ 表示忽略“附件”目录。留空表示全部同步。",
        sync_config_dir: "同步配置目录（{cfg}）",
        sync_config_dir_desc:
            "同步设置、主题、代码片段等（不包括本插件自身的配置文件）。建议在普通笔记同步稳定后再开启。",
        auto_merge: "自动合并 Markdown 冲突",
        auto_merge_desc:
            "当同一篇笔记在两台设备上都被修改时：若一方是另一方的超集则自动合并；否则用冲突标记（<<<<<<< / ======= / >>>>>>>）合并到原文件，双方内容都不丢失。关闭后，远端版本将另存为「（冲突 …）」副本。",
        sync_now: "立即同步",
        sync_now_desc: "手动执行一次完整的双向同步。",
        full_upload: "全量上传",
        full_upload_desc: "把当前 Vault 的所有文件上传到服务器（覆盖远端同路径文件）。适合第一台设备初始化。",
        uploading: "上传中…",
        full_download: "全量下载",
        full_download_desc: "从服务器下载全部内容并覆盖本地同路径文件。适合第二台设备初始化。",
        downloading: "下载中…",
        reset_db: "重置本地数据库",
        reset_db_desc:
            "清空本机的同步数据库与所有远端缓存记录（不影响服务器数据与本地笔记文件）。加密密码或数据库名变更后必须重置。",
        reset_confirm_title: "确认重置本地同步数据库？",
        reset_confirm_body:
            "这将清空本机同步缓存并停止同步。服务器数据与本地笔记文件不会受影响。重置后请重新「启动同步」（建议随后执行全量上传或全量下载）。",
        cancel: "取消",
        confirm_reset: "确认重置",
        clear_log: "清空日志",
        pull_on_start: "启动后自动同步一次",
        pull_on_start_desc:
            "打开 Obsidian 并启动同步后，自动执行一次完整双向同步。移动端 App 切入后台会被系统挂起，开启此项可确保每次打开 App 都能拿到最新内容。",
        exclude_folders: "额外排除的文件夹",
        exclude_folders_desc:
            "每行一个文件夹路径（相对库根目录，例如：附件/、备份/），这些文件夹下的文件将不同步。",
        ui_lang: "界面语言",
        ui_lang_desc: "选择设置界面、命令与状态栏的显示语言（同步日志保持生成时的语言）。",
        export_recovery: "导出恢复密钥",
        export_recovery_desc:
            "加密密码是解密数据的唯一凭据。为防止忘记密码导致数据永久无法解密，可导出一份用独立恢复密码加密的密钥备份文件，忘记主密码时用它恢复。",
        recovery_password: "恢复密码",
        recovery_password_desc: "用于加密/解密恢复密钥文件，请单独牢记（不要与加密密码相同）。",
        recovery_password_required: "请输入恢复密码",
        recovery_file: "恢复密钥内容",
        recovery_file_desc: "粘贴恢复密钥文件的完整内容。",
        do_export_recovery: "导出",
        recovery_exported: "恢复密钥已生成，已复制到剪贴板。请粘贴保存为文件并妥善保管。",
        recovery_copy_hint: "（恢复密钥已复制到剪贴板）",
        do_import_recovery: "恢复",
        recovery_import_ok: "恢复成功：已从恢复密钥中还原加密密码。",
        recovery_import_fail: "恢复失败：恢复密码错误或文件内容无效。",
        cmd_export_diag: "导出诊断信息",
        diag_copied: "诊断信息已复制到剪贴板，请粘贴发送给支持人员。",
        diag_failed: "导出诊断信息失败：",
        cmd_start: "启动同步",
        cmd_stop: "停止同步",
        cmd_sync_now: "立即同步",
        cmd_push_all: "全量上传到服务器",
        cmd_pull_all: "从服务器全量下载",
        cmd_reset: "重置本地同步数据库",
        ribbon_tooltip: "SyncVault：立即同步",
        lang_zh: "简体中文",
        lang_en: "English",
    },
    en: {
        sec_server: "① Server",
        sec_quickstart_desc:
            "Three steps: ① Fill in the server address and account → ② Enter the database name and click \"Test connection\" → ③ Enable end-to-end encryption, set a passphrase → click \"Start sync\". Use the same settings on every device.",
        sec_encrypt: "② End-to-end encryption",
        sec_sync: "③ Sync",
        sec_conflict: "④ Conflict handling",
        sec_maint: "⑤ Maintenance",
        sec_log: "⑥ Sync log",
        sec_mobile: "⑦ Mobile",
        sec_selective: "⑧ Selective sync",
        sec_lang: "⑨ Interface language",
        sec_security: "⑩ Data safety",
        server_url: "Server address",
        server_url_desc:
            "CouchDB server address, e.g. http://192.168.1.10:5984 or https://sync.example.com. HTTPS is recommended for production.",
        username: "Username",
        password: "Password",
        db_name: "Database name",
        db_name_desc:
            "The CouchDB database that stores your notes. Must be identical on all devices. It is created automatically when the database does not exist.",
        conn_status: "Connection status",
        conn_status_desc: "Check the server connection and sync status.",
        test_conn: "Test connection",
        testing: "Testing…",
        start_sync: "▶ Start sync",
        stop_sync: "⏹ Stop sync",
        st_stopped: "⏹ Stopped",
        st_connecting: "🔌 Connecting",
        st_idle: "💤 Idle",
        st_syncing: "⚡ Syncing",
        st_error: "⚠ Sync error",
        encrypt_toggle: "Enable end-to-end encryption",
        encrypt_desc:
            "When enabled, note contents and file names are encrypted with AES-256-GCM before leaving your device (key derived from the passphrase via PBKDF2). Server operators only see ciphertext.",
        passphrase: "Passphrase",
        passphrase_desc:
            "Used to derive the encryption key; must be identical on all devices. If you forget it, synced data can never be decrypted. The passphrase is stored in the local config; keep your vault safe.",
        gen_password: "Generate random passphrase",
        gen_password_done: "Random passphrase generated. Copy and store it safely (must be identical on all devices)",
        show: "Show",
        hide: "Hide",
        fp_not_encrypted: "🔓 Encryption disabled: contents are stored as plaintext on the server.",
        fp_no_pass: "⚠️ No passphrase set.",
        fp_fingerprint: "🔐 Key fingerprint: {fp} (should match on every device)",
        fp_pending: "(not generated yet; it will be generated after sync starts)",
        live_sync: "Live sync",
        live_sync_desc: "Continuously watch for changes and replicate both ways; reconnects automatically after disconnects. When off, only periodic or manual sync runs.",
        sync_on_save: "Sync on save",
        sync_on_save_desc: "Trigger a sync immediately after a file is saved (Ctrl+S).",
        auto_start: "Start sync on startup",
        auto_start_desc: "Start syncing automatically when Obsidian opens.",
        periodic: "Periodic full sync (minutes)",
        periodic_desc: "Runs a full two-way sync every N minutes as a safety net. 0 disables it.",
        startup_scan: "Scan vault on startup",
        startup_scan_desc:
            "Checks for missed changes on disk when sync starts (safety net for external modifications while the plugin was off).",
        max_size: "Max file size (MB)",
        max_size_desc:
            "Files larger than this are skipped (CouchDB has a single-document limit; raise max_document_size on the server as well).",
        ignore_regex: "Ignore rules (regex)",
        ignore_regex_desc:
            "Matching paths are not synced. Matches the full path, e.g. ^Attachments/ ignores the \"Attachments\" folder. Empty means sync everything.",
        sync_config_dir: "Sync config dir ({cfg})",
        sync_config_dir_desc:
            "Sync settings, themes and snippets (excluding this plugin's own config). Recommended after normal notes sync reliably.",
        auto_merge: "Auto-merge Markdown conflicts",
        auto_merge_desc:
            "When a note is modified on two devices: if one side is a superset of the other, it merges automatically; otherwise both versions are merged into the original file with conflict markers (<<<<<<< / ======= / >>>>>>>) so nothing is lost. When off, the remote version is saved as a \"（冲突 …）\" copy.",
        sync_now: "Sync now",
        sync_now_desc: "Run one complete two-way sync manually.",
        full_upload: "Full upload",
        full_upload_desc: "Upload all files in the vault to the server (overwrites remote files with the same path). For first-device initialization.",
        uploading: "Uploading…",
        full_download: "Full download",
        full_download_desc: "Download everything from the server and overwrite local files with the same path. For second-device initialization.",
        downloading: "Downloading…",
        reset_db: "Reset local database",
        reset_db_desc:
            "Clears the local sync database and cached records (does not affect server data or your notes). Required after changing the passphrase or database name.",
        reset_confirm_title: "Reset the local sync database?",
        reset_confirm_body:
            "This clears the local sync cache and stops syncing. Server data and notes are not affected. Restart sync afterwards (a full upload or full download is recommended).",
        cancel: "Cancel",
        confirm_reset: "Reset",
        clear_log: "Clear log",
        pull_on_start: "Sync once after startup",
        pull_on_start_desc:
            "Runs one complete two-way sync after sync starts. Mobile apps are suspended in the background, so this ensures you always get the latest content when you open Obsidian.",
        exclude_folders: "Extra folders to exclude",
        exclude_folders_desc:
            "One folder per line (relative to the vault root, e.g. Attachments/, Backups/). Files under these folders are not synced.",
        ui_lang: "Interface language",
        ui_lang_desc: "Language for the settings UI, commands and status bar (the sync log keeps the language it was written in).",
        export_recovery: "Export recovery key",
        export_recovery_desc:
            "The passphrase is the only credential to decrypt your data. To avoid permanent data loss if you forget it, export a recovery file encrypted with a separate recovery password.",
        recovery_password: "Recovery password",
        recovery_password_desc: "Encrypts/decrypts the recovery file. Store it separately and do not reuse your passphrase.",
        recovery_password_required: "Please enter a recovery password",
        recovery_file: "Recovery key content",
        recovery_file_desc: "Paste the full content of the recovery key file.",
        do_export_recovery: "Export",
        recovery_exported: "Recovery key generated and copied to the clipboard. Paste and save it as a file, and keep it safe.",
        recovery_copy_hint: "(recovery key copied to clipboard)",
        do_import_recovery: "Restore",
        recovery_import_ok: "Restored: the passphrase has been recovered from the recovery key.",
        recovery_import_fail: "Restore failed: wrong recovery password or invalid recovery file.",
        cmd_export_diag: "Export diagnostics",
        diag_copied: "Diagnostics copied to the clipboard. Paste and send them to support.",
        diag_failed: "Failed to export diagnostics: ",
        cmd_start: "Start sync",
        cmd_stop: "Stop sync",
        cmd_sync_now: "Sync now",
        cmd_push_all: "Full upload to server",
        cmd_pull_all: "Full download from server",
        cmd_reset: "Reset local sync database",
        ribbon_tooltip: "SyncVault: sync now",
        lang_zh: "简体中文",
        lang_en: "English",
    },
};

/** 获取当前语言的文案；{key} 占位符用 vars 替换 */
export function t(lang: Lang, key: StrKey, vars?: Record<string, string | number>): string {
    let s = STRINGS[lang][key] ?? STRINGS.zh[key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            s = s.split(`{${k}}`).join(String(v));
        }
    }
    return s;
}

/** 校验 zh/en 文案键完全一致（测试用） */
export function checkI18nCompleteness(): { missingZh: string[]; missingEn: string[] } {
    const zhKeys = Object.keys(STRINGS.zh) as StrKey[];
    const enKeys = Object.keys(STRINGS.en) as StrKey[];
    const missingZh = enKeys.filter((k) => !zhKeys.includes(k));
    const missingEn = zhKeys.filter((k) => !enKeys.includes(k));
    return { missingZh, missingEn };
}
