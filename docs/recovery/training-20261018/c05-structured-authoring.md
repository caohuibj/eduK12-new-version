# C05 structured Form authoring checkpoint

范围：Training 公开编制 LIKERT / MATRIX / MATRIX_MULTIPLE / RANK_ORDER / SLIDER / CONSTANT_SUM；单题仍使用公共 FormQuestion，服务端 q_<DB UUID>，提交地址仍为 DB item.id。复用 assessment-core schema/normalizer 和 ProfessionalFormAnswer，不新增评分或答案校验算法。Training typed 定义现明确调用公共 forPreview 严格模式，防止宽松草稿模式放过空选项/空矩阵行。旧 null/V1 无定义路径不变，无数据库迁移。

作答矩阵在组件边界将 rowKey 对象适配为公共独立 row key，回写时保留其他行。服务端继续展开收到的所有行（含未知行），交公共许可键验证，不能通过只挑已知行绕过未知字段拒绝。数值、数组、对象保持 typed 值封存和恢复；旧独立 Questionnaire 协议不开放结构化值。共享结构约束控件从 Survey 编制抽取，Survey 仍使用同一组件。

C06 显隐、拒答、other/exclusive、图片和 context 未开放；typed 导出仍等待 C07，明确 400。报告沿用 C03 V2 权威 facts reader 和无损 JSON 兼容显示，本单元不声称已完成 C07 的结构化报告布局。

修改组件 → Training 编制 schema/控件、FormPlayer/FINAL DTO、公共专业控件及结构化约束；具体故障 → 空定义发布、矩阵行漏失/未知键、排序不完整、数值强制字符串、0/null 混淆、封存恢复与 Survey 控件退化；主要位置 → 当前云节点 measurement lock；复用 → C03/C04 未变 schema/迁移、V1、权限边界与事实读取证据；预算 → 20–30 分钟以内源码 checkpoint，真实 API 按受影响范围补验。

## checkpoint 时已完成

- 独立 C05 worktree、独立官方缓存 npm ci、fresh Prisma Client 5.22.0，Node 24.21.0。
- 后端 46 个唯一用例通过：基础/typed facts/结构化适配；其中固定 golden 子集测试首次筛选误排全部字段，修为显式五题并断言数量后单独通过，不将空循环算有效 golden 验收。保留原47案例和golden文件，Training只剔除未开放拒答能力；含拒答行的 MATRIX 不移植。
- 后端 tsc/build 通过。前端 66 个控件/编制/FINAL 用例、48 个 Survey 直接影响用例通过；第一次新增恢复测试类型检查因联合 fixture 推导 optional undefined 失败，显式使用既有 FormPlayerValue 后再次类型通过。没有改变生产 wire 约束或测试断言来消除错误。
- 受影响源文件 eslint 0 errors。前端产物构建和真实 HTTP 匿名/登录 section/whole/报告尚待继续，当前不是完整验收。
- 浏览器沿用 C04 已确认环境阻塞，本轮不重试、不规避。C25 既有受控 HTTPS CI wrapper 后续补真实 UI；未启动 CI、push、PR、Mac 或生产。
