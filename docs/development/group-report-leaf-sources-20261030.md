# Training 固定 Bundle 叶工具群体报告

本批沿现有培训师课程的单次群体报告消费原生 ASSESSMENT_BUNDLE。只用已冻结 Bundle slot 与实际 item 绑定定位 Scale、Cognitive、SJT；Context 仍必需完成，不作为表单群体统计，Bundle Profile 不作聚合。原来的多波分析入口不随之放开。权限、正式结果选择、指标身份、质量政策、统计、人数下限、Artifact 与快照读取继续使用原实现，没有新表或第二套引擎。

发现原生 Bundle 新 parent 未保存实际课程来源；在已有创建路径写入当次真实 courseId 到 deliveryCourseId。无课程发布保持 null，旧缺失来源的结果不回填、不按今天名单猜归属。独立旧 Assessment 尚未接入，不称所有来源完成。

本地只做新来源的必要检查：一个绑定单元用例；一份真实 native 发布、必需 Context+Scale+Cognitive+SJT 正式完成后的叶消费与快照读取旅程；同一份保留结果的认知/SJT 指标补验；最终源冻结后一次受影响 backend 编译，预算约一分钟。沿用 PR408 的175项和 PR418 未变 frontend 证据，不重复应用测试、浏览器或科学协议整验。具体原报告、失败及续行边界见 evidence manifest。

真实 PG 首错是测试 bundleKey 含连字符。保留已发布素材，改合法 key 后续行通过，没有重复建发布数据。补验中认知断言完成，随后因测试把公开 SJT 写成内部 SITUATIONAL 而未找到工具；修测试命名后只续行 SJT。原失败保留，未将部分完成的认知阶段伪称为独立绿色 case。量表零值、单人隐藏、Context 拒绝和读取不物化 canonical 结果均已实际验证。

当前仅 Draft 工程证据。正式资格、具体 PR 合并与部署没有由这些本地结果自动获得授权。无生产访问。

自然提交点已无冲突对齐 main `55fab18e9933e58dcb800b20156f5b7e48858536`。当前产品提交 `08ccad064`，main 合入检查点 `f51d2275e065333ede10636605171404cca5e17d`；backend tree `60e3a0336b424f0ca3f665ff427251a4ca0c75d6` 的一次 tsc --noEmit 实际 exit0。frontend tree `6fbb37e3f7e15a4b185a2a9b5b69a6bf69f0e103` 与 PR418 相同。合入仅改变已有 CI 绑定文件，未变更这批业务输入，没有重跑已完成用例。

后续 Draft 以 PR418 的 `feat/group-report-teacher-subgroups-20261030` 为审阅 base，故完整差异也列有同步 main 的既有控制变动；不是新建或修改 CI 路线。本批尚未激活正式 CI，也未将本地无签名结果声称为正式接纳。

## mainfa 与集中review修订同步

已无冲突沿 School10bdaac26 → Teacher da00b2af9 → 子群 ef2554926 对齐个人纵向main fa038041c47b275d30ccb8b8b01ab019615906e0，并继承两项必要修复：Teacher POST成功先交付报告、目录GET失败只读重试；School仅列真实受众GROUP父/叶合同可用来源，私有组合当前INDIVIDUAL_ONLY不升格为群体授权。未复制个人/纵向权限或新增私有GROUP接口。

本批Bundle消费者代码未改，原PG/绑定/认知-SJT补验不重跑。新合并leaf组件整树的类型结果尚未执行；旧60e3/6fbb结果只代表原tree，不称为当前正式资格。School自己的最新类型与固定候选准备位于上游PR414，仍禁用、未正式CI。新leaf Draft的具体head/base已获用户明确授权，仅创建审阅，不Ready/合并/部署。Notion迁移期间记录保留Git，不写旧Qiang目标。

## mainf674 对齐与足量公开合同

原分支无冲突合入已冻结418及真实merge mainf674；三个生产文件边界保持不变，未混入群体纵向。原1人证明仅覆盖小N抑制，不能当作可披露多人聚合。保留原发布／完成场景，新增4份合成正式完成，仅选一条新合同：Scale N=5、mean0.4、SD_SAMPLE0.5477225575，公开state present；回读与生成相同且canonical物化0。原三项用例筛除，没有重做原发布／原答卷／浏览器。Cognitive/SJT仍仅按原单人投影和部分／续行原件披露，不称另有多人公开验证；独立旧Assessment仍待接入。

首错为保留隔离库缺少main已合入的personal_tracking列，发生在新parent创建前。原件保留；仅补齐四个已存在主线迁移后续验该一条通过，不新造迁移、不reset数据。首错产生一名未完成合成成员，不纳入完成群体，不据此补assignedN。当前新backend树只编译一次通过；frontend与main418相同，未复编。

新Draft在明确授权后向main创建；此前拒绝保持历史，先查重。为防止Draft开立机械重跑旧业务，沿现有group-report-draft明确该来源分支的3生产／2测试与原件目录边界，只做scope和稳定gate，不新增workflow或Ready／合并资格；单条新控制已通过。正式资格留独立授权／冻结点，当前无合并或部署。
