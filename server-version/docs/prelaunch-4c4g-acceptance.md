# 上线前工程验收与 4C4G 实机运行说明

## 当前边界

本轮保留科学计分、报告解释、frozen runtime、FINAL_ONLY、当前权限、tokenVersion、事务 CAS 和封存重试语义。三组 PR 按安全、后台重型工作、交互与部署分层；合并后仍必须执行本说明中的部署和容量验收。用户已明确当前没有部署主机，实机测试留待下一环节。**没有已测得的 4C4G 稳定并发区间，不能把 100/300 人写成容量承诺。**

## 起始实验资源（不是最终调优值）

| 服务 | CPU 上限 | 内存上限 | 其他边界 |
|---|---:|---:|---|
| PostgreSQL | 1 | 1024 MiB | shared_buffers 256MB；work_mem 4MB；maintenance_work_mem 64MB；max_connections 80 |
| Redis | 0.25 | 256 MiB | maxmemory 128mb；AOF；noeviction，避免逐出限流和 Bull 状态 |
| API | 1.75 | 1024 MiB | Node 老生代 640MB；Prisma 10；不消费后台任务 |
| worker | 0.75 | 768 MiB | Node 老生代 192MB，导出子进程继承；Prisma 4/进程；export/video/image 并发各 1 |
| frontend | 0.25 | 128 MiB | 内部 HTTP；主机仅 loopback 入口 |

合计 4 CPU、3200MiB；主机保留 896MiB。单导出子进程与 worker 父进程的堆预算合计 384MiB，余量用于原生内存、压缩、FFmpeg、页缓存等。一个 export 子进程额外拥有 4 个连接，默认 API/worker/child 合计 18 个连接。堆上限不等于 RSS 上限；大研究导出可能先碰到该保守堆边界，必须在独立服务器测定可用数据规模。Redis noeviction 满额会拒绝写入；以此保护状态，仍需告警、容量规划和恢复验证。

所有 Compose 资源可由 .env 覆盖；capacity overlay 与 canonical 共用相同资源变量。W3 视频并发 2 只用于竞争实验，不提高 worker CPU 上限。并发提高后必须检查父子堆及连接池乘数。`NODE_OPTIONS` 与运行时 V8 heap 观测会有少量差异。`/metrics` 暴露真实 Prisma 引擎 busy/idle/open/query wait，PG 全库连接/活动/锁等待、API ELU/RSS、限流 admission、cache/Socket Redis、Bull waiting/active/delayed/failed 与 CSP 聚合。worker/child 的连接池指标尚无独立 HTTP 出口，需隔离测试时补采引擎数据；不可用项必须记录为 unavailable。

在 server-version 目录中，以真实部署 .env 执行：

```sh
node scripts/prelaunch-resource-preflight.mjs
node scripts/prelaunch-resource-preflight.mjs --capacity
node --test scripts/load/prelaunch-mixed-load.test.mjs scripts/prelaunch-resource-preflight.test.mjs
```

检查器内部解析 Compose，不输出数据库 URL、JWT 或其他密钥；输出只包括安全资源参数。禁止把原始 `docker compose config`、含凭证 fixture、真实测评内容或 recovery token 作为公开 CI 附件。

## HTTPS 和发布顺序

拓扑固定为用户 → 单一 TLS 反向代理 → loopback frontend Nginx → 内网 API。TLS 层设置有效证书、HTTP 到 HTTPS 跳转、HSTS（初始 max-age 86400，外部媒体/PDF和子域检查通过后逐步提高）、正确的 Host/X-Forwarded-Proto，并覆盖来自用户的 forwarded headers。按实际代理层数设置 TRUST_PROXY_HOPS；canonical 默认按 TLS proxy + frontend Nginx 的 2 跳设置，必须检查实际 X-Forwarded-For 链，不能机械采用默认 1。校验多跳 NAT/IP 限流与 secure cookie。`CORS_ORIGIN` 为精确 HTTPS origin，`COOKIE_SECURE=true`；配置层拒绝 HTTPS + 不安全 cookie、零代理跳数及非 origin CORS。

canonical 不发布 API/DB/Redis/worker host port；capacity API 端口仅用于 loopback。公网 `/metrics`、`/api/metrics`、`/uploads/` 在 frontend 返回 404。内部 Prometheus 保持私有网络，health/readiness 只返回最小依赖状态。验证从外网无法直连 API/PG/Redis，不能只检查容器文件。CSP report-only 的 `/api/security/csp-report` 只保留有限 directive 计数，限速且正文最多 8KB；不保存 URL、片段、答案或凭证。

