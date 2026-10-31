# Training 独立 Scale：仅冻结新投放归属

后续切片基于 #422 应用候选 `49538293f19cc8dea5d1d2df5292906d5e483a0e`。#422 正式资格准备单独保存在 `prep/group-report-422-qualification-20261030`，本分支不包含其被拒绝的绑定上传，不借此分支传递该控制载荷。

已有课程测评页面生成 `/student/scales/<id>?courseId=<course>&courseSection=assessments`，但实际启动 POST 只携带 context。现在 Training 页面把 courseId 连同必填资料往返传给原启动接口；它仍只是导航提示，后端在新施测的原 Serializable 事务内验证实际 CourseScale、非库 Training 课程及 ACTIVE / APPROVED 成员，再写入现有 `AssessmentEpisode.courseId` 并将新 assessment 绑定它。无需新字段／表／迁移。

- 新 Episode 使用 STUDENT_SELF，subject / initiator 为当前已认证作答者，campaignKey 为 `training-standalone-scale-v1:<scaleId>`，便于以后区分真实课程独立投放与旧 relational／组织 Episode。存储归属不授予额外结果受众。
- 共用库新使用许可限于**本次指定课程的创建者**，不能借另一课程尚有效的许可通过。本轮不更改其他原调用者的旧行为。
- 已有同课程在途作答沿原冻结准入恢复；仍沿现有同人同量表唯一在途索引。请求另一课程或想给原无课程在途作答补课程时返回 409，不能悄悄重分配来源。不新增多在途模型或索引迁移。
- 重启是新施测，重新验证原课程当前投放／成员／使用许可，并保留同一个 Episode。正式交卷继续原运行时与计分，归属保留。历史 assessment / Episode 不批量修改；无课程启动仍不填 courseId。
- 生产只触及 `scale-access.ts`、`scale-start.controller.ts`、`scale-restart.service.ts` 和原 `ScaleAssessment.tsx` 的请求接线；未改 `composite.service.ts`、Long START、Teacher、School 目录或 #422 认知适配。

**本切片完成新施测归属，不声称独立 Scale 群报读取器已经接通。** 后续按新 Episode + 冻结量表 runtime / 测量身份接现有来源／统计／Artifact；新旧课程或 C 版本不得混合。缺历史归属的 Scale / SJT 仍不能按课程汇总。Teacher 非 Form 合同方案另列，尚未实施。

定向验证：一个 exact-course 库许可用例；一个真实独立 Scale 新启动→同课程恢复→跨课程冲突→无课程作答不回填→重启→正式 FINAL 的隔离 PG 用例；一个真实 React 课程提示／必填资料往返请求用例。只新增三个不同 case，不重跑 #422 的四个应用用例或旧81／175／41项。受影响后端／前端各编译一次；首次并行采集候选 tree 时发生本地 Git index 临时锁冲突，后端编译尚未执行，已改为先串行采集一次 tree，再执行缺失的后端编译，没有删除锁／重置仓库／重复前端编译。
