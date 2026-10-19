# C05 structured Form authoring checkpoint

范围：Training 公开编制 LIKERT / MATRIX / MATRIX_MULTIPLE / RANK_ORDER / SLIDER / CONSTANT_SUM；单题仍使用公共 FormQuestion，服务端 q_<DB UUID>，提交地址仍为 DB item.id。复用 assessment-core schema/normalizer 和 ProfessionalFormAnswer，不新增评分或答案校验算法。Training typed 定义现明确调用公共 forPreview 严格模式，防止宽松草稿模式放过空选项/空矩阵行。旧 null/V1 无定义路径不变，无数据库迁移。

“添加到测评”只保存配置完整的单题；未完成输入保留在编辑器，服务端拒绝时不清空题干/选项/矩阵行。整份问卷仍可处于草稿态。本单元不新增服务端保存不完整单题的协议，严格校验也用于 copy/FINAL；旧 C04 合法四类定义不受新增选项/矩阵完整性要求影响。

作答矩阵在组件边界将 rowKey 对象适配为公共独立 row key，回写时保留其他行。服务端继续展开收到的所有行（含未知行），交公共许可键验证，不能通过只挑已知行绕过未知字段拒绝。数值、数组、对象保持 typed 值封存和恢复；旧独立 Questionnaire 协议不开放结构化值。共享结构约束控件从 Survey 编制抽取，Survey 仍使用同一组件。

C06 显隐、拒答、other/exclusive、图片和 context 未开放；typed 导出仍等待 C07，明确 400。报告沿用 C03 V2 权威 facts reader 和无损 JSON 兼容显示，本单元不声称已完成 C07 的结构化报告布局。

修改组件 → Training 编制 schema/控件、FormPlayer/FINAL DTO、公共专业控件及结构化约束；具体故障 → 空定义发布、矩阵行漏失/未知键、排序不完整、数值强制字符串、0/null 混淆、封存恢复与 Survey 控件退化；主要位置 → 当前云节点 measurement lock；复用 → C03/C04 未变 schema/迁移、V1、权限边界与事实读取证据；预算 → 20–30 分钟以内源码 checkpoint，真实 API 按受影响范围补验。

## checkpoint 时已完成

- 独立 C05 worktree、独立官方缓存 npm ci、fresh Prisma Client 5.22.0，Node 24.21.0。
- 后端 46 个唯一用例通过：基础/typed facts/结构化适配；其中固定 golden 子集测试首次筛选误排全部字段，修为显式五题并断言数量后单独通过，不将空循环算有效 golden 验收。保留原47案例和golden文件，Training只剔除未开放拒答能力；含拒答行的 MATRIX 不移植。
- 后端 tsc/build 通过。前端 66 个控件/编制/FINAL 用例、48 个 Survey 直接影响用例通过；第一次新增恢复测试类型检查因联合 fixture 推导 optional undefined 失败，显式使用既有 FormPlayerValue 后再次类型通过。没有改变生产 wire 约束或测试断言来消除错误。
- 受影响源文件 eslint 0 errors。前端产物构建和真实 HTTP 匿名/登录 section/whole/报告尚待继续，当前不是完整验收。
- 浏览器沿用 C04 已确认环境阻塞，本轮不重试、不规避。C25 既有受控 HTTPS CI wrapper 后续补真实 UI；未启动 CI、push、PR、Mac 或生产。

## C05 后续验收（业务源码保持 checkpoint 不变）

- 真实 HTTP 一次 315 请求、6 组全部通过；登录与匿名各覆盖编制→preflight→发布→每个真实 Form section→typed FINAL→报告，以及 Form sections 后接 Scale whole→真实 report worker→报告。没有通过数据库改动合并区段。六种题型的必答值、六种选填 null、目标总和 0、旧文本共 14 个独立 section，报告逐字段比对。
- 非法定义在写入前拒绝且 revision/items 不变；非法选项/空行/未知行/额外行子键/多选边界/重复排序/范围步长/负数与错误总和均在 accepted snapshot 前拒绝。每个 section 相同提交重放的 snapshot ID/密文逐值不变；更改已提交内容为 409。匿名 recovery 恢复为同 attempt。
- whole 相同 HTTP payload 重发成功，Form facts 不变并完成真实 worker 报告。本轮未独立清点全部 Scale 副作用；原 Scale receipt/epoch/lease/idempotency 的相同源码证据沿用，不把 HTTP 200 当作全部副作用新验证。C04 错误恢复凭据/跨 attempt 403、C03 String shadow 毒化后权威 facts 重建证据按未变化权限/reader/report源复用。
- typed 导出明确 400；未开放 C07。C05 控件/编制/FINAL/Survey 共 116 个唯一前端用例，后两项新增“服务端拒绝后保留编辑输入”及 Survey V2 共享约束 total=0/整数/选数上下界，均只执行新增项。最终 app tsc、Vite build 和受影响源码 eslint 通过；既有大chunk warning保留。
- 证据在 `c05-evidence/summary.json`：固定源码 SHA/tree、每个业务文件摘要、实际 dist/Node/Prisma client 指纹、harness运行前后摘要、原始日志和前端build manifest。API 启动与消费 runtime 指纹一致，fresh PostgreSQL16.15 显式 UTC、Redis7.4.11、自建四进程清理验证通过。迁移只是创建隔离fixture，未把重放迁移当作新的整库恢复验收。
- 诊断观测：315请求发送62,393字节、返回2,381,329字节；顺序fixture请求耗时中位11ms、P95 33ms。两条whole各14个Form snapshot密文共6,730字节。API/worker每秒采样的最大RSS分别358,387,712/214,982,656字节（不是精确峰值）。未测CPU、SQL查询次数、并发容量或前后优化收益，不能推断能力提升。
- 浏览器未启动，本轮不重复C04已经确认的IPC失败路径；没有截图、视觉/响应式/无障碍、真实浏览器交互或正式CI资格。后续C25用用户已批准的临时HTTPS wrapper补验；C05功能API与组件证据不能替代它。
