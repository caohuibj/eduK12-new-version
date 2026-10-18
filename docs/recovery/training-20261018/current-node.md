# C02：当前助手云节点（2026-10-18 07:34 UTC）

**基础运行与最小链路已完成；C03 尚未开始。** 本节点直接执行，不委托独立 Codex、Work 或 Chat 任务。先前 `environment.md` 是已停止的独立环境记录，不能作为此节点证据。

业务源码仍为 main `f6df9c5`。本阶段只增加开发工具与证据，不改变生产监听、评分、数据库模型、认证或 CI 规则。

## 本节点实际结果

- 官方来源：Node 24.21.0；原锁文件安装独立前后端依赖；fresh Prisma Client 5.22.0。
- PostgreSQL 16.15 官方源码摘要校验通过，OpenSSL clean build 与 pgcrypto 可用；Redis 7.4.11 官方源码摘要核对通过，使用 libc allocator。
- 后端全部既有 build 前置及 TypeScript 编译通过。tsx CLI 的 Unix IPC 在本环境不可用，因此通过 `node --import tsx` 执行同样脚本，没有删减检查。前端 Vite build 通过；并不声称另跑了未修改前端的所有类型/组件测试。
- API、独立报告 worker、PG、Redis 与前端预览在同一持续执行会话内运行，均限 loopback。不同工具调用不共享网络命名空间，真实 HTTP 检查在服务所在会话执行，不开放公网。
- 166 迁移完成；现有运行角色合同通过：203 表、1 sequence，API 与消费者使用受限角色。
- `/health`、`/ready` 均 200；前端首页及实际 `/api/auth/csrf` 代理均 200。
- 26 次真实 HTTP：教师/学员 cookie 与 CSRF 登录，Form 编制、自检、发布、FINAL、相同提交重放，教师报告原文，CSV 引号/换行/中文核对，学员越权拒绝，以及四工具组合编制、发布、准入。
- 4 项真实 loopback/拒绝测试通过。最终 launcher 的真实 SIGTERM 测试确认四个自建服务 PID 消失、状态为 stopped、cleanupVerified=true。
- C02 脚本独立只读审查的问题已修：信号退出清理、清理失败非零退出、export 消费者环境白名单排除 owner 密钥、唯一排他日志、启动时与测试前后实际 dist/工具输入指纹一致。

脱敏输入与结果见 `c02-baseline.json`；脚本在 `server-version/scripts/recovery/`。输出绑定实际 Node、4941 个 dist 文件的组合摘要、锁文件、schema、生成客户端、preload 和 harness 摘要。旧 source HEAD 的业务组件与本提交保持不变，不能把旧运行说成未来业务修改已通过。

## 明确范围

四工具组合只验证编制/发布/准入，未验证四工具作答完成；完整组合、浏览器与性能另按后续计划完成。Scale/Cognitive 使用仓库原合成 fixture，SJT 使用原公开 golden 定义。Form 不伪造评分。

导出走原 HTTP 队列登记、原 dist 消费函数、原产物下载鉴权。受控调用消费者是功能验证，不代表实际队列调度吞吐。API/worker 空闲 RSS 不作为负载能力或优化收益。

所有密钥、账号 fixture、数据库与原始私有日志保留在仓库外私有目录；不提交凭据、cookie 或真实被试数据。新 state 目录拒绝覆盖；退出仅处理本轮子进程，不删除数据目录。停止标记、SIGINT/SIGTERM/SIGHUP 有受控清理；SIGKILL 等不可捕获终止不能保证同样清理。

API/报告 worker 的 1GiB RSS、低可用内存停止线已配置；尚未制造 OOM/低内存故障，不声称这些故障分支经过动态注入验证。

## 保留的失败与修正

1. PostgreSQL 追加 SSL 后增量链接失败，clean rebuild 解决；没有把失败构建当成功。
2. 原 npm build 的 tsx IPC 权限失败，以支持的 Node import 方式执行同样检查。
3. 第一版 HTTP harness 误取 start 响应顶层，实际是 data.attempt；已按接口修正。
4. 重复使用同一认知 fixture 触发合法最大次数 409；后续使用新合成参与者和任务，不放宽产品次数限制。
5. 前端健康探针误用不存在的 /api/health，修正为实际代理接口；API 自身 /health、/ready 单独验证。
6. review 后重新绑定最终启动指纹与受限消费者环境；逐次结果与失败日志保留，未覆盖失败为成功。

## C14/C15 当前接续点（2026-10-18 12:43 UTC）

以上 C02 内容为历史节点记录，不是当前业务 HEAD。C14/C15 在独立分支 `recovery/c14-weighted-variants-20261018` 实施，固定起点 75fb1ef1898d34e0991752515067c0483ab675d4。业务源码资格为 150248772c5592035e1da484a671548e7aa2c8a0；证据紧凑归档 checkpoint 为 8f1d9cafc6f96240f3af014f6a2fb51336814847。

主链 FULL02 已通过：361 HTTP/70检查，真实 Form/Scale/Cognitive/SJT 两组作答、selected-only report、原队列 CSV/ZIP 分层、compact/shared whole 与实际 worker batch/committed timeline、合法次数/恢复与锁顺序竞争。新格式 205 表全列恢复、17 allocations、2私有图片与受限 role 验证通过。旧 HTTP03 accepted facts 保持原 hash，仅续跑原 worker完成；所有原失败记录保留。源码审查与动态报告分别限定，旧99请求不冒充当前 runtime 通过。

原 pool=6 冷 shared-slot 事务遗漏经真实 PG 等待诊断和同条件6并发修复验证闭合，未加超时或池容量。中央 outbox 的独立冷-cache、旧 null Form 六首 FINAL 并发回归已在12:51 UTC通过；既有variant full preview也已实际通过。当前是本批最小范围的限定功能资格，仍不等同全平台验收。正式浏览器 C25、完整性能 C26、跨人/配对指标 C16 留待后续。

恢复入口与限制见 `c14-weighted-variants.md`、`c14-evidence/full02-qualified/summary.md`、`server-version/scripts/recovery/c14-slot-transaction-audit.md`。大型 JSON 使用 gzip mtime=0，manifest 同时列解压原 bytes/SHA；不得以压缩文件 hash 代替原证据身份。私有 PG/上传/运行密钥不在 Git 中，需按恢复规程使用合格私有 dump 或重新生成明确标注的新合成输入。
