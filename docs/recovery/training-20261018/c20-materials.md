# C20 材料实验：checkpoint 01（开发中）

基线 c0cd98296915b7006d0f98495b75e18198647bd8 / tree54e1a8c8e5d00791ee30179d939d8a8a247eef93。仅当前 assistant 云节点，独立 worktree/deps/fresh Prisma；未 push、CI、merge、生产或 Mac 操作。本 checkpoint 是可恢复 WIP，不授 C20 功能、C25整合或 C26性能资格。

## 变更与检查边界

公共材料 schema/纯分配计划及 Survey 兼容适配 → 固定旧编译器 golden、错误次序/hash差分、确定性draw区间及quota/继承/事务适配；Training V2编制/分配/restart/path/报告导出 → 旧V1/null及组合拒绝、真实PG生产dist四工具和竞态；四表加法迁移/权限/不可变发布 → 正式runtime role/guards/旧4054行与非空dump restore；前端V2编辑和凭证轮换 → 定向类型、组件、build，正式浏览器仍C25。主要执行位置当前隔离节点，同输入只测一次，失败仅针对性续验。首次约20–25分钟恢复点，最长30分钟；各真实分项约5–20分钟，超预算报告具体阶段。

## 明确协议

- 旧 schemaVersion1 flow 及全null不加默认字段、不重算历史hash。新材料 schemaVersion2 复用C19 blocks/scanner/native，experiment 独立于 C14工具子集分卷。
- 2–8组、weight整数1–100；材料纯文本；可选quota每组1–10000，明确是分配机会，SCREEN_OUT不退额。仅余额组按权重抽，满组去除后为quota-weighted，不承诺精确比例/人数。
- KEEP_LINKED持久scope为owner+真实course+experimentKey+组键合同，登录主体使用唯一索引关联；普通匿名新链接不关联，restart沿原主体/claim。
- 四新表只存scope、唯一subject binding、发布/config/group配额桶、不可变claim。材料全集只在不可变trainingFlowFrozen，attempt既有candidate snapshot升级为V2，仅增加13标量materialAssignment字段，无材料候选全集；path只保存实际展示一组材料，proof绑定assignmentHash。
- participant返回仅已分配材料；teacher/researcher报告最小四字段provenance，CSV增加M_assignment_hash/M_group_key/M_material_digest；analysis来源指纹绑定assignment/path。
- 准入锁definition→（restart公开token→原attempt）→原user/course/release/asset→experiment→稳定bucket→binding/claim；首到达native/认知quota、材料quota、token usedCount同事务。恢复/GET不分配、不写材料quota。V2首native已纳同事务，未达不创建。
- restart任何普通匿名保持服务端锁定participantKey，随机新credential，同事务撤旧hash；失败保旧凭证。C20已接受任一FINAL不可restart；合法restart保claim/group/quota，重新绑定新attempt/epoch/hash，次数含ABANDONED。旧C14新attempt分配合同不改。
- 材料可独立或与已支持C19条件/END组合；继续双向拒variants/anonymousStudy/关系/报告包/复杂policies/optional native/额外条件语言。C21–24不顺手实现。

## 当前有限证据

公共worker：5个定向文件66 tests通过（48+18分批），含19旧Survey编译器golden及7quota fixture；不计为19+7额外测试。旧编译器来源固定c0cd982，日志与golden保留。共享算法无数据库依赖，Survey身份/事务/历史take100原样，不把其历史扫描复制到Training。

Training开发定向：6文件137 tests通过，覆盖新V2纯流/包身份和既有C19编制、consumer/finalizer/aggregate；随后少量scope/CSV/analysis/restart-token锁变动仍须受影响续验。此轮无生产dist/HTTP资格。后端tsc01初次报一处Prisma JSON静态类型，已修，尚待冻结构建；两次命令工作目录错误在任何检查前MODULE_NOT_FOUND，原日志保留，不计测试通过。

迁移：独立真实PG最小父表fixture初轮8 tests通过；其中“发布可改”旧预期随后被更严格V2冻结不可变合同替换，不能复用那一项。新增/替换3项通过，7未改项未重跑。原始首次仅工具输出，后补transcript明确来源，不冒原生tee日志；续验具before/after source manifest+log SHA。正式全库迁移/role/非空恢复未运行。

## 尚未完成

固定business输入build及受影响回归、完整真实HTTP/PG四工具、普通匿名/null与材料restart及四native能力撤销、KEEP跨发布/跨scope/满额、最后一个配额和双restart真实等待、故障回滚、报告CSV分析严格消费及10/20/50真实completed成本、旧事实和四新表非空恢复、独立review。新c20分项harness正在编写，未运行。原C19 state08只读；所有失败producer保留。
