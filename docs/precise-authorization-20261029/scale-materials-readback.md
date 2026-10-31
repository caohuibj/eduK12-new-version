# 三份 basic 量表在新节点装载回读

来源：`content/scale-materials-three-20261029`，commit `6fa885ec74ca01350db25c44bd61c700648b05d1`，tree `bf8fc715333ab3d96e0faa73249bb385a52e4248`，parent main `2de32609e1888cf28b73cb26e2c0cf38b11ff875`，DOT 负责的纯内容 [PR #387](https://github.com/caohuibj/eduK12-new-version/pull/387)。该来源不含此前被拒的 seed/注册工程，未复制 DOT 未提交工作树。

本节点在独立、tracked-clean 的精确来源 worktree，使用与基线 Git blob 完全相同的后端 package/lock 和现有安装依赖。装载调用现有 `prisma/seeds/scales.ts` 所用的 `materializeScaleInstrumentContent`，只选择这三份原件；未新写注册工程、未激活 deployment、未批准入口、未授用户。此检查没有运行全局 db:seed 或全平台 setup，不混入无关认知种子。

| 工具身份 | C / scoring 版本 | basic R | fun R | 本地回读 |
| --- | --- | --- | --- | --- |
| `cfq7_zh_cn_research` | `1.0.1` / `1.0.0` | `1.0.2` | `1.1.0` 仅 JSON | `d0ad3805-dd1f-426c-aa80-492741bb3cd9`，DRAFT/HIDDEN |
| `ipip_neo_c1_self_efficacy10_zh_cn_research` | `1.0.0` / `1.0.0` | `1.0.1` | `1.1.0` 仅 JSON | `2657e18e-d23e-4ad2-aab6-4ba2ba9adb12`，DRAFT/HIDDEN |
| `bps9_zh_cn_research` | `1.0.0` / `1.0.0` | `1.0.0` | `1.1.0` 仅 JSON | `f511609e-43e8-4217-a3ca-ce78eb05c92a`，DRAFT/HIDDEN |

三项 P 均为 none，无阈值/常模或分档。精确 C/P/R 轴、完整来源文件 SHA256、数据库 definitionCanonicalHash、measurementHash、axisHash、sourceSnapshotHash 见 `source-manifest.json`。fun JSON 的 baseContentHash/baseParametersHash 与该原件轴一致，R hash 与 basic 不同；只核身份和来源绑定，没有重复 DOT 已完成的二十个合成评分/报告对照。

首次调用创建三行；第二次调用三项均 created=false。重复调用前后 Scale ID、状态、可见性、定义、报告、轴快照、createdAt/updatedAt 全部一致。三条不可变轴快照均从数据库回读，并重算轴与来源快照 hash。未产生 deployment policy、standard combination release 或 standard version 注册行。

隔离素材库 `materials_load_20261029` 当前合计：3 份 basic Scale、3 条轴快照、11 个受控认知配置、0 个 material grants、0 个 content use grants、0 个 cognitive assignments。原认知候选和其安装证据保留，无重复安装。

**交付边界**：basic R 嵌在 DRAFT 定义中，3 份 fun R 仍是已核对的素材文件，不在注册表/选择器中。不能说六 R 已装载、四入口已通或生产可用。本节点没有替 DOT 执行此前被拒的独立 sidecar seed/注册工程。以上是来源提交装载时的历史状态。后续 main 合入与正常 seed 的独立证据见下节；本任务未重复开内容 PR/CI。

可复现方式是取得上述精确提交后在专用新节点运行仓库现有 seed/setup；本次只对三源执行相同现有 materializer，并通过独立只读查询验证结果。还缺 full setup 的环境级资格、fun 注册和各入口批准/授权。该本地装载成功不能替代这些验收。

## main 正常初始化与重复 seed（后续验证）

远端 main 现为 `6142ddc74db9787f6606746610df58c73de256f5`，正常合并 PR #387，tree 仍为 `bf8fc715333ab3d96e0faa73249bb385a52e4248`，与纯素材提交完全相同。本开发分支已正常合入该 main。此前评分/报告输入没有变化，不重跑二十个合成对照。

在精确 main 的独立、tracked-clean worktree，以 Node 24.21.0、匹配锁文件的现有安装依赖及全新本地数据库 `main_setup_test_20261029`，实际执行 `npm run db:migrate:guarded` 与完整 `npm run db:seed`，然后各重复一次：四条命令均 exit 0。迁移前内容为零；迁移后为 main 的 253 条迁移。读回 56 份 DRAFT/HIDDEN 量表及 32 个 main 默认认知配置，包含本轮三份 basic；这 32 个配置不等于另库的 11 个原生候选，测试 fixture 也不代表科研或入口准入完成。

重复前后全部 56 份量表、32 个认知配置的 ID、定义 hash、版本、状态及 createdAt/updatedAt，连同 seed 管理员头信息完全一致；canonical state hash 为 `2175cdd75219bcfab7ac2a7f7a022d58b0bb88cf54f3b11c0719daa0043d1e4c`。三份 basic 的定义与轴来源 hash 同先前精确原件一致。独立数据库没有 use grant、任务、入口资格、发布量表、deployment 或 standard C/P/R 注册组合；seed 管理员是旧 ADMIN/STANDARD 身份，没有 SYSTEM_ADMIN 或入口资格。

证据命令、退出状态、来源、seed 文件 hash、全量身份与重复快照已索引在 `source-manifest.json.currentMainSetup`；原始记录位于本节点 evidence 目录。该证明覆盖新数据库正常迁移/seed 与幂等回读，未重新安装依赖、构建前端或证明生产 runtime 角色资格。fun R 仍仅为 Git 素材，没有独立注册；没有执行被拒 sidecar 工程、生产操作或真实用户授权。

## main c52：第二批声明式素材前移

main 后续前进到 `c52e1675fe7990ce49b42589d993fb12e8541ae1`（PR #389），tree `269d73372e9d47b578059c7078bb66402e1b689c`。增量为98个纯素材/索引文件，新增32份标准增强报告原件及保留旧/标准/趣味 R 的素材 JSON；后端 package/lock、prisma seed/迁移、运行时、权限和 CI 均未变。本分支正常合入该 main，没有复制私有工作树或代做此前被拒工程。

精确 c52 的独立 clean worktree 和新库 `main_setup_test_c52_20261029` 再执行正常 guarded migrate/完整 db:seed，并各重复一次，所有命令和两次只读检查退出0。实际88份量表均 DRAFT/HIDDEN、32个主干默认认知配置；包括本轮新增32份标准R（31项1.1.0，IPIP50为1.1.2）。重复前后所有行身份/定义/hash/时间戳一致，state hash `4add92f85e5ea1da1ae01a3d85d836818c03b0201f1f96b6a2c33c41c9610ca9`。原三份 basic 定义/轴来源与6fa原件仍完全一致。

新库仍0个 grants、任务、入口资格、SYS管理员、发布量表、deployment 或 C/P/R standard注册组合；fun R 仍未注册。88份DRAFT不等于全部获得入口准入，32个默认认知配置也不替代候选11项或22个profile运行资格。旧6142的56份结果保留为历史，不改写到新基线；完整身份和证据移到 manifest.currentMainSetup，旧快照在 previousMainSetup。检查仅补正常数据库初始化/seed和回读，未重复DOT评分/报告对照或运行全平台setup/CI。
