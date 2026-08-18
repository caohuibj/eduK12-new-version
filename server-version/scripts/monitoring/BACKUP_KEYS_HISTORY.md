# 备份加密密钥历史说明

## 创建日期: 2026-06-19

## 背景

`backup-config.env` 文件中曾包含 **870 个重复的 `BACKUP_ENCRYPTION_KEY=` 行**，
这是 `backup-enhanced.sh` 的 `init()` 函数 bug 导致的：每次检测到 key 为空就追加新 key。

这些历史 key 对应 `/backup/ptool/encrypted/` 中 2026-06-15 ~ 2026-06-19 期间的加密备份。
由于无法确定每个备份使用的是哪个 key，这些旧备份已于 2026-06-19 全部删除。

## 历史key文件位置

- `backup-config.env.historical-keys-20260619` — server-version版，870个历史key
- `backup-config.env.historical-keys-old-scripts-20260619` — 旧版scripts/monitoring目录，37个历史key

## 旧版脚本清理 (2026-06-19)

旧版 `/opt/ptool/scripts/monitoring/` 目录已被清理：
- 该目录未被任何cron引用（cron全部使用 `server-version/scripts/monitoring/` 路径）
- `/etc/cron.d/ptool-backup`（引用不存在的`backup.sh`）已移除
- `/etc/cron.d/ptool-health`（引用不存在的`system-health.sh`）已移除
- 旧版目录中的37个key已归档到上方文件

## ⚠️ 重要提示

- **历史key文件请勿删除**，以备未来需要恢复旧备份（如果从COS远程备份中找到对应的加密文件）
- 2026-06-19 起使用新的单一密钥，所有新备份均使用该密钥加密/解密
- `init()` 函数的 bug 已修复，不再会重复追加 key

## 当前密钥

从 2026-06-19 起，`backup-config.env` 中只保留一个 `BACKUP_ENCRYPTION_KEY`，
所有新备份均使用此密钥。可通过 `backup-enhanced.sh verify <文件>` 验证。
