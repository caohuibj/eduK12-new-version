# 首次升级与后续小更新

复用现有 Compose 入口、镜像 producer 和内容 CLI。统一调用
`server-version/scripts/release/update.sh`，默认只打印计划，`--apply` 才执行。
它不授予发布资格，不下载/构建镜像，也不替代既有 CI、内容批准和当次部署授权。
前端或服务小修不迁移、不备份整库、不重测未改组件；允许必要的业务短停。

## 共用准备

1. 关键合并完成后冻结本次源码和所需内容版本。只比较相对已部署版本的变化。
   本次曾统计 109 条 pending；这是准备时快照，最终数量以冻结版本和实际迁移账本为准。
2. 使用已有离机 Linux/amd64 producer，只构建受影响组件一次，复用其扫描与相关检查。
   已有 C producer 显式支持 `DEBIAN_MIRROR`、`NPM_REGISTRY`、`ALPINE_MIRROR`；
   默认官方源不变，需大陆源时传可信镜像参数，不修改生产全局源或 Docker daemon。
   构建/扫描不自动等于 runtime/frontend/ops 已导出，正式 artifact 必须实际存在。
3. 优先复用服务器缓存，预载缺失的合格固定镜像；不在小内存生产机编译。
   保留当前镜像和现行 profile，按真实 artifact 大小计算峰值，不自行 prune。
4. `ENTRY` 是现场现有 Compose 入口；`LIVE` 是该入口日后普通重启也会使用的持久 profile。
   `NEXT` 是提前准备的完整候选 JSON Compose 文件，保留拓扑、卷、端口、域名/TLS及环境引用。
   小更新只能改变选中服务的 `image`。使用镜像 ID 或 `registry/path@sha256:…`，不使用漂移标签。
   脚本不解析/打印 `.env`；当前只接受 JSON profile，不私自转换未知 YAML 配置。
5. `ROLLBACK` 是尚不存在的私有路径。脚本保留旧 profile 的模式，原子替换 `LIVE`，
   并显式让现有入口消费它；其他日常调用也须指向同一 `LIVE`。一次只运行一个部署操作。

```bash
U=/path/to/checkout/server-version/scripts/release/update.sh
ENTRY=/path/to/existing/compose.sh
LIVE=/path/to/current-private-compose.json
NEXT=/path/to/prepared-private-compose.json
ROLLBACK=/path/to/unused-private-rollback.json
# 以下示例都省略 --apply，因此只生成计划；先确认计划再按当次授权执行。
```

## 1. frontend：只切前端

输入：一个合格 frontend 镜像，只有 `frontend.image` 改变的 `NEXT`，当前镜像保留。

```bash
bash "$U" frontend --entry "$ENTRY" --live-profile "$LIVE" \
  --next-profile "$NEXT" --rollback-profile "$ROLLBACK"
# 执行动作只有持久 image 更新与：
# EDUK12_RELEASE_OVERLAY="$LIVE" "$ENTRY" up -d --no-build --no-deps frontend
```

现有 Nginx 已支持 HTML `no-cache`、内容哈希 assets 的 immutable 缓存、缺失 assets 真 404
和 `.mjs` MIME；已有上层入口挂载的 Nginx 配置仍需保留，不能假定换镜像会覆盖 bind mount。
静态文件属于合格 frontend 镜像，不向运行容器内覆盖零散 dist 文件。

**当前限制：新镜像不会自动保留旧镜像所有哈希资源。** 打开的旧页面可能在延迟加载时遇到旧 chunk
404；浏览器 immutable 缓存不能保证每个 chunk 已下载。当前采用可短停、保存后重新载入页面的模式，
不自动刷新未提交作答。部署前已证明的同产物资源检查复用；切换后只读一次新 HTML、它引用的一个
JS/CSS（200、非 HTML、正确 MIME）及一个改动入口。无需后端、数据库或整页矩阵复测。
需要旧页面跨版本持续加载时，另在**离机构建/资格验证前**保留上一版 assets；现有 producer 未实现
这一步，不声称已经支持，也不在生产拼接或重打包已扫描镜像。

回退：以 `ROLLBACK` 为下一次 `NEXT`，使用新的未占用回退路径，再调用同一 frontend 模式。
旧镜像、旧 HTML 和旧 assets 一起恢复；不回退数据库。

## 2. service：只切受影响 API/worker

输入：无 schema/迁移变化且与当前数据、队列消息、报告快照兼容的合格后端镜像；
`NEXT` 只修改显式列出的应用服务镜像。所有实际 API 副本都要纳入；共享执行/队列协议变化时，
API 和消费它的 workers 一起切。同一仓库镜像不意味着每次必须重启所有服务。

```bash
bash "$U" service --entry "$ENTRY" --live-profile "$LIVE" \
  --next-profile "$NEXT" --rollback-profile "$ROLLBACK" \
  -- backend worker
# 按现场拓扑追加其他受影响 API/worker 名称；不能照抄此示例遗漏副本。
# stop -t 60 <selected> -> 持久 profile 切换 -> up --no-build --no-deps <selected>
```

停止宽限默认 60 秒，沿已有 SIGTERM/队列重试处理在途任务；不清队列，不等待历史积压永久归零。
本模式没有 migrate、seed、备份或 frontend 命令。镜像/服务就绪约一分钟内有界观察，再走一条
受影响 API 或 worker 短流程；其他功能/角色/性能测试放部署后。

回退：同一 service 列表切回保存的 profile。即使 DB schema 未变，若新代码已经写出旧版本
无法理解的数据或队列消息，也不能盲回旧 worker；停止受影响写入后前修或明确兼容边界。
“小修”不自动获得旧 A/B 执行器资格，相关 CI 与权限/科学检查照实际影响选择。