CSP 收口责任归发布负责人：在隔离 HTTPS 实例逐一验证外部图片、音视频、PDF、COS、Socket、worker 与所有作答页；至少覆盖一次完整浏览器验收及代表性媒体集合。根据 directive 计数定位允许域，在 staging 先 enforce 并重跑浏览器验收，再发布。当前保持 report-only，避免盲目破坏外部媒体/PDF；上线审批必须给 enforce 设定负责人和日期，不能无限期搁置。

发布：入口 drain → 停旧 API/worker/frontend → 备份并验证恢复 → migrate → 四类 public token backfill → release-data-preflight → 使用同一 SHA 构建并启动 → public workflow smoke → 检查 cookie/CSRF/权限/指标/worker → 恢复入口。迁移包含 ExportArtifact provenance；旧 Cognitive/Composite 文件缺少可信元数据会拒绝下载，需重新申请导出。先完成 ASSET_MIGRATION_COMPLETE 的资产和 token 迁移，再设置 true；生产不允许重开旧 `/uploads`。

## 私有 fixture 与逻辑请求

`prelaunch-mixed-load.mjs` 是有限、一次性逻辑操作驱动器，负载生成器放在另一台机器。每个 logical operation 使用独立已授权的受测者/session/run，id 仅用于 fixture 去重、不写入结果。每个 step 的 body 和 headers 在重试前冻结；不生成新幂等键、不重启测评、不改变 epoch。实际科学定义、有效 FINAL payload、CSRF/session cookie 必须从该隔离实例的真实 runtime 构建，不能伪造评分字段。fixture 文件权限 0600，使用后安全删除，绝不入库。

最小结构（仅示意，路径和凭证需从真实实例取得）：

```json
{
  "baseUrl": "https://isolated.example.test",
  "operations": [{
    "id": "logical-001",
    "category": "scale-final",
    "steps": [{
      "path": "/actual/final/endpoint",
      "method": "POST",
      "headers": {"Cookie": "PRIVATE", "X-CSRF-Token": "PRIVATE"},
      "body": {"actualFrozenFinalPayload": "PRIVATE"},
      "retrySafe": true,
      "expect": {"status": 200, "path": "code", "equals": 0},
      "busy": {"path": "message", "equals": "实际入口的繁忙提示"},
      "confirm": {
        "path": "/actual/server/status/endpoint",
        "expect": {"status": 200, "path": "data.status", "equals": "FINAL"},
        "pending": {"path": "data.status", "equals": "PROCESSING"}
      }
    }]
  }]
}
```

对同步 FINAL，直接断言其真实 server FINAL 字段；对仅返回 code=0 的 ack，**必须增加 confirm**，以真实终态字段确认，不能把 HTTP 200 当作 FINAL 完成。异步导出也先恢复原 artifact id，再 poll 到 READY 后执行受保护下载；二进制下载可以 `expect:{status:200,minBytes:1}`，默认响应上限 100MiB。固定 multipart 文件可用 bodyFile（最大 20MiB）和包含固定 boundary 的 Content-Type；每次重复相同字节。500MiB 视频通过隔离实例预置/已有上传工具生成，不使用本工具内存缓冲。abuse 类测试对明确的 400/401/403/410/413/429 作期望断言。

每次执行一个矩阵单元，导出结束后等待 worker/队列 drain 并保存终态、磁盘剩余量、无重复 submission/artifact 的一致性核对结果：

```sh
node scripts/load/prelaunch-mixed-load.mjs   --fixture /private/run-scale-final-100.json   --concurrency 100 --deadline-ms 600000   --containers isolated-backend,isolated-worker,isolated-postgres,isolated-redis   --metrics-url http://INTERNAL_BACKEND/metrics   --target-label isolated-4C4G-W0 --output /private/result-scale-final-100.json
```

300 同时 START 必须提供 300 独立操作；同一 NAT 可在生成器统一出站。先 100，再 150/200/250/300，发现错误/资源压力立即停止加压。每个阶梯用新 fixture 和新独立会话，不能对一次性 FINAL 无限循环。至少重复 3 次，加长 steady-state 观察，另测冷启动与大历史数据规模。

| 维度 | 必须执行的矩阵单元 |
|---|---|
| 学生 FINAL | Scale、n-back、CPT、SJT 30项/60项、Questionnaire、Composite、Bundle 各自与混合；保留每种 category |
| START | 100/300；同组织、同 run、同组织不同 execution、不同 run；注册集中同校 NAT（global 6000/IP和course 3000/account 10/teacher code 120，每15分钟；均可配置） |
| 教师工作 | 当前报告、纵向报告、导出、protected feedback、图片库、export preview 单独及与学生 FINAL 混合 |
| 后台竞争 | W0 停 worker；W1 export 单并发；W2 export + FFmpeg 1；W3 FFmpeg 2（实验，不作为默认） |
| 滥用 | 错误密码登录、错误 oldPassword、图片上传异常/多次/并发/超过9张、过期导出；正常学生流量持续并行 |
| 故障 | 显式丢弃首次响应后重放、真实 socket 断线、导出超时 kill、源文件 EIO/消失、客户端中断、API/worker 重启恢复、Redis 暂停/重启 |

