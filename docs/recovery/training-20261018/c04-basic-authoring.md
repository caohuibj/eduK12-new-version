# C04 基础高级 Form 编制 checkpoint

当前新增公开编制 NUMBER / LONG_TEXT / DATE / TIME。单题配置使用公共 FormQuestion；客户端不能指定 itemKey，服务器新建时生成 `q_<DB UUID>`，提交地址仍为 DB item.id。旧五题型不制造 formDefinition，不改变旧哈希、上下文或必答策略；legacy composite.addItem 的选填开放仅限新 typed 定义。新题不含图片、显隐、拒答、other/exclusive。时区必须显式冻结 UTC 或 Asia/Shanghai，日期/时间与数值约束均由公共内核最终验证。

Training 编制复用产品无关 BasicFormConstraints，作答复用 BasicFormAnswer，Survey 的编制、预览和作答使用同控件。控件不包含产品鉴权或图片 API。FinalCompositeAssessment 本机草稿、封存与恢复保持 number 类型，包括 0；空选填保持 null。旧 FinalQuestionnaireAssessment 使用独立旧后台协议，本批不开放 typed 题型，不扩张旧数据库/FINAL。

实际 Training 新主链是 questionnaire-product → composite；section Form 先提交，whole 路径接续 Scale 的原收据/报告 worker。导出仍明确拒绝，C07 才扩展，不宣称导出闭环。

## 本节点验证状态

- 独立 C04 worktree / backend 与 frontend node_modules，官方离线 npm cache，Node 24.21.0，fresh Prisma Client 5.22.0。
- 后端 45/45 定向测试通过，含 C04 authoring/schema/公共答案验证及 C03 facts；backend tsc 通过并生成运行 dist。
- 前端 46/46 定向测试通过；其后仅新增编制四题型测试，该文件 16/16 通过。合计目前 50 个唯一前端用例。
- 前端首轮 tsc 失败于公共控件参数比既有 Survey runtime DTO 更窄；已修为 renderer 接受现有运行字段，未改变服务端 schema。第二轮 app tsc 通过。
- 真实 HTTP、匿名/登录、发布/报告、浏览器与性能尚未完成。检查仍在继续；本提交是源码 checkpoint，不是完整 C04 验收。

修改组件 → 编制 schema/单次 INSERT 与共享控件、typed FINAL UI；检查目标 → 非法配置发布、数字字符串化/0丢失、空值混淆、封存恢复与Survey/旧题退化；主要位置 → 当前节点独占 measurement lock；复用 → C03 未改的数据迁移/V1/hash与运行前置 manifest 证据；预算 → 本轮针对性验证约 15–25 分钟，失败定点修复，不启动 CI、PR、生产或 Mac 操作。
