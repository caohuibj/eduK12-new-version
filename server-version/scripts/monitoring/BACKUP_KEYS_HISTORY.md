# 备份密钥管理说明

本文件只记录仓库内的安全边界，不保存任何备份密钥、历史密钥文件或
`backup-config.env`。曾经出现在代码、配置或备份介质中的密钥一律按已泄露
处理，轮换和撤销应在外部凭据系统中完成。

当前支持的备份入口是 `scripts/backup/backup-db.mjs`（旧的
`scripts/monitoring/backup-enhanced.sh` 仅作兼容转发）。密钥必须通过进程环境
变量 `BACKUP_ENCRYPTION_KEY` 注入；脚本不会生成密钥、写回配置文件或把密钥
写入日志。统一格式、校验和隔离恢复要求见 `docs/BACKUP-RESTORE.md`。

`incremental`/WAL tar 备份已暂停，直到实现经过审查的 PostgreSQL base backup
加 WAL archiving/PITR 链路。当前仓库仅用于本地测试，不依赖生产服务器或 COS。
