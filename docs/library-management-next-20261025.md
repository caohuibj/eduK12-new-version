# 公共工具库管理：独立云端候选

## 基线和集成

2026-10-25 通过 GitHub 只读接口和 `git ls-remote` 核对：main 为 `25215dcc71dd7b4b205ebdef4c92ce9c5785836b`，#355 为 `f7b6c766ed41b734b21fab507ac0ab0d8d6eb603`，#356 为 `0d2e417d1f9ec06380a87dec1b241ee833d5880d`，两个 PR 均 open、未合并。#355 尚在修 CI，不能把候选作为验收通过基线。

独立克隆 `/workspace/eduK12-library-management`，分支 `work/library-management-next-20261025`。克隆自带 `work` 分支与建议前缀冲突，已仅在此克隆重命名为 `seed-main-25215`，没有修改远端。

从 #355 指定 SHA 起，按顺序 `cherry-pick -x` #356 三个提交及 dot 五个提交。完整来源 SHA→本地 SHA、105 个差异文件和 bundle 身份见 [integration.json](evidence/library-management-next-20261025/integration.json)。没有文本冲突。自动合并涉及 catalog.sources.ts、library-admin.service.ts、StandardTripletWorkspace.tsx、SurveyLibraryAdmin.tsx；这些仍须按真实合同验证，不把自动合并视为行为已通过。

Library 文件 `libfile_89850517a9b081919bfcc37ae8aafb22`（v0）经当前 Library 技能带入消费端云端，存在、128657 字节、SHA256 `1078ded9a43d01087af793a732b8e2dbfd72826468d567d38b401fd7520bdf49` 均匹配，`git bundle verify` 通过。末端 `02681f0a1a2b4c1d168cf9813cc4133949b72f22`、tree `59c507748b671a701f7f8bd91fc4bc68c797ef20` 与要求一致，独立输入 ref 为 `refs/inputs/dot-library-02681f0`。

## 分类现状与最小开发顺序

- 量表已有 constructOverlapTags、primaryDomain、population.respondentTypes、年龄/年级范围和 localization.targetLocale。dot 已完成36项的学生/测量内容/学科/学习动机中文读模型和服务器分页前检索；本轮扩展这些字段，不改 source 标签或科学 hash。
- 认知库已有 exact testType/engineVersion/scoringVersion、evidence-mapping.registry 和 domain.registry 的中文能力领域/细分标签。没有声明人群或语言的任务不从名称、参考样本、页面中文或产品学生角色推断适用范围。
- Survey 管理量表目录与标准版本目录已有共享筛选；governed 目录尚未接分类，研究者授权原来源目录尚无标签筛选。所有查询必须先限可见集合、再筛选、最后分页，明确选择精确版本。
- 原创量表的注册入库来源与作者身份正交。注册库不等同第三方，私有申请也不保证原创；来源、使用许可、科学成熟度和版本批准不作为普通分类标签。

先扩展共享分类（量表人群/语言与认知能力权威映射），再接现有目录读模型及共享筛选组件，然后完善精确版本授权页的检索、选中范围和状态；最后以只读预检呈现来源→安装/发布→版本批准→可分配阶段。分类资料修订先维持源码声明/既有元数据，不增加新的编辑 API 或三套版本表。

本轮只在管理目录读函数及其 UI 接入分类，保留批准、trial、授权写函数。`catalog.sources.ts` 的快照/发布/冻结实现和 `standard-triplet.service.ts` 的三轴核心不另行重构；涉及共同版本与 Training 的接口调整留给父对话协调。

## Notion 问题分流

