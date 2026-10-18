# 当前云节点目录丢失后的恢复预案

用户于 2026-10-18 要求：直接从 GitHub 最新已推送 commit 恢复，继续在助手当前云节点开发，不另开 Codex、Work、Chat，不操作 Mac 或生产。

## 1. 恢复点与损失边界

- 仓库：`https://github.com/caohuibj/eduK12-new-version.git`
- 工作分支：`recovery/training-rebuild-20261018`。恢复点取该分支**实时远端 head**，不能退回 main 当成最新开发，也不能只采用本文中的旧 SHA。
- 2026-10-18 07:51 UTC 已验证的第 4 个备份提交：`d6ab30fbba470f799412f9e8e8e3da892977972f`，tree `ee823db645123a746ec446bd65a5c7ffe3be1a2a`。后续提交以远端历史和各阶段记录为准。
- GitHub 保存源码、迁移、合成 fixture、测试脚本、脱敏状态与计划。未推送改动、原始本地日志、数据库、生成产物及 node_modules 不在此保证内；最近一次成功推送以后仍有恢复点损失窗口。
- 私有运行密钥、cookie、fixture 密码、数据库 dump 和真实用户数据不得提交。开发合成库可重建；原加密库只有配套原密钥才可读取，不得声称仅 clone 可恢复原数据库。
- 本预案不授予生产恢复、凭据重置、全局 Actions 设置修改或权限放宽。

## 2. 先核验，再恢复

仅只读核查允许的原目录/现存工作树和已知进程，保留找到的改动；不通过猜测 PID 杀进程，不修改挂载或安全设置，不覆盖可能仍存在的目录。不读取禁止访问的会话目录。

在当前节点选择一个**尚不存在**的新目录；下面路径需替换为实际可写路径：

```sh
REPO=/absolute/new/eduk12-recovery
BRANCH=recovery/training-rebuild-20261018
git ls-remote https://github.com/caohuibj/eduK12-new-version.git "refs/heads/$BRANCH"
git clone --branch "$BRANCH" https://github.com/caohuibj/eduK12-new-version.git "$REPO"
cd "$REPO"
git fetch origin "$BRANCH"
git rev-parse HEAD FETCH_HEAD 'HEAD^{tree}'
git status --porcelain
git log -12 --format='%H %s'
```

若远端在 clone/fetch 间前进，只在工作树干净且确认为本任务分支时 fast-forward 到 FETCH_HEAD；有未知改动或历史分叉先停止覆盖。记录最终 SHA/tree、UTC 时间、分支和恢复目录。缺少本地对象不可凭记忆还原后宣称原代码已找回。

先读根 AGENTS.md、docs/release/README.md、本目录 README、acceptance、最新 Cxx 记录。区分：已备份、源码 review、针对性测试、真实 HTTP/数据库验证、浏览器与性能验收。不得用历史通过覆盖新输入。

## 3. 重建工具与运行环境

优先核对现存工具版本与完整性；不存在则从官方 npm/厂商源重新安装，校验供应商摘要，保持锁文件不变。基线使用 Node 24.21.0、PostgreSQL 16.15（OpenSSL 和 pgcrypto）、Redis 7.4.11（libc allocator）。工具升级时重记版本，不继承不一致的性能基线。

启动脚本约定工具布局：

```text
TOOLS/node_modules/node/bin/node
TOOLS/postgresql/bin/{postgres,initdb,psql,pg_dump,pg_restore}
TOOLS/redis/bin/redis-server
```

使用独立可写 npm cache 和官方 registry（replace-registry-host=always），分别在 server-version/backend、frontend 执行锁定的 npm ci。每个工作树独立依赖，禁止通过共享 Prisma 生成目录污染其他工作树。用仓库锁定的 Prisma 重新生成 client；构建前后端需要恢复运行的部分。

若环境禁止 tsx CLI 的 Unix IPC，使用 C02 已验证的 `node --import tsx` 执行 package.json 的同一前置脚本，再执行 TypeScript 编译；不可删掉 manifest、onboarding、situational、scale 检查来伪造 build 成功。具体检查命令以检出的 package.json 为准。未变更但产物已丢失的恢复性构建不等于重新获得正式发布资格。

## 4. 新合成库与短链验证

`local-stack.py` 仅创建**新** state，执行当前迁移、创建受限 runtime 角色并生成合成 fixture；不恢复生产数据。先核对源码与生成产物的实际指纹。

```sh
python3 server-version/scripts/recovery/local-stack.py \
  --tools "$TOOLS" --state "$NEW_PRIVATE_STATE" --hold-seconds 7200
```

服务与 HTTP 客户端必须在同一持续执行会话/网络命名空间中运行，不能因另一个工具调用无法访问 localhost 就开放公网。通过状态文件确认 running/health/ready 后，在该会话运行受影响阶段的 smoke。C02 基线入口为：

```sh
node server-version/scripts/recovery/baseline-smoke.mjs "$NEW_PRIVATE_STATE"
```

新版脚本和数据协议变化时按对应 Cxx 记录选择检查，不盲目重复所有历史测试。单独保留原失败与修复后结果。仅使用新合成参与者/任务，认知次数限制触发时不能解除业务限制以通过测试。

旧版本升级验证若所需 166 迁移快照丢失：在独立工作树检出 C02 提交 `ab0d4972ac36c3e09969271ab742ace7b7b1d814`，新建合成库并运行其基线，再保存私有 dump 与配套运行密钥；然后按当前升级 harness 在另一隔离实例验证。此为新生成的升级测试输入，不冒称原 dump 已恢复。原始含凭据/加密素材仅留私有目录，不上传 GitHub。

互斥运行重型编译/测量；沿用单次请求、阶段时限、API/worker RSS 与可用内存停止线。结束时使用本轮 stop 标记或受控信号，检查自身 PID 已退出；SIGKILL/宿主丢失不能保证正常清理。

## 5. 持续远端保护与接续

1. 窄修改完成即 commit；较长任务每 20–30 分钟优先冻结可读的 checkpoint，最迟按原约定 30–60 分钟保护一次，不等整个阶段完成才推送。
2. 每个 checkpoint 写清目的、完整源 SHA/tree、已通过/失败/待执行检查、下一接续点。未完成允许备份，但标题与说明须明确。
3. 只正常 fast-forward 更新恢复分支，更新前核对远端 head；不 force push、不覆盖其他工作。
4. shell 无推送凭据时可使用已连接 GitHub Git-data API：逐文件 blob 对比、构造 exact tree、以当前远端为 parent 创建 commit，再 expected_sha/force=false 更新 ref。元数据可能改变 commit SHA，必须验证 tree 相等并记录原/远端对应。不能索取或打印访问 token。
5. 推送后重新 fetch、确认远端 SHA/tree，核对无 PR、workflow 触发条件未变化和该 SHA 的 Actions runs，再逐个 commit 通知用户。backup 不是 CI success。
6. 恢复后优先继续最高优先级 Training 的当前 Cxx，不重复已完成开发，不改成 Mac 或独立外部任务。完整功能/性能/review 后才按已批准流程创建单一 PR、运行实际 CI。

## 演练边界

C02 已执行当前节点重建与最小运行链，C03 开发中已执行合成旧库升级检查。本文件是恢复操作规程，尚未在“所有节点目录同时丢失”的新节点上完整演练；不能声称零损失或一键恢复已验证。
