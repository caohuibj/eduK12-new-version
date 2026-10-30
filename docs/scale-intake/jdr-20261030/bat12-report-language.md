# BAT12：独立题本语言与报告语言

本切片从 main `dc796e04203696b4a579aa6fd2428df592031ee3` 开始，独立分支 `feat/jdr-bat-report-language-20261030`。PR393已合并，正式限定CI40990866695和main轻量40991125414成功，不重放其应用用例；此前失败、过滤和权限拒绝保持原记录。

## 最小修订

既有 `definition.versionAxes.locale`／localization 是题本语言；`report.audienceContract.locale` 已属于独立报告内容，随报告版本及完整source snapshot冻结。旧结构校验强制二者相等，导致实际英文BAT12＋中文教师报告在交接时得到 `AUDIENCE_LANGUAGE_QC_REQUIRED`。现在只校验报告自身locale语法，不把它冒充题本翻译。测量、localization、部署locale匹配、披露权限和科学资格均沿原机制；修改报告locale仍须升级原reportVersion，旧source字节不能原地覆盖。legacy无versionAxes定义保持原行为。

直接加入已交接 `bat12_2020_en@1.0.0`，source SHA256 `baa4f770b82032e2397a26d8a2adef1fc857bf643f1ea0ba70c5527cbf99b19e`，与原件逐字相同。12题为工作相关23题正式星号子集原号1/3/4/9/11/13/14/17/18/19/20/23，英文指导语与1–5频率选项未改；整体均分、无反向、Pnone。complete_required为项目明示缺失政策，不是原作者插补规则；不做四个三题侧面的个人分类或欧洲切点。报告为原创单一中文教师语境，不称官方中文题本。原BAT23版本未改。

只提交已核到CC BY4.0论文附录／补充表支持再分发的选定英文题文和必要归属。2020 doi:10.3390/ijerph17249495 Appendix B TableA2；2022 doi:10.1186/s12889-022-12946-y Additional file1及官方选题交叉依据见source。私有PDF、HTML、手册和整个交接ZIP均未入Git。教师适用、中国样本和电子施测仍待实证，不因一次合同通过成为已验证工具。

## 实际验证与复用边界

主要地点为本隔离云端，Node v24.21.0，锁文件／Prisma未改；只运行本切片缺失检查。输入文件字节在执行前记录，执行后逐项不变；没有完整安装依赖字节证明，不补造历史环境。

- `node node_modules/vitest/vitest.mjs run src/__tests__/scale/structural-admission.test.ts src/__tests__/scale/audience-report-locale.test.ts -t 'retains report language|cross-language report axis' --reporter=json ...`：3 PASS／4 skipped，exit0。覆盖真实英文题本＋中文反馈、题本locale仍拒绝不匹配、原披露不提高、R版本变更／源hash／旧字节，以及原错误locale／重复band／缺score解释拒绝。
- 仅BAT12调用现有 `readSelectedSource` 和 `checkSelectedSource`：5 golden、6个不同输入计分，exit0，issues=[]。真实selected scorer与report消费者共用结果；没有重跑CBI/HSE十工具或其他量表。
- 静态读取105份现有版本化报告的locale字段，无非法格式；无逐工具计分、数据库或浏览器执行。旧gate首错沿交接原日志保留，不改成PASS。
- registry只用原generator更新；没有新renderer。单项数值呈现复用既有ScaleUnitReportCard量尺轨道，不加红黄绿、虚构常模或图片双归档。

当前只是可提交的DRAFT内容／共享报告机制候选；未执行全后端类型、正式新CI、DB安装/发布、分配、真实FINAL或浏览器，不将合同PASS当全通路PASS。

## 本候选正式路线计划

这是后端共享报告校验＋新内容的混合差异，不冒充纯量表内容路线。沿现有 `onboarding-structure` 做一个精确candidate记录，接纳上述已记录用例和BAT12 selected结果；只补最终组合后端类型、直接变化源/控制CodeQL与原stable gate。无前端修改，不构建前端；无DDL/持久化/FINAL修改，不重跑PG、dump/restore、原Bundle或浏览器。先交实际差异及原件独立复核，不先Ready触发全平台，不创建workflow或签名框架。

JD-R固定组成、成人条件和Profile仍属于下一切片。本候选不实施任何模型参数、标签权限提升、Modifier、可选工具或教育UI变更。
