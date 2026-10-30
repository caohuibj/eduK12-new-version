# 教师 JD-R 固定 Bundle：实施候选与验收

2026-10-30。起点 main `1cc077a8ee8e9475799788ab2b8bf5a4511630fe`；独立分支 `feat/teacher-jdr-bundle-20261030`。用户以 `Sentinel_3463f35a75fc8191b757c8c1110fceb4` 批准下述两项内容决定，现已实现源码 DRAFT `teacher_jdr_workplace_zh_cn@0.1.0`，并在隔离开发库正常安装、审核、发布、授权和完成合成任务。**尚未合 main 或部署生产**。目标是一个可重复 setup 的固定实例，不继续扩充所有候选工具。

## 已读依据与模型身份

已读项目 [10 总设计](https://app.notion.com/p/408d27635a3881618cd4fb1bf8d33a10)、已有私有 167 文件交接中的工作环境原件说明，以及本次 main 的精确 source。原设计的八核心/33题候选和未来离线 LPA 没有给出现成实证类别、中心或阈值；后续用户选择优先现成工具。本例另立 `teacher_jdr_workplace_zh_cn` 理论试验模型，不宣称覆盖原八域，不复制 EVC 参数，不称 LPA 类别或后验概率。

JD-R 提供工作要求、工作资源及相关过程的理论依据；四种高低组合在原设计中也只是示意。下述具体原型和数值是**待决定的项目几何配置**，没有教师样本校准。HSE 需求量表也不等于所有教学、情绪、行政或课堂管理要求。CBI 不提供本例分型的效度证明。

## 固定组成与冻结输入

建议固定五工具，共 30 题，所有工具必做。四 HSE 是唯一核心；CBI 只保留自己的独立报告，不进入画像、解释修饰或行动规则。无 Modifier、运行时选配或补做。普通组合使用相同五工具时只输出五份独立报告；理论 Bundle 另有跨工具模型。

| 工具精确键（均 @1.0.0） | 题数 / 实际 scoreKey | 原分数与缺失规则 | 本例用途 |
| --- | --- | --- | --- |
| `hse_demands_zh_cn` | 8 / `demands` | 1–5 完整作答均分，高分较有利，原工具已反向 | 工作量/节奏负荷 D：`(5-x)/4` |
| `hse_control_zh_cn` | 6 / `control` | 1–5 完整作答均分，高分较有利 | 工作自主性 R：`(x-1)/4` |
| `hse_managerial_support_zh_cn` | 5 / `managerial_support` | 1–5 完整作答均分，高分较有利 | 管理支持 R：`(x-1)/4` |
| `hse_peer_support_zh_cn` | 4 / `peer_support` | 1–5 完整作答均分，高分较有利 | 同事支持 R：`(x-1)/4` |
| `cbi_work_zh_cn` | 7 / `work_related_burnout` | 0–100 高分耗竭较多；该分数覆盖默认规则，至少 4/7 有效均分；题项允许缺答 | 仅独立结果 |

HSE 指令为过去六个月；CBI 为当前工作感受，未指定相同固定回忆天数。禁止用 CBI 补 HSE 缺失或称两者同一时间窗。范围转换不是常模、百分位或量表等值。源分数保留，不重新计分、相加或计算 D−R。

精确 source 文件在 `server-version/backend/src/modules/scale/instruments/<key>/1.0.0/source.json`，SHA256：

| source | SHA256 |
| --- | --- |
| HSE demands | `fa9805389127970a82db57efdb8dc99581693ad1e158cf258caff488e3ea0851` |
| HSE control | `8fcf12c2c622c76ad20628b691a888d44aa68947907081a3702d39163ef5cf57` |
| HSE managerial support | `a5ee5548a228a8d7192a9f30cec33fd598c9197d3ef8b52886cb7b2b93cac9f0` |
| HSE peer support | `44ffd13212577e820a4681df566a73ed8f60c3ae379caf908691b899f35e65d3` |
| CBI work | `bfef914b74e74fde7758fb79c11827c4627d86c309925eba01157ed2765eb260` |

实际包还绑定原机制的 C/P/R 版本与 measurement/runtime/source 身份，分别冻结 model/mapping/report 版本，不以本页文件 SHA 代替完整依赖校验。源码 PUBLISHED 不等于 DB 安装、PUBLIC 或已授权；不使用 DRAFT Skaalvik 或目录候选充当可执行依赖。HSE/CBI 原题许可与附注保持原 source，不公开私有研究原件。

## 已获用户确认的两点

### 1. 独立研究示范配置

推荐上述固定 30 题、四核心，使用现有 `weighted-l1-guarded-v1`。四个候选仅表示本次工作条件，不是永久人格或教师能力：

| 候选 | D 中心 | 自主 / 管理 / 同事资源中心 |
| --- | --- | --- |
| 要求较少、资源较多 | .25 | .75 / .75 / .75 |
| 要求较多、资源较多 | .75 | .75 / .75 / .75 |
| 要求较少、资源较少 | .25 | .25 / .25 / .25 |
| 要求较多、资源较少 | .75 | .25 / .25 / .25 |

建议 lowMax=.25、highMin=.75，中间区保持不确定；D 权重 3、三个 R 各 1，使要求域和资源域各占一半。资源仍逐维匹配，方向明显不一致的资源组合不硬塞进四类。minimumMatchingScore=75：对应原型在各自守卫区域内每维最大距离 .25 的几何下限；minimumMargin=10：仅为项目不确定性缓冲，未作实证校准。模糊平台 .25/.5/.75 只服务既有内部规则，不表示概率。

完整守卫内最近相邻原型分差至少 25，因此 10 不改变这些典型输入；守卫外按照已有绝对不匹配→近邻→规则边界次序弃权。本案与旧未采用草稿的 1/3、2/3、margin=0 不混用；已按较宽中间区和明确近邻状态编制0.1.0配置。缺失、invalid、真实范围外零、支持不齐及人口不适用均不硬分型。

### 2. 经既有审核的 Bundle 自有画像仅面向作答教师本人

当前 HSE 的 `scoreDerivedLabels=false`，现有投影因此必须 WITHHELD。建议只在 **Bundle 报告声明** 增加可选的自有画像内容与受众范围，进入原 content hash 和既有内容签审；源工具 numericScores、individualInterpretations 及实际整包/报告访问仍须允许。仅给本人，不能顺带开放学校管理者或研究者。原量表的标签、教育材料、原答卷权限不变。

这是用户明确批准的披露政策，落实为可选 `profileInterpretationContent=BUNDLE_OWNED_SELF`，只用于显式成人教师模型、沿原内容 hash 与独立签审；已批准的 `profileActionContent=BUNDLE_OWNED` 本身不自动授权核心画像。未声明的新包和全部旧包沿旧规则。教师自评 R 在冻结合同 `ADULT_SELF/teacher` 下接通既有 participant-self 投影，不把系统角色 teacher 当作可读所有教师结果。

## 报告样稿与图形

合成示例：原 HSE 分数 demands=2、control=4、managerial=4、peer=4，映射 D=.75、三个 R=.75，候选为“要求较多、资源较多”。CBI 可独立显示自己的合法分数，不参与这段文字。

> 从这次回答看，您近六个月的工作量和节奏带来较多要求，同时也感受到一定的工作自主性、管理支持和同事支持。资源值得保留，但它们不意味着繁重的任务会自动消失。这是对本次工作条件的理论描述，不是对教学能力的评价。
>
> 个人层面：挑一项近期最耗时的重复任务，记录可以协调或合并的环节，向合适的同事或负责人提出具体需要。
>
> 组织层面：可以与负责人讨论一项可调整的任务期限、流程或分工；调整工作条件需要组织共同参与，无需由您独自承担。
>
> 本报告只覆盖这里列出的工作要求和资源，没有中国教师常模，也不能判断疾病、绩效或未来离职。您可以分别查看已获准的各工具报告。

复用已有 Profile 原量尺横条与原型位置，不新建图表引擎。下面是同一示例的数值图示：

| 原工具量尺横条（1 → 5） | 您的分数 | 本候选原量尺中心 | 图下注明 |
| --- | ---: | ---: | --- |
| 工作要求条件 | 2 | 2 | 原工具高分较有利；画像计算时方向反射 |
| 工作自主性 | 4 | 4 | 高分表示资源较多 |
| 管理支持 | 4 | 4 | 高分表示资源较多 |
| 同事支持 | 4 | 4 | 高分表示资源较多 |

不展示雷达能力分、红黄绿风险、百分位或匹配“概率”。正文、图形和下载使用同一服务端投影；WITHHELD 不显示可反推画像的中心、候选、建议或原因详情。非 MATCHED 文案沿 PR393 的冻结状态模板机制。

## 最小工程与执行顺序

1. **不依赖上述决定**：在既有 Profile applicability 增加显式成人教师方式。两项必做布尔 Context 自述“已满18岁”和“目前在中小学有实际教学职责”；只控制本模型适用性，不授予身份、grant 或个人数据权限。保留 EVC 原 grade 配置与历史 hash，不新增通用人口规则引擎。既有 FORM 收集链只补该方式的中文标签。
2. 决定后，用原 package/manifest/install/publish/grant 路径编制独立 DRAFT 包；无 Modifier，固定五工具，绑定已存 FINAL 分数。Bundle 自有画像政策只在明确获准时实施，原报告与受众合同不放宽。
3. 隔离开发库走正常合成身份和真实审核/发布/整包授权，开始→恢复→各组件 FINAL→五个独立报告及综合报告→历史重开。INITIAL 唯一/重放和冻结读取在该一次旅程核对，不另做三入口重复流程。保存发布、DB 装载、作答、报告各自状态。
4. 用实际结果收口 `docs/bundle-declarative-onboarding/project/` 的四份既定 Project 文件。当前 main 尚无该目录；原暂停分支及私有交接已有草稿，复用这些草稿到原指定路径，不另起同类规范。草稿不能冒充已跑通。

直接共享文件预计只涉及 `assessment-bundle/profile/{contract,match,admission,report}.ts`、`assessment-bundle/onboarding/contract.ts` 与 `bundle-product/{service,analysis,survey-native}.ts` 的必要适配；实际受影响入口以代码回读为准。精确授权/公共目录/School 任务路由不在本轮改写范围。Survey 目前 native Context 仅接受 NUMBER，成人布尔不支持的入口如实列明，仅在真实实例需要时做薄适配，不为四入口齐全扩大范围。

## 验证、证据与正式 CI 计划

修改组件 → 具体故障 → 主要执行位置：

- 成人 applicability/必做 Context → 漏填、false、非法类型或错误配置导致误分型，旧 EVC 漂移 → 本云端一个定向模块；同一模块核 canonical 旧包 hash、年级边界与新表单元数据。不重复旧 43 例模型矩阵。
- 决定后的 JD-R 映射/投影 → demands 方向相反、非核心质量污染、越权标签或旧报告漂移 → 本云端一个定向模块，含手算典型、边界/缺失/零和限制受众。源工具计分未变，复用已有 source 资格，不重测每工具公式。
- 组合安装至 FINAL/重开 → 整包引用、持久化或冻结消费者接线不成立 → 同一隔离 DB 一条代表旅程，保留命令、环境身份、退出状态和实际报告；不重复模型单元断言或全入口浏览器。
- 后端类型/正式产物与安全 → 组合类型不兼容、未编译源码及受影响安全路径 → 在最终完整 diff 冻结后核现有 route，缺失检查仅选必需项，真实 CodeQL 与稳定 gate 保留。前端未修改不构建。若现有分类强制无关平台，先给出精确阻碍，不新建 workflow 或旁路。

本地定向检查预计分钟级；正式 CI 的精确 jobs、证据是否正式可接纳和预算在候选冻结后填写，当前**未启动 CI**。适用正式激活前读原 Notion checklist，首错保留、只修受影响项，同产物不重复构建。没有代码或输入变化的旧成功证据不重跑。最终给出精确 PR/head/正式结果，等待本轮具体合并确认；不部署。

## 成人适用切片实际记录

已增加 `ADULT_TEACHER` applicability，绑定两个不同、必做的布尔 FORM Context；原 grade 声明不加默认字段。中文表单复用已有单选和布尔提交转换，成人声明不写 canonical grade/role，不读取个人资料或变更授权。

- `profile-adult-applicability.test.ts` 首轮 7 PASS；随后补充“两个证据不能来自同一答案”的负例，只执行该变动 case，1 PASS / 6 filtered。其余六例未重复。
- 后端 `tsc --noEmit --pretty false` 首轮真实 exit 2：成人/年级表单返回联合类型使原写法触发 TS2783（重复字段展开）。改为先选择完整表单对象再展开，修复后同命令 exit 0；不改类型为 any，不降低断言。
- 原始 reporter、日志、退出码及命令/源码/锁文件/运行环境清单保留在本节点 `/workspace/bundle-inputs/jdr-bundle-20261030/`。这是本地结果，尚未正式 CI 接纳。没有安装、计分、DB 旅程或浏览器执行。

还确认既有 `dependencyBlockers` 将每个核心来源的 `versionAxes.subjectKey` 与整个模型 domain 相等比较。这只适合原 EVC 同学科映射，四个 HSE 各自有真实 subjectKey，不能伪改源身份。后续最小兼容修复是在每个 binding 的 source 中可选冻结自己的 subjectKey；未声明的旧包仍按原 domain 校验。不改 C/P/R 或授权服务。

## 逐来源身份与独立工具预览切片实际记录

上述逐来源 `source.subjectKey` 已接通，仍逐项检查原 runtime/measurement/scoring/localization/item 身份；旧包不新增字段，缺省沿原 domain。另修复 `verifyPackageFixtures` 对每个 SCALE 都解引用核心 binding 的假设：固定独立工具没有核心 binding 时不生成虚假的核心身份，既有核心分支输出不变。独立 CBI 在未来包中只占固定必做 slot，不映射进 Profile evidence。

- 新 `profile-subject-identity.test.ts` 首轮 2 FAIL：夹具从原 Value 工具继承了 1–6 转换范围，HSE control 实际为 1–5，原身份检查正确拒绝。只修该夹具范围；相同两例复验 2 PASS。未放松范围或身份断言。
- 新 `profile-independent-tool.test.ts` 1 PASS：原合成核心附加固定 CBI 独立 slot 后可预览，核心 missing/invalid 仍弃权，CBI 不进入画像文本。没有运行 CBI 计分或注册这个合成夹具。
- 前一成人切片的六个未变断言继续复用；新增可选 subjectKey 无默认值，旧 JSON 不增加字段；fixture 的核心分支仍选择原身份对象。前一后端类型成功只对应成人切片，**最终组合后端类型尚待正式检查**，不冒称新的组合已通过。

当前完整差异没有前端、数据库 schema/迁移、公共授权或 CI 修改。现有 `onboarding-structure` 在 `onboarding-scope.mjs` 明确硬绑定旧分支和候选（含 PR393），本分支不匹配；不能只沿用旧 PR393 资格。待两项内容决定及最终包冻结后，给出现有路线所需的最小绑定与缺失 backend 编译/产物安全/CodeQL/stable gate 计划，保持 Draft，当前不触发 Ready 的通用平台回归。不为本次独立分支新建 workflow，也不修改旧合并候选原件。

## 已批准实例的实际闭环与必要修订

上述“没有前端/公共授权修改”是86bd3efb0第一切片的记录；后续真实实例还需要以下小型修订：

- `profile/report.ts` / `bundle-product/analysis.ts`：新包的自有解释只给 participant-self，仍交集核心来源 numericScores 与 individualInterpretations。HSE 原 scoreDerivedLabels / educationalContent 均保持 false，staff/admin/parent 综合画像仍 WITHHELD。Survey 只兼容传入既有受众参数，没有新开成人 Survey 入口。
- `bundle-product/definition-provider.ts`：原发布预览要求所有 numeric 年龄边界都有年龄表单；仅为已验证的 ADULT_TEACHER、恰好18+且无上限的声明复用必做布尔 Context，不泛化任意年龄范围。
- `services/materialGrant.ts` 的 ASSESSMENT_BUNDLE 分支：声明式源码保持 DRAFT，整包授权必须检查实际签审发布记录；不能只按源码 DRAFT 字面值拒绝，也不能用五个叶授权替代整包 U。未改变其他资源类型或角色判断。
- 前端 `BundleProfileSummary.tsx`：移除写死“数学/三个指标”的界面标题和方法提示，使用统一中性界面文案。原包冻结的 summary/actions/states/model 参数及历史 hash 均未覆盖；不新增模型专用渲染器、图表引擎或图片资产。原单项解释已由现有 `interpretations` 正确消费，不添加不需要的 rawScoreFeedback 适配。

当前精确内容 hash：`05f3747aef60bfd3314c45fa89f570c4d1102e061f859687752d582a8db7024b`；来源/设计记录 canonicalHash：`7b19ab153a6a6c056c72c5c94c205caf8e7e1168d42f4cc2d0628cf0d07f6b54`。后者绑定旁边的 design-reference.json，不假称下载源码ZIP。

本轮新增9个模型用例 PASS；18+发布预览边界1 PASS；报告组件1 PASS。旧10项不重复。真实库是现有 loopback `eduk12_test`，仅补原 main 已有7项迁移，未新建业务表或改生产库。

| 原调用 | 实际结果与已到达阶段 | 后续处理 |
| --- | --- | --- |
| jdr-lifecycle | FAIL，五个依赖已正常安装/发布与叶授权；包预览拒绝 AGE_POPULATION_REQUIRES_DECLARED_CONTEXT | 仅补上述18+方式，依赖不重装 |
| jdr-lifecycle-r1 | 预览边界用例 PASS；旅程 FAIL。已正常独立签审、整包授权、投放、恢复、五工具 FINAL、J2、幂等重放；用例误查不存在的 rawScoreFeedback | 对实际 source 核实它使用 interpretations，改用真实消费断言 |
| jdr-lifecycle-r2 | PASS，从相同已完成任务只读继续，五份单项解释、J2本人反馈、staff隐藏、同hash重开、INITIAL=1和单元快照=6 | submitted=[]，没有再次计分、发布或FINAL；18ms不是首次FINAL指标 |
| jdr-workflow / r1 | 普通组合已创建并发布；先后错误假设DTO含内部null协议字段、平铺scaleId | 只读诊断确认DTO的reportPackage/analysisProtocol和嵌套scale；不修改产品、不断言虚假字段 |
| jdr-workflow-r2 | PASS，既存五工具普通组合无Bundle实例；登记合成0.1.1 DRAFT模板后原JD-R保存报告内容及hash不变 | 未对普通组合再次运行单项计分或发布新理论模型 |
| jdr-browser / r1 | 默认沙箱启动失败；正式审批允许官方Chromium启动后，记录器误将HTML当API JSON退出 | 保留失败，只改记录器限定/api/，无权限/owner/mode/TLS修改 |
| jdr-browser-r2 | PASS，真实cookie登录、4条原量尺图和文字表、两条本人建议、键盘详情、刷新同hash、390px无横向溢出 | 云端开发Vite/API环境；不是最终生产镜像验收，未截图归档 |

首个 FINAL 的独立耗时/CPU读数未在失败断言前保存，不能补造或为获取数字再次计分。本次只读续验为单样本：报告重开约24ms；完整响应约字节数及SQL计数见原 jdr-lifecycle-result.json，非性能优化或跨环境基准。资料索引、Project工作流、权限及状态均按实际完成区分；没有部署、真实用户授权或额外PDF/图片存储。

记录勘误：早先说明将旧数学 Value 的量尺上限误写为7；实际冻结配置是1–6，HSE是1–5。原测试始终读取真实配置，修复仅将新HSE夹具范围设为1–5；原附件中的旧叙述保留为历史记录，不改写原日志。

最终资格前对齐PR403/410的51项新增或更新目录素材：只读导入当前registry，五个真实来源SHA和版本、四核心runtime/measurement/subject/item身份均与上述冻结记录一致；51项目录没有executable，不进入本例选择。当前backend tree因此包含上游元数据，并不冒充原调用的环境。Draft首错41028004727是运行期间main推进导致的merge-preview不一致，应用作业未运行；原错误及证据限制保留，详见teacher-jdr-ci-plan.md。没有为对齐而重跑应用、FINAL或浏览器。

正式run41031648227已对e73d3745d完成所有限定检查。随后普通合入main31845e3a（PR411目录与PR404聚合报告）；41个直接业务路径、32个保护输入和五个工具来源均不变，新增聚合分支只用于Survey，与本次Training/module/组件case不相交。新registry只读身份核对通过，无计分或数据库访问。新前后端组件树另取实际编译/扫描/CodeQL资格；相同依赖与审计政策通过现有官方原件机制复用，23个应用case和原旅程保留其实际身份。
