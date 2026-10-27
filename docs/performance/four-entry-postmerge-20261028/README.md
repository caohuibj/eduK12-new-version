# PR363 合并后的四入口复核与下一小切片

基线 main `5c427f2bfe646def2200162bab449a0711a6e133`；PR363 正式 run40539444322 和 main source-only run40540701613 成功，未部署。本文与后续分页修改不冒用 PR363 的精确合并资格。

## 当前判定

- Teacher 原先缺少认知、SJT、任意组合的本人参与适配，现已接上；不是只加管理枚举。`HuiteacherMyAssessmentTasks` 实际加载共享 CognitiveRunner、SituationalRunner、FinalCompositeAssessment；`assessmentRuntime.client` 保持 Teacher cookie/CSRF/父子绑定，后端 `run.service` 对非 FORM/SCALE 校验 `assertTeacherPersonalAssessmentPolicy`，不再直接拒绝全部其他家族。
- School 与 Teacher 共用教育资源生产、C/P/R 冻结、分发和本人反馈服务，不复制计分引擎。School 学生与 Teacher 教师自评身份不同；学生评教师的群体 Form 仍是独立协议，不强行统一为本人心理报告。
- Survey 的研究波次 FINAL 与 Training 的 Composite/whole ACK 不同。已有流程保留，ACK、子项完成、父完成、报告可读必须区分。
- 源码及当前正式代表旅程未发现应重新开发另一套五家族运行器的依据。不能据此宣称20组合、全部工具、全部设备或生产内容均完成验收。

## 五家族 × 四入口当前能力表

| 工具 | Survey | Training | School | Teacher |
|---|---|---|---|---|
| FORM | 研究波次 FINAL/恢复；一般回执与描述反馈分开 | 共享表单 section/whole；父完成独立 | 共享 FORM_SECTION/教育 Run；按披露政策反馈 | 内置群体 Form 与本人私有 Form 两协议；均保留 |
| SCALE | 波次冻结与研究 FINAL/报告 | 共享 Scale FINAL/冻结版本/报告 | standard 与 private 等合法来源；本人报告 | 本人 Scale 与私有来源；组织、适龄和披露控制 |
| COGNITIVE | research 子session与父FINAL绑定 | 共享 CognitiveRunner/一次FINAL | 校园客户端接共享引擎 | 新正式任务客户端接共享引擎，不借Training身份 |
| SJT | native子attempt与研究FINAL | 原native/组合运行与反馈 | 校园native客户端/父推进 | 新Teacher native客户端，教师专用来源按已验证组织上下文 |
| BUNDLE | 研究package流程 | Composite同步/whole耐久ACK及worker | 教育Run绑定Composite及混合子项 | 教育Run绑定Composite及混合子项 |

上述是接线/协议归属表，不是20个新浏览器PASS。PR363新增正式数据库10条报告条件与2条Scale条件、浏览器School即时/Teacher即时/Teacher延迟三混合旅程、两管理页读取已成功；Survey/Training主要保留输入不变证据。浏览器包括同父恢复、各真实子FINAL、受控报告及落库指标核对，不包含完整管理编制UI、全部媒体或全部认知内容。

## 确认仍需补的系统缺口

1. 来源与 P/R 选择器超过50个候选整体报错。将现有登记列表的有界游标思路复用到这两个选择器；每页最多50条，按稳定ID向后游标，空的有效页也允许继续。每次服务仍校验当前组织、原准备、授权/素材；注册时再校验。分页不自动发布工具或替换旧授权。
2. 完成后自动读取反馈已经有，但仍是额外 GET；同 POST 获准反馈及请求内事实/版本复用尚未完成。需先测量热点，不能取消当前权限或延迟开放。
3. 新START只要求Measurement仍发布，P/R撤回按投影降级的政策需要明确合同。此项不在分页修订中偷偷改变；冻结完成与紧急停用边界保留。
4. 最新完整冷/热用户等待、存储物理/WAL/COS摊销、不同用户持续并发仍未完成。原小样本不是容量承诺。

## 当前分页小切片

改动仅教育共享 source/P/R 选择服务、路由、共享客户端/面板及直接测试；School/Teacher同时消费。Survey/Training不消费这两个API，不能给它们无效增加分页代码。应用无schema、权限、报告或计分变更。

验证位置：本地只做新分页UI合同、受影响类型、真实隔离PG的51来源/51报告边界和撤权。正式CI需另按当前精确差异设计，不能沿用PR363 marker放行；不启动全平台。所有结果按实际记录，不把测试定义、DRAFT包或GitHub分支当已上线。

后续内容验收顺序：工具完整性→计分/参数→报告文字/投影→许可和精确版本→导入器→公共库→系统管理员分配四入口。认知开发由用户管理，不干预其正在开发的分支。

### 本地定向结果

- 新分页 UI 3 PASS，旧13项过滤；51来源＋51报告的真实PG17定向旅程1 PASS，旧4项过滤，包含跨组织拒绝、非法cursor及报告grant撤回后继续读取不泄漏。每页50，最后1项可达，无重复。
- 前端app TypeScript、后端 TypeScript 均exit0；当前本地Node24.22.1。正式CI尚未激活，不能把本地通过称正式接纳。
- 初次测试追加路径错误导致0项选择、随后测试文字缺括号导致transform失败，原件保留；修正后才实际3项成功。未把空执行或语法失败算通过。
- 新建本地自有PG17/Redis，迁移仅为夹具准备，不是升级/恢复重验；测试后自有进程已停止。源输入摘要为执行后记录，未伪造原签名/安装依赖完整字节。PG驱动打印的旧“fixture shell”文字不准确，本轮实际直接运行Vitest，不替换产品服务。
