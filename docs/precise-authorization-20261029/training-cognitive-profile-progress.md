# Training 认知精确 profile：第一个使用入口切片

2026-10-30，main 集成基线 `dc0f46ba506d51d42c5bb379059df82f18860b72`，
前序系统审批提交 `baa904487`。本切片尚非四入口完成、正式 CI 或上线。
原始命令、时间、退出、失败及回读见 `training-cognitive-profile-raw.json`；均为未签名本地证据。

- artifact v2 固定已有编译输出、protocol、展示与 reference 定义；v1 原件继续只读，
  不自动补当前执行定义。原两个 v1 和两个新 v2 均保留；新增使用必须显式批准 v2。
  复用现有 encrypted immutable public-template store；每次 attempt 的随机 seed 仍独立。
- Training 精确使用权复用既有 ContentCapabilityGrant，入口管理员发行，
  不镜像 MaterialGrant、不改它的 STANDARD-only 约束。完整意图/原委托修订保存在
  原管理事件，替换创建新 ID 并通过既有 revokeContentAuthority 撤销旧权。
  旧 resourceId-only MaterialGrant 保留；已有 typed 历史不回落 OPEN/ADMIN/旧 grant。
- 草稿自动选唯一合法精确配置，保存原指针和五个既有冻结字段；使用者改 profile/hash 被拒。
  发布由原 artifact 生成现有 PRIVATE assignment M，保留来源 M 和 profileArtifactHash。
  原授权更新后旧草稿不升级，旧权失效则禁止发布/新 START；已开始恢复仍读原 seed。
- revisioned Training COURSE 问卷实际创建、添加认知、发布、START、延迟子会话已跑通。
  包装/复制/流候选 DTO 保留轻量 profile 指针，T3 用冻结执行内容，历史来源读取不查当前 grant。
  两个真实本地参与者的 seed 不同。未改变刺激/时序/评分，也未改 Bundle 引擎/PR392 控制。

独立库 `precise_cognitive_profile_artifact_test_20261030` 经正常 guarded migration 到 258，
267 runtime tables /1 sequence，受限角色校验通过。新迁移仅增加原审计表的部分索引。
没有改运行角色、生产数据或真实用户权限。

本地验证：v2 artifact 8 单测、2 PostgreSQL 兼容与显式审批；Training 原生 HTTP 三阶段
最终续验通过，问卷 adapter 与合法 selfGrant/显式撤权恢复 2 HTTP case 通过；
直接受影响旧 assignment/wrapper/M publisher 共 61 单测通过。最终类型结果见原件。

原始失败未删除：返回值 `data.list` 和配置 `totalTrials` 被测试误读；读回已成功写入授权、
发布任务后仅续验缺项，未重复创建。后续真实替换暴露遗漏 revokedBy/revokeReason，
数据库约束拒绝，事务回滚；改用原撤权函数后从 retained START 状态续验通过。
原 v1 审批测试只证明其旧输入，不伪称当前 v2 已重跑该旧流程。

待做：Training 管理/消费者页面连接及必要真实浏览器代表流程；匿名 GENERAL 认知
新绑定链路、最终完成/报告；Survey/School/Teacher 的精确使用授权与各自 adapter/UI。
系统层四入口批准不等于这三个使用入口已接通。无合法第二个非空量表 R 的阻碍仍见
`nonempty-r-blocker.md`，没有使用被拒的工程树。新增后端输入使旧 compiled backend
闭包/旧集成结果不再代表新认知路径；未改前端时其原 tree 的画面证据仍仅限原覆盖。
CI、Draft PR 和合并待最终精确控制路线复核，不启动平台 fallback；不修改 PR392。