## 3. content：已有引擎内的精确版本内容

不重启服务。输入是受支持的声明式包、精确版本、所需批准及现有管理员身份。
`OPS` 是同版本 ops 镜像的**既有私有 overlay**，含现有凭据加载与 `/input:ro` 内容挂载。
不要给 runtime 增添开发依赖。先检查已有 preview，明确选择 install 和 publish；脚本不自动串发。

```bash
OPS=/path/to/prepared-private-ops-overlay.json
bash "$U" content --entry "$ENTRY" --ops-overlay "$OPS" -- \
  bundle:package:preview /input/bundle
bash "$U" content --entry "$ENTRY" --ops-overlay "$OPS" -- \
  bundle:package:install /input/bundle ADMIN_USER_ID
bash "$U" content --entry "$ENTRY" --ops-overlay "$OPS" -- \
  bundle:package:publish BUNDLE_KEY EXACT_VERSION ADMIN_USER_ID /input/signed-review.json
```

上述 CLI 已存在；每个包使用原 CLI，不能把整合 ZIP 根目录当单个 Bundle。preview 会显示内容，
输出只留在私有操作终端。Bundle 回退使用同入口 `bundle:package:hold KEY VERSION ADMIN_USER_ID`
停止新使用，并选择仍合格的旧版本；不删已产生的冻结引用。

量表已有 `scale:instrument:install`（默认 preview，`--apply` 才安装）和
`scale:instrument:publish --input /input/release.json [--apply]`；install 只接纳代码已登记的
instrumentKey/version 与运行 policy，不是任意题本热插拔。具体参数见原 CLI `install-scale-instrument.ts`。
已有认知配置发布 `cognitive:configs:publish --input /input/release.json [--apply --actor ADMIN_USER_ID]`。
认知安装只选择已有 registered seed/configVersion/engineVersion/scoringVersion；新 runner、scorer、
任意 JS 或未登记种子需要相应代码镜像发布，不能当作数据上传执行。

管理员普通 Excel C/P/R 批量导入依赖对应后端/UI 合并并部署；未完成时不声称已可用。
完成后沿现有后台 component-import preview → save → draft preview → publish。
C/P/R 必须精确匹配，改阈值 P 要配匹配的报告 R；旧授权、问卷、在途快照和报告不改写、不自动重算。
验证只看本次版本/组合状态和一次对应预览或新建短流程；已有原件/题本验证不重跑。
撤回新内容只停止新分配/新发布，旧冻结任务继续读原版本；不能靠删除或改旧版本实现回退。

## 4. full：确有 schema 或跨组件变化

首次追平生产走此路径。提前完成全部产物预载、完整 profile、匹配 ops、角色协调器和恢复点绑定。
已确认 24 小时内成功 COS 备份且期间无生产增量时直接复用，不补第二份或恢复演练。
确实失败或缺目标库覆盖时才处理具体缺口；不因“更放心”叠加快照、dump 和多份 COS。

`ROLE_SYNC` 是提前准备的现有 owner/运行角色协调脚本，使用**同一正式 ops 版本**的
`runtime-role-defaults.sql` 和 `runtime-table-policy.json`，沿已有 psql/凭据入口执行；
它不是 migration 重试器。SQL 使用 psql 变量，不能改成 `prisma db execute`。

```bash
ROLE_SYNC=/path/to/prepared-private-role-sync.sh
bash "$U" full --entry "$ENTRY" --live-profile "$LIVE" \
  --next-profile "$NEXT" --rollback-profile "$ROLLBACK" \
  --ops-overlay "$OPS" --role-sync "$ROLE_SYNC" \
  -- frontend backend worker
# 换成现场完整业务 writer/consumer 服务列表，保留实际副本。
```

唯一窗口顺序：停选中业务/worker并有界排空 → 原 migration preflight →
`prisma migrate deploy` **一次** → 现有角色协调 → runtime-role post-migrate →
原子激活预备 profile → 启动选中服务。DB、Redis、COS和无关宿主服务不停止、不清理。
迁移或角色协调失败时脚本立即停止，留在停写状态；先看实际失败和迁移账本，不盲重跑。
部署窗口仅保留必要迁移/权限结果、readiness 和一条关键入口；全角色、全量报告、压测和恢复演练后移。
本次资源/耗时预算在私有交接维护，不把生产元数据写进公共 runbook。

回退：迁移前可恢复旧 profile/镜像；迁移后只有旧读者与新 schema/权限/数据确实兼容时可只回镜像。
破坏性 DDL、新协议或新写入可能要求前修，或明确恢复点及之后数据保留方案的数据库恢复。
脚本不执行 down/reset/逆迁移、DB/COS 删除或自动旧库覆盖，也不把 additive DDL 当作兼容证明。

## 上线后

沿现有运维状态、备份/COS回执、有限错误日志、磁盘/内存/OOM和worker积压观察，不新建监控平台。
恢复点的源码/schema预期按最终部署版本绑定，等待正常备份周期，不立即重复手动备份。
角色矩阵、完整体验与性能分批开展；O13容量/性能、O12成本在上线后，Teacher 登录无收益项暂不开发。

已实现：单服务/多服务 Compose 切换、一次迁移工具、已有内容 CLI、固定镜像和 Nginx 基础缓存。
本增量只补统一分发和 JSON profile 的最小持久切换。尚需当次绑定：正式 artifact 导出、现场副本列表、
私有 ops/角色加载器与最终内容批准；跨版本旧 assets 保留及任意新认知代码热插拔未实现。
