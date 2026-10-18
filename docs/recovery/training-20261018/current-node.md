# C02：当前助手云节点（2026-10-18）

用户要求直接在当前助手云节点工作，不再委托独立 Codex、Work 或 Chat 任务。
先前 `environment.md` 描述的是已停止的独立环境，不能用其容器、编译或健康状态作为本节点证据。

本节点独立 clone 已接续远端 `recovery/training-rebuild-20261018` 的 `a9d6131`。
业务源码仍为 main `f6df9c5`，C03 尚未开始。本提交仅是 **C02 未完成 checkpoint**。

## 已执行

- 官方 npm 安装 Node 24.21.0；前后端按原锁文件使用官方 registry 安装独立依赖。
- fresh Prisma Client 5.22.0 生成；sharp、jieba 加载通过，canvas 官方安装生命周期成功。
- PostgreSQL 16.15 官方源码 SHA-256 校验通过；首次无 SSL 构建不能满足 pgcrypto，追加 OpenSSL 后增量链接失败，保留失败记录，正在 clean rebuild。
- Redis 7.4.11 官方源码与 redis-hashes 仓库公布的 SHA-256 一致，编译成功；使用 libc allocator，性能比较时必须记录这一配置。
- 开发专用 loopback preload 的 4 项真实 TCP/拒绝测试通过；不修改生产监听默认值和系统网络设置。
- `local-stack.py` 仅通过 Python 语法检查，尚未实际启动验证。

## 尚未执行或完成

当前节点的 API/worker 编译、隔离数据库迁移、运行角色验证、健康检查、发布—作答—报告—导出基线，以及功能与性能验收均未完成。

## 运行边界

`server-version/scripts/recovery/local-stack.py` 仅创建新的私有合成数据目录；不复用旧数据库，不删除状态目录。数据库和 Redis 绑定 127.0.0.1；未修改的编译 API 通过开发专用 preload 约束到 loopback。使用独立低权限运行角色和仓库现有 ACL 分类，默认关闭重型媒体处理。API/报告 worker 达到 1GiB RSS 停止；所有子进程有受控退出路径。

密钥、账号 fixture、数据库、原始运行日志和私有配置不提交 Git。需要持久保存的验收仅提交脱敏摘要、版本/源码/输入哈希和复现脚本。后续必须按实际运行结果更新本状态，不能把本 checkpoint 表述为 C02 完成。