lost-response fixture 设置 discardFirstResponse=true，必须 retrySafe=true；服务端已受理的同一请求在原始 body/key 下重放。429 和具有 Retry-After 且正文匹配 busy 谓词的 503 才计入预期繁忙重试；其他 5xx 立即计入非预期错误并失败。每种入口 busy 谓词必须来自真实接口，避免把 Redis/DB 故障误当容量拒绝。恢复能力和当前权限被撤销等负向案例不允许通用重试掩盖。

Redis 故障只能对隔离测试容器操作。现有 `redis-runtime-recovery.integration.test.ts` 使用 PRELAUNCH_REDIS_FAULT_CONTAINER 并要求正确匹配 REDIS_URL；停止/启动任务专用 redis-fault，验证 cache、limiter、Socket 以及 Bull 恢复，无须进程重启。禁止在共享或生产 Redis 上注入停机。worker 子进程 deadline 及文件故障已有自动化测试；实机另测进程重启、磁盘满与故障后的 drain。

## 必须记录与通过条件

报告含 logicalTotal/completed/failed、最终成功率、attempts、retryAttempts、confirmationPollAttempts、排除 polling 后的 retryAmplification、p50/p95/p99（HTTP 与整个逻辑生命周期分开）、429、预期 busy503、非预期5xx、网络错误、elapsedAndDrainMs、各 category 计数、Docker CPU/RSS/内存/PIDs、内部指标采样。原始答案、响应正文、token、URL 和 user ID 不进入报告。另采 worker 子进程 RSS、PG lock/slow-query 聚合、磁盘余量、连接池、export/Bull 队列峰值/回落及 SQL 汇总计时； unavailable 不能记作 0。指标记录权限与范围随 private topology 审核。

起始门槛为预期请求 eventual success >=99%，正常身份无终态丢失/重复，非预期5xx=0，所有重试 deadline 内收敛，队列 drain 回到基线、无持续 RSS 增长/OOM/Redis 写拒绝。同步提交 p95<=1000ms、p99<=3000ms 是实验目标；导出生命周期单列，不与同步请求混算。压测峰值后持续正常业务 10分钟以确认恢复。任何失败必须解释并修复或降低可发布并发。通过某一阶梯不代表更高阶梯稳定；已知稳定区间只能由这台真实 4C4G 服务器的完整矩阵复测确定。

## 工程证据和残余事项

查询确定性变化：图片从 1+N 到 2（含 count）；文档从 2+N 到 3；视频从 2+最多3N 到 3；Cognitive research 从两次 sessions 读取/解密/materialization 到一次，所有输出复用同一捕获数据。预览仅取一个样本并明确字段覆盖有限。真实 API 持久化导出 intent 后排队，现有 Bull worker 以 generation CAS 发布，超时 SIGKILL 后等待 OS close 才释放容量。没有 RPS 增长承诺。

剩余分类：

- BLOCKER：发布主机的 HTTPS/trust proxy/外网端口检查、备份恢复/迁移/preflight 未完成时不得生产发布；任何最终 CI gate 红灯也必须解决。
- SHOULD FIX：CSP enforce 的 staging 媒体兼容验证及有负责人的收口日期。
- MEASUREMENT REQUIRED：全部 4C4G 容量矩阵、export 大数据堆边界、FFmpeg 与 FINAL 竞争、PG pool/锁/慢查询、Redis maxmemory/OOM、磁盘与 restart/drain；用户已将实机阶段延期。
- POST-LAUNCH：ECharts 5 的中危 Lines/default-tooltip XSS 提示，目前仅 line 而无 Lines 类型且其他图表采用安全文本/自定义 tooltip；升 6 涉及 wordcloud peer 兼容，单独迁移。开发依赖 Vitest 的中危重定向提示在本轮仅本地/隔离 CI run 模式，不开放开发服务器，后续独立升级。高危审计门不变；不能宣称所有级别 audit 为 0。

依赖判定需随部署日期重新审计；参阅 [ECharts advisory](https://github.com/advisories/GHSA-fgmj-fm8m-jvvx) 与 [Prisma 引擎指标说明](https://www.prisma.io/docs/orm/v6/prisma-client/observability-and-logging/metrics)。本项目锁定 Prisma 5.22，metrics 为该版本现有 engine 能力；没有新增监控基础设施或缓存。
