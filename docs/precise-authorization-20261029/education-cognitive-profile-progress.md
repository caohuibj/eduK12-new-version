# School / Teacher 精确认知授权与 T2 冻结检查点

基于 `254c5504156d09ce8146e9f83dc39db35b53add3` 继续。本阶段完成两入口的
精确 profile 授权、管理页/消费者接线与冻结；尚未完成这两入口的新认知正式
Run START / FINAL / 历史报告验收，不能称认知四入口整体完成。

## 真实执行范围

独立数据库 `precise_education_cognitive_profile_test_20261030` 从原合成教育管理
HTTP 库克隆，原 8 个合成演员和两个产品角色保持不变。API 使用实际受限
`precise_task1_runtime`，非超级用户、无建角色和 BYPASSRLS 权限。
正常迁移至 260；无新表/Prisma schema/client、生产库或真实用户授权。

main 原生 reaction config 1.1.0 / engine 1.0.0 / scoring 1.1.0 正常安装、发布，
系统通过原保护 API 分别批准 experience/research 的 SCHOOL/TEACHER 范围。
再通过原系统 API 给两名不同入口 manager 发指定学校、指定不可变全局 M 的
不可转委托分发依据；批准与使用权分开，不复制 Training MaterialGrant。

- 原两条 T1：School 心理教师体验、Teacher productAdmin 科研，实际密码、
  当前入口、学校产品/成员资格及精确 M 委托均校验。幂等重放成功，改原名称 409。
- 两入口消费者目录给出唯一固定业务配置，原 profile/hash/pointer 一并入草稿，
  API 改选另一个 profile 得 409。真实正常 freeze 各保存原 T1 指针。
- 管理员实际构建页面各做一次明确替换：School→科研，Teacher→体验。
  两次 POST 200，旧 grant 版本 2 / 已撤销；原冻结根保持原 profile/hash/指针。
  之后通过实际页面只读恢复原请求，不重复替换。
- 正常使用者再导入/冻结两条替换后的配置；最终回读为 4 条认知 use（2 撤销、
  2 有效）、4 个不可变父根/内部 assignment，两个入口各包含体验与科研原身份。
  同一 testType/config，体验 8、科研 60；没有执行本阶段被试 trial/FINAL。

管理页面复用原教育治理入口、sessionFetch、密码/近期 proof、CSRF/origin 和原
Redis 15 次/15 分钟限流。未冲洗计数或降低限额。构建浏览器全部流量拦截后仅
转发 loopback，0 外部请求、0 pageerror。MFA 是合成近期签名会话，不是人工仪式。
使用者目录的新精确配置不再提供 profile 选择；旧独立合法 native U 继续保持旧行为。

## 机械边界及冻结

具体输入输出见 `education-cognitive-profile-contract.md`。共用原教育配置审计和
ContentCapabilityGrant，T1 metadata 用明确 COGNITIVE_PROFILE kind 区分历史 action 名。
普通原授权读取校验原 entry revision、原 M 委托 revision、学校/产品、有效期及
精确 profile 入口批准，不把 hash 或 OPEN 当使用权。泛用系统 root 接口不能给新
profile 键创建无 T1 的裸使用权；旧 native U 格式解析不变。

T2 保存完整冻结配置/报告到既有 assignment 字段，私有 M 从已批准闭包的全局 M
投影。共同 prepared-runtime 只补教育冻结输入读取，不改 Bundle 编排或计分引擎。
后续 T3 将验证这一接线，当前不声称其被试路径已通过。

新增迁移 260 为既有 assignment、native unit、manifest 三个严格 seal 增加精确格式：
原格式仍要求原字段集合；新格式核 artifact/pointer、原 T1 身份、产品/学校/接收者、
profile/report/config hash、模板、源 M 和内部 assignment，未知前驱明确失败。
现有 root、assignment 不可变触发器保留。实际两入口负例拒绝另一个合法 profile、
另一合法 artifact、换 pointer、删 pin，以及改封存 assignment.courseSnapshot。

## 失败和恢复原件

原始命令/时间/退出、reporter、回读及原文件 SHA256 都在
`education-cognitive-profile-raw.json`；原日志仍在节点，没有改写失败历史。

1. T1/T2 初次两 case 在完整原意回读的 ISO 日期格式断言失败；T1、重放及改意拒绝
   已发生，未再签发。按既有 use 回读后继续两个草稿。
2. freeze 被原数据库精确 provenance 检查拒绝并完整回滚；原草稿、授权保留。
   迁移 260 首次最后一个函数有语法错误。已回读前两函数均未变化、失败迁移未完成，
   整体事务回滚后用正式 migrate resolve --rolled-back，再正常 guarded deploy 成功。
   只继续原两个草稿 freeze，没有重发 T1 或伪造成功。
3. 真实浏览器发现管理 API 直接返回 operation，而新页面按 Survey 包裹形式读取。
   两条替换已经实际成功，页面确认失败。修正页面及错误 mock 后，只恢复原请求；
   新构建只读浏览器两 case 通过，0 POST，不重做已成功替换。
4. 旧 STANDARD 回读补验最初误以为此管理 fixture 留有有效授权，实际原例均已撤销。
   改为核原撤权仍被拒绝。单项因模块初始化超过 5 秒上限失败后，以 30 秒单项预算
   实际通过（约 5.2 秒，含初始化）。不视为性能改造或业务读取 p95 结论。

最后一次 freeze 两 case 与 counterparts 两 case、浏览器只读两 case、原请求服务
只读两 case 均各有独立记录；不把它们包装为首次完整执行都通过。15 个旧相关单测、
3 个新身份边界、6 个新前端 API/管理/消费者契约及当前前后端 types/build 有原结果。
本地证据未签名，不是正式 CI。旧 native SQL 全生命周期、新空库从 0 初始化、
全部权限/并发/性能矩阵仍未在本阶段重新执行。

## 新 main 与后续

2026-10-30 本节点只读重新核得 `origin/main=dc796e04203696b4a579aa6fd2428df592031ee3`，
当前本阶段执行仍基于已整合的 `dc0f46ba506d51d42c5bb379059df82f18860b72`。
新 main 包含 #392 整包接入、#393 Bundle 报告和 #394 十份独立教师素材；没有新增迁移。
与当前 WIP 的直接共同接入点为 public-source.catalog、private-tool.routes 和
admin-authority 的包来源键支持。检查点后正常整合，保留双方精确边界，不改其控制文件。

未创建 PR、激活 CI、合并本分支、修改保护、部署或操作生产。
量表同 C/P 双非空 R 的第二份合法可执行来源仍缺，纯趣味 JSON 不算注册成功，
此前被拒的 DOT 混合工程树没有复制。
