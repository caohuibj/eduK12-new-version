# 本任务已完成检查点备份与暂停

按用户最新指令停止新增开发，只备份既有任务的已完成阶段成果；不创建 PR、不合并、不部署、不启动 CI。

本次提交以已封存 `1d976f53622b25e84846fdbc7e2f6366aa18ab90` 为产品检查点；
新增内容仅为本暂停说明和原 11 项基线失败的逐项清单。
后端提交 tree 与该检查点保持一致，未把下面的工作区改动混入备份提交。
原始基线仍为指定 #355 候选加 #356 三补丁，原来源映射、失败证据和 r3／r4 封存均保留。

## 已完成并纳入备份

- `29f22d65`：共享不可变 C/P/R 正文适配及事务内复用；实时权限和停止判断不缓存。
- `f74c9bad`：复用现有 21B 的精确 C 分发权和按用户绑定组合版本的使用权，无逐课程人工授权；保留撤销和重新发行的版本隔离。
- `c370bdc2`：Training 编制、发布、运行时、收集与 P/R 消费的代码接线；资格限于第四块报告已列出的局部验证，不称完整纵向通过。
- `e2f4b0ef`：共享正文／材料等待后的发布前权限复核。
- `1d976f53`：第四块检查点、原始失败及真实 SQL／HTTP 与内存合同的分项证据。

第四块实际证据为 8 个分三轮执行的局部 SQL／HTTP 场景、62＋80 个内存合同及相应类型检查。
原 11 项失败见 `docs/training-standard-vertical-validation-20261025.md`，未重跑或改弱。

## 留在本地的未完成内容

- `server-version/backend/src/modules/composite/composite.service.ts`：教师 DTO 的固定组合摘要接线。
- `server-version/backend/src/modules/composite/training-standard-combination.ts`：摘要投影 helper。
- `server-version/backend/src/__tests__/measurement-content/training-standard-vertical.fixture.ts`：仅测试进程注册的原创两题 source。
- `server-version/backend/src/__tests__/measurement-content/training-standard-vertical.postgres.integration.test.ts`：可复用已提交测试前置的真实纵向驱动，尚未通过完整断言。

上述 4 个文件保持工作区原状，并另存本地 patch／未跟踪文件归档：
`/workspace/tool-onboarding-paused-wip-20261025.patch`、
`/workspace/tool-onboarding-paused-wip-20261025.tar.gz`、
`/workspace/tool-onboarding-paused-wip-20261025.json`。
隔离运行日志及 SQL／HTTP trace 留在本地，不把会话、环境文件或数据库状态提交到仓库。

暂停时的纵向进展：正式前置、真实三组评分／报告试运行、使用权发行、教师发布、学生上下文和 FINAL／幂等、唯一规范分数 12 均已实际执行。
父作答仍为 IN_PROGRESS，完整 P/R 消费未通过；保留这个新失败，未继续定位。

## 本次无 CI 备份边界

目标为独立分支 `tool-onboarding-next-20261025`。推送前通过远端只读检查确认同名远端分支不存在，且没有以该分支为 head 的现有 PR。

已解析本候选的 70 份 `.github/workflows/*.yml`。仅 7 份含 push：
`ci.yml` 限 main；另 6 份分别限 Measurement、Scale authoring feedback／evidence／diagnostic、School/Teacher browser、shared-assessment foundation 的指定验证分支。
没有匹配本任务分支的 push／create／workflow_run／repository_dispatch 触发器。
不会创建 PR、手动 dispatch 或修改全局工作流；备份末端提交采用仓库既有 `[skip ci]` 约定。
推送后还将核对远端精确 SHA 与本分支的 Actions run 查询结果，结果在对话中单列。

已对拟推送增量核对文件清单和新增文本：没有环境／密钥文件、真实答卷、私有账号快照或凭据字面量。
规范化测试记录均为源码中的合成 fixture；本轮新增运行时账号、会话与答题状态不进入提交。