已读取[入库优化](https://app.notion.com/p/404d27635a38810dbd19e1f820bd37bf)和[总报告](https://app.notion.com/p/404d27635a388145af7dd8c03bd8c842)。13 项不是13个产品故障：

| 条目 | 本轮处理与边界 |
| --- | --- |
| IN-01 | dot 可信自编链已集成；不伪造许可证，不重填工具内容 |
| IN-02 | 展示分阶段状态；脚本主动保护不能写成 API 拒绝 |
| IN-03 | 管理读模型展示阶段，C/P/R共同版本映射由另任务负责 |
| IN-04 | 合法单轴产生及共享消费为另任务接口协调点 |
| IN-05/06 | dot P/R文案修订已集成；不再重写报告或改分值/阈值 |
| IN-07 | 分类是发现资料；科学/运行快照和批准 hash 不随标签漂移 |
| IN-08/09 | 复用 dot 分类和跨页检索，补认知能力、人群/语言、授权操作 UI |
| IN-10 | 保留真实产品/本地化/科学门禁，逐项呈现；不批量批准其他17项 |
| IN-11 | 入口准入和目标 grant 继续精确检查；Training 21B/消费由另任务负责 |
| IN-12 | SDQ a05 修复已在 #355；#356 时间修复已集成；浏览器限制单列 |
| IN-13 | dot 科学地域默认值修复已集成；不改科学范围检查，提前提示 |

057f03da 的项目测量只读预检由另任务完成，未共享远端，本轮不重做。已有 dot 36 PUBLISHED/HIDDEN、36 ONLINE、108 合成 trial 报告属于其隔离执行证据，不能写为本云端新实测、生产部署或科学验证。

## 检查计划与限制

变更范围为共享发现分类、目录读模型和管理操作 UI；定向检查应发现分页漏检、错误标签/中文、精确版本选择、失败刷新和请求逆序，不启动全平台 CI/构建。主要执行位置为本云端，初步30分钟完成集成和首轮梳理，后续按实际变更选择合同/类型检查。相同不可变输入的既有证据才可复用，旧失败和本轮回归分别记录。

已读根 AGENTS.md、docs/release/README.md 的统一规则及公库相关段落。仓库无 `.agents/skills`，`/workspace/.agents` 为空。初始本机 Node 为24.19.0，仓库声明>=24.21.0；正式工具链资格不能仅凭旧安装推定，检查环境另行记录。

不操作 Mac、不连接生产数据、不入库实际工具、不自动发布或批准工具、不创建凭据、不扩角色。暂不 push、CI、merge 或部署。

## 本阶段实际交付与暂停检查点

按父对话最新指令，本阶段在封存后暂停，不再扩展功能。代码提交：`8a95facba6157c3f5a1be34ee279f5ea4533abbf`（共享分类、跨页检索、逐项精确版本选择）及 `f269feed24b31d8cf1f276f70cb953b7143fef8c`（只读阶段预检、科学地域提前检查）。

- 共享分类加入声明的人群、年龄/年级、实际语言；认知能力由精确任务的现有 evidence/domain registry 派生，不推定人群或语言。接入既有标准、Survey、governed、通用量表与授权目录，查询在分页前完成。
- 研究者授权页最多保留10个跨页明确选中版本，切换筛选/来源/目标清空选择，每个版本单独调用原授权接口；没有全结果全选或标签自动授权。写入ACK后的只读刷新失败不自动重放写操作。
- 标准量表管理页按需只读展示来源→安装→发布→精确版本批准/试运行→Survey可分配状态。复用既有发布计划，目标用户grant保持未评估。安装计划提前拒绝科学地域不匹配；自编身份不放宽科学参考适用范围。
- 有界只读预检最多10项，拒重复、逐项失败隔离，不执行安装、批准或发布。手动标签写接口与批量写入仍未开发，没有新建版本表。

完整报告已写入并读取核对：[Notion交付报告](https://app.notion.com/p/404d27635a388155941fda24f5b1b666)。原13条问题分类、版本分工及批量幂等/失败恢复边界详见该页；未覆盖或替代另任务的共同C/P/R、Training消费、21B和057f03da。

### 验证与已知失败

本地原始结果的不重复case记录：后端83过；前端61过、2项既有失败。实际PostgreSQL16.15仅运行临时分类/分页夹具，容器已正常停止。后端生产tsc、前端app tsc观察到exit0；变更前端eslint退出0，保留3条既有ref-cleanup警告。原始reporter、失败历史、过滤数、环境与SHA见 [validation.json](evidence/library-management-next-20261025/validation.json) 和 [check-receipts.json](evidence/library-management-next-20261025/check-receipts.json)。收尾清单不追溯伪装成早期执行的运行时签名，不作为正式CI资格。

两项 `ScaleLibraryGovernance.rendering.test.tsx` 的 AuthProvider 缺失已在未改动的八提交集成基线和候选各自复现，保留失败，没有改弱断言。另一个全库统一预期第三方许可机制的旧断言也在未改动集成基线失败，已最小更正为识别可信自编，并继续断言不可自动使用/目标授权未评估。本轮的环境准备失败、新夹具身份错误、空查询/DTO兼容及标签改名失败与其纠正分别留存。

保留#355 SDQ修复，未筛选第二页的目录服务定向用例通过。本轮没有新HTTP、真人浏览器、响应式/WCAG、生产镜像、全量回归、CI或科学验证，不把dot的36/36/108隔离实测转为当前候选的新证明。

### 远端前移与协调点

最后核对#355远端已到`9065bb0ee73916d5e35f913b389f2ea55a9f0818`，main仍25215dcc、#356仍0d2e417d。本分支严格保留指定f7b6c766起点，未擅自重基线；新远端差异与本轮新增代码没有同路径重叠，但 `tool-policy.ts` 等被调用依赖已改变，仍需父对话协调最终集成和相应验证。见 [remote-drift.json](evidence/library-management-next-20261025/remote-drift.json)。

核心文件只改目录读函数与只读过滤；正文、参数、报告、授权/撤权写函数、三轴批准与trial函数、依赖/schema和CI配置相对八提交集成基线均保留，20项精确对照见 [protected-inputs.json](evidence/library-management-next-20261025/protected-inputs.json)。本轮唯一提前执行的安装门禁是保留科学地域保护、在计划阶段更早报错。没有实际工具写入或生产操作。
