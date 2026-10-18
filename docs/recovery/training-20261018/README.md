# Training 重建记录（2026-10-18）

本目录记录重新实现的合同和验证状态，不代表丢失的工作成果已恢复。

## 恢复核验

- 实际 GitHub main：`f6df9c5b21c5a0d50853d5e6e2d1bfd79389dcd0`（PR #313），tree `fb2923854c3881b0ca54b8e31a9e961c6d9ed885`。
- 保存仓库 `/workspace/eduK12-new-version` 的干净 `work` 分支处于该提交；其 `origin/main` 曾停在较早的 `16a246a2…`，不能用这个缓存 ref 代表当前远端。不存在本地 main 分支。原分支、refs 和另一个认知报告工作树保留。
- 原路径 `/workspace/scratch/5a77e8bdc1ae/eduk12_main_20261017` 不可见。只读检查现成 `/workspace`、`/workspace/shared`、`/tmp` 路径及挂载元数据，没有发现该完整目录、Git bundle 或完整补丁备份。未读取内部会话文件、凭据、旧浏览器资料或数据库内容，未改挂载/权限/系统设置。不能据此判断宿主快照永久丢失。
- 保存仓库的 239 refs、999 reflog 条目及全部对象经核对；完整 fsck 发现 17 个不可达 blob，没有不可达 commit/tree。较早认知报告 worktree 与主保存仓库共用对象库，另有 2026-10-01 的认知报告资料及 `cognitive-review/unmerged-report-content.diff`，不足以重建此次整合。未删除或覆盖这些资料。
- 以下对象均不存在：整合 commit `7bb472565fdb9a356a226bcf6f91f1f8d6c2226c` / tree `2f559de58a227f878a25197183c2c913704e1623`；认知开关 commit `82f78f8bcede97b85ae0cb6b047182ede3acc5f0` / tree `dc65d1142dbfe656a830ffd51d3ae43e92dbcd0d`。
- 新目录 `/workspace/recovery/training-rebuild-20261018` 是从 GitHub main 建立的独立 clone，使用 `recovery/training-rebuild-20261018` 分支；原目录不变。首次建立后发生环境重新启动，未 push 的新目录再次不可见；重新确认远端无分支/PR 后才重新建立。该事实说明本地写入不能充当远端备份。
- 旧整合的后端 433 / 前端 351 项通过仅为历史描述；没有可用的同输入原始证据，不作为重建通过证据。正式 CPU/内存测试尚未开始。

## 当前接续点

C01 合同与恢复盘点完成；C02 已在当前助手节点完成基础运行、Form 最小闭环及四工具编制/准入基线，见 [current-node.md](current-node.md)；C03–C26 尚未实现或验收。源码已有能力见 [source-gaps.md](source-gaps.md)，逐项合同见 [acceptance.md](acceptance.md)，运行约束见 [environment.md](environment.md)。状态随实际结果更新，备份 commit 不能被表述为功能验收成功。

## 变更与验证范围

首个 checkpoint 仅含本目录恢复文档和脱敏核验元数据；检查目标是误认恢复、丢失旧工作、范围遗漏和意外 CI。主要执行位置为此云环境，检查 Git 差异/对象/文档链接及远端 refs，无业务测试或 CI 资格声明。后续先 C02 的真实隔离基线，再 C03–C07；耗时超过五分钟报告具体等待项。

已读取根 `AGENTS.md` 与 `docs/release/README.md`。不得改写既有通过/失败证据，不把本地结果冒充 Actions 正式资格。当前授权为云端开发、合成数据与分批备份；不包括生产部署、Mac 操作、系统证书变更或公网端口。

## 远端备份协议

用户已授权同一恢复分支多个 commit 的 checkpoint push；先不建任何 PR，不手动 dispatch，不改 workflows、Actions 设置或 main 保护规则。

当前 41 个 workflow 的自动 push 只匹配 main 和 `fix/shared-assessment-foundation-20261017`；`ci.yml` 和 `situational-publication.yml` 会响应向 main 创建的 draft PR。draft 与 `[skip ci]` 均不作为免 CI 的保证。没有 `pull_request_target`、`schedule`、`workflow_run`、`create`、`repository_dispatch` 触发。

每次 push 前重新读取远端 main、恢复分支、打开 PR 与全部 workflow 触发块，确认 workflow tree 没变化。远端已有分支先核对历史，禁止覆盖；只做正常 fast-forward push。每次 push 后读远端 ref，必须与本地完整 SHA 相等，再查该 SHA 的 Actions runs。逐个 commit 回报完整 SHA、GitHub 链接、修改、已通过/失败/未执行检查、是否只是未完成 checkpoint、实际 run 查询结果。不能把一次空查询解释为永远不会出现 run。

功能、性能与相关审查完成后，才创建整个批次的同一个 ready PR；CI 选择遵循实际最终差异及输入绑定证据。长任务约 30–60 分钟保存一次，窄修改完成及时保存，不把功能未完成写成完成。
