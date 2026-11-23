# 量表、表单、SJT、认知测验与问卷（含跨工具 Bundle）创建、导入与版本管理标准指南

> 适用对象：系统管理员（System Admin）、内容管理者 / 培训师 / 教师、后端与前端研发人员，以及使用 AI 辅助创建/导入测评工具的协作者。  
> 基准代码：包含报告准入门禁（PR #794–#797）及「人类内容权威 vs 系统功能管理」简化治理更新。

---

## 零、设计原则：人类负责内容权威，系统负责功能管理

系统治理明确拆分为两条边界，避免用脆弱的运行时仪式替代人工判断，同时确保线上状态严谨一致：

| 边界归属 | 管辖事项 | 执行方式 |
| :--- | :--- | :--- |
| **人类管内容权威** | 版权许可与再分发范围、科学效度/成熟度判断、语言本地化审校结论、临床/教育适用措辞 | 由内容负责人、管理员与 PR 评审团队把关；不设运行时双管理员死锁、不设 7 天到期熔断、不设版权拦截或强制声明勾选框 |
| **系统管功能管理** | 不可变版本快照、Schema/依赖结构校验、黄金样例/合成试跑、工具级报告存在性准入（`DATA_COLLECTION_ONLY` 隔离）、角色边界（如 SJT 仅管理员）、CAS 并发保护与作答冻结隔离 | 全自动硬门禁，任何已上线/已作答定义不可原地改写 |

---

## 一、统一心智模型：原子工具与两种组合形态

| 对象类型 | 内容轴（C：题目 / 任务 / 计分） | 参数轴（P：阈值 / 常模） | 报告与反馈素材轴（R：解读文案 / 图片 / 模板） | 创建与导入主体 |
| :--- | :--- | :--- | :--- | :--- |
| **表单（FORM）** | 必需：页面、字段、必填/显隐逻辑 | 不存在 | 不存在（仅展示回执/填写留存） | 管理员 / 培训师 / 研究者（网页 & Excel/CSV） |
| **量表（SCALE）** | 必需：题干、选项组、计分规则 | 可选（可明确留空） | 可选（可明确留空；决定是否可向受测者展示报告） | 管理员（C/P/R 组件 Excel & 代码）；培训师/教师/研究者（网页 & 3-Sheet Excel） |
| **情境判断（SJT）** | 必需：场景/DAG 分支、通道、计分键 | 可选（可明确留空） | 可选（反馈片段 / 声明式报告模板） | **仅管理员**（网页模板/Excel 上传 + 代码静态包） |
| **认知测验（COGNITIVE）** | 必需：**前后端代码插件**（试次协议 + 计分器） | 可选（Profile / 阈值参数） | 可选（任务 `presentation` / 声明式报告） | **研发 / AI 开发代码插件** + 系统管理员后台一键入库、发布与 Profile 授权 |
| **普通问卷（Questionnaire）** | 固定顺序与显隐流的多工具集合 | 复用各组件自身参数 | 无跨工具综合报告；各工具独立计分并受工具级报告准入约束 | 培训师 / 教师 / 研究者（网页组卷） |
| **跨工具组合包（Bundle）** | 固定版本组件槽位 + 跨方法证据映射 | 跨组件输入与规则参数 | **有独立跨工具联合结论报告**（声明式证据规则引擎） | **仅系统管理员 + 研发 / AI 辅助导入发布** |

### 核心版本铁律（所有工具通用）

1. **已发布/已引用内容不可原地改写**：一旦版本上线、被问卷引用或产生真实作答，必须新建版本（升 `instrumentVersion` / `bundleVersion` / 创建同系列修订 `REVISION` 草稿），绝不原地修改已发布定义。
2. **报告准入在工具定版时决定，不在入口时乱改**：
   - 未配置完整报告内容（无有效阈值分段/解读文案/声明式受测者报告模板）的工具，在发布/冻结阶段自动判定为 `DATA_COLLECTION_ONLY`（仅数据采集），受测者端绝不暴露“半成品报告”。
   - 已有完整报告的工具，各业务入口在投放发布时仍可勾选“仅提供回执”（例如 `provideParticipantReport = false` 或 Survey `mode = 'GENERAL'`）。
3. **版本更新允许按职责拆轴（标准量表支持最完整）**：只补充阈值常模可仅升级 `P`，只优化科普报告文案/配图可仅升级 `R`；改变题目、选项分值或计分公式必须升级 `C` 并重新生成测量版本。

---

## 二、途径一：通过系统网页端创建、导入与管理

### 1. 自建描述性量表（培训师 / 教师 / 管理员）

- **入口页面**：`/scales` → 进入具体草稿 `/scales/:id`
- **一步 Excel 导入（推荐）**：
  1. 在草稿编辑页展开题目区，切换导入选项卡至 **「Excel 整份模板 (.xlsx)」**。
  2. 点击 **「下载 Excel 模板」**（`GET /api/scales/import/full-template`）。
  3. 按模板 3 个页签填写：
     - `选项组`：填写共享 `选项组` 标识、`选项值`、`选项文字`、`分值`（必须填有效数字，不能留空）。
     - `题目与计分`：填写 `题号`、`题干`、`反向`（是/否）、`选项组`、`维度标识`（多维度用 `|` 分隔）、`维度名称`、`聚合方式`（求和/平均）。
     - `阈值报告`（可选）：填写 `指标标识`、`分档标识`、`下限含`、`上限`、`含上限`、`报告文字`。**若整表留空，则视为仅数据采集工具（`reportConfigured = false`）**。
  4. 上传 `.xlsx` → 点击 **「预检 Excel」** 核对内容、计分项与报告资格 → 点击 **「确认导入并保存」**（基于 CAS 版本号与内容 `digest` 校验保存，无 10 分钟过期凭据限制）。
- **CSV 追加题目**：切换到 **「CSV 追加题目」** 页签，按 `item_code,prompt,reverse,score_keys,response_set_key` 粘贴（最多共 200 题），预检后确认保存。
- **复制与同系列修订**：
  - 已发布量表处于只读状态；作者本人可在详情页对名下非共用库、已发布 `CUSTOM_DESCRIPTIVE` 量表自由发起复制（`COPY`）或同系列修订（`REVISION`），不受版权元数据字段取值限制；共用库引用（`libraryEntryId != null`）仍保持只读。

### 2. 标准量表三轴管理与批量导入（系统管理员）

- **入口页面**：`/admin/scale-library-governance`（系统管理员进入 `StandardTripletWorkspace`）
- **「批量导入与草稿」页签**（`ScaleComponentManager.tsx`）：
  1. 点击 **「下载 Excel 模板」**（`GET /api/platform/survey-standard/component-template`），获取包含 `基本信息`、`题目`、`选项`、`计分`、`参数`、`报告` 等工作表的模板。
  2. 通过 `parametersMode` / `reportMode`（`PROVIDED` / `NONE` / `INHERIT`）控制独立更新 `C`、`P` 或 `R`。
  3. 上传 `.xlsx` → **「预览导入」** → **「确认保存有效条目」**。
  4. 在草稿编辑器中使用可视化 **「分档阈值报告编辑器」**（`ScaleComponentReportEditor.tsx`）维护分档解读、行动建议、局限与免责声明，并查看实时「报告资格」状态。
  5. 选择允许投放的业务入口，填写说明并完成管理员二次验证（`AdminStepUp`）后，**批准并自动试运行**上线。
- **「标准量表」页签**：选择已有 `C`、`P`（含明确无阈值）、`R`（含明确不反馈）版本组合 → **「核对三份版本」** → 选择允许入口 → **「批准并试运行，通过后上线」**。

### 3. 表单（FORM）创建与导入

- **Training 问卷中创建 / 导入表单**：`/questionnaires` / `/questionnaire-products/:id`，支持直接编辑题型或从已授权的 `FORM_TEMPLATE` 导入。
- **Education 私有表单导入**：在教师私有工具工作台（`EducationPrivateToolStudio.tsx`）粘贴 CSV 或多行文本，预检后按 CAS 版本与内容摘要确认追加并冻结为不可变 `EducationPrivateToolVersion`。
- **Survey 研究表单**：在研究项目中创建 `FORM` 草稿并支持 CSV/文本批量导入（`builder.import.ts`）。

### 4. 情境判断测验 SJT（仅管理员）

- **权限边界**：`/sjt-authoring` 与 `/api/situational/authoring/*` 的所有创建、编辑、修订、发布与停用操作**严格仅限管理员**（`ADMIN` / `SYSTEM_ADMIN`）；普通教师与培训师不能编制 SJT，仅可按授权查看分配给本人的只读受控发布信息。
- **单管理员直接发布（网页上传/在线图文）**：
  - 模板下载与上传位于 `/sjt-authoring`（支持 `SJT_上传模板_v1.xlsx` 8 工作表结构及在线图文编辑器）。
  - 完成预览作答验证与黄金用例检查后，管理员可**直接点击「发布版本」**（`POST /api/situational/authoring/drafts/:id/publish`）一次定版，不再需要提交给第二位管理员审批；同时保留兼容 `request-review` / `review` 状态流转与版本停用（`RETIRE`）。
- **Survey 原始 SJT 提交 & 静态包映射**：
  - `/admin/scale-library-governance` → **「其他工具与组合」** → `SJT`（`OriginalSjtSubmission.tsx`）。
  - `/admin/permissions` 中的 **「已安装 SJT 发布准备」**（`AdminStaticSjtPublication.tsx`）用于将代码静态 SJT 包发布为平台测量版本。

### 5. 认知测验后台入库、发布与 Profile 授权（系统管理员）

- **入口页面**：`/admin/cognitive-intake`（`CognitiveIntake.tsx`）
- **一站式后台操作**：
  1. 在已登记候选中选择目标版本，点击 **「预览所选配置」** → **「安装为草稿」**（生成 `DRAFT` 状态 `CognitiveTestConfig`）。
  2. 选中草稿态配置，直接点击 **「发布此配置」**（`POST /api/cognitive/configs/:id/publish`），系统校验代码插件与报告完整度后将其置为 `PUBLISHED` 并生成 `MEASUREMENT` 发布记录。
  3. 展开 **「Profile 准入审批」**，选择 `experience` / `standard` / `research`，点击 **「预览 Profile 摘要」** 核对 `artifactHash` 与报告标题；在下方折叠区完成 `AdminStepUp` 双因素验证后，勾选允许的产品入口（`SURVEY` / `TRAINING` / `SCHOOL` / `TEACHER`），点击 **「批准并启用此 Profile」**。
  4. 如需下线旧配置，点击 **「退役此配置」**（`POST /api/cognitive/configs/:id/retire`），停止新增使用，历史作答与报告保持不可变可读。

### 6. 跨工具组合包（Bundle）制作与发布（系统管理员）

- **入口页面**：`/admin/bundle-authoring`（`BundleAuthoring.tsx`）
- **简化发布流程**：
  1. 上传或编辑声明式包 JSON → **「校验与合成预览」**（验证包 Schema、依赖是否均已 `PUBLISHED` 及 4 组合成试跑场景）。
  2. **「保存草稿版本」**（登记不可变内容哈希到 `bundle_package_releases`）。
  3. 确认校验无 blocker 后，单管理员直接点击 **「发布此版本」**（`POST /api/bundle-products/admin/definitions/:key/:version/approve`）；若版本此前被置为 `HOLD`，同一面板可直接 **「恢复发布此版本」**。
  4. **无 7 天过期计时器、无 HMAC 审批签名密钥依赖、无 4 项内容复选框、无双管理员互锁**；但若底层包内容或 `SYSTEM_ADMIN` 账户状态失效，系统仍在准入阶段严格拦截。

### 7. 普通问卷组卷、报告开关与纵向追踪

- **Training 课程/通用问卷**：`/questionnaire-products/:id`
  1. 添加并排序 `FORM` / `SCALE` / `SITUATIONAL` / `COGNITIVE` 单元。
  2. 发布检查（`preflight`）确认内容与工具级报告资格：若所有计分单元均为 `DATA_COLLECTION_ONLY`，系统仅允许交付回执；若工具具备完整报告，发布者可在投放时选择开启或关闭 **「向作答者提供报告」**。
  3. 纵向追踪：已发布课程问卷可通过 `copy(..., { trackingNext: true })` 生成 `T2`、`T3` 下一轮草稿。
- **Survey 研究波次**：在研究项目中选择已定版工具、配置受测者反馈（仅对合格报告工具开放 `DESCRIPTIVE`，否则仅允许 `GENERAL` 回执），绑定已发布 `REFERENCE` / `REPORT`（仅 `audience !== 'researcher'` 的报告可向受测者展示）→ 冻结为不可变 `SurveyPublication`。

---

## 三、途径二：基于代码与 AI 辅助开发导入（标准工程流程）

以下四类场景建议（或必须）通过 **仓库代码 + 生成脚本 + 门禁校验 + PR 合入** 完成（可用 AI 辅助生成目录文件并跑通本地检查，**严禁手工修改 `*.generated.ts` 或 `generated/` 产物**）。

> 所有命令默认在 `server-version/backend` 目录下执行（除非另有说明）。

### 1. 标准量表（Code-Owned `ScaleInstrumentSourceV1`）

1. **创建目录与源文件**：
   - `server-version/backend/src/modules/scale/instruments/<instrumentKey>/<instrumentVersion>/instrument.ts`
   - 导出 `export const SCALE_INSTRUMENT_SOURCE = defineScaleInstrumentSource({ ... })`，包含 `identity`、`catalog`、`localization`、`executable`（`definition: ScaleDefinitionV2`、`references`、`goldenCases`）。
   - 若支持受测者/多视角报告，确保 `definition.report` 配置完整 `rawScoreFeedback` 或 `interpretations` + `audienceContract`。
2. **生成索引与本地校验**：
   ```sh
   npm run scale:instruments:generate
   npm run scale:instruments:check
   npm run scale:onboarding:check
   npm run scale:qualification:check
   ```
3. **上线**：在网页 `/admin/scale-library-governance` 中接入/批准试运行，或使用 CLI `npm run scale:instrument:install` + `npm run scale:instrument:publish`。

### 2. 情境判断测验 SJT（静态包 JSON）

1. **创建新版本目录（严禁覆盖历史已发布版本）**：
   ```sh
   npm run situational:scaffold -- <new-key>@1.0.0 --from <existing-key>@1.0.0
   ```
2. **编写 `instrument.json` 与全覆盖 `goldenCases`**（必须覆盖 V2 DAG 中的每一个通道、可达节点与决策分支边）。
3. **生成清单并检验**：
   ```sh
   npm run situational:manifest:generate
   npm run situational:contracts
   ```
4. **合入后上线**：通过后台 `/admin/permissions`「已安装 SJT 发布准备」完成平台测量发布。

### 3. 认知测验（纯代码插件：新范式 / 新引擎 / 新计分）

1. **后端创建任务包**：`server-version/backend/src/modules/cognitive/tasks/<task>/`
   - 包含 `task-package.json`、`definitions.ts`、`package.ts`、`semantics.ts`、`seeds.ts`（初始 `status: 'DRAFT'`）、`participant-presentation.ts`、`governance.ts`、`scientific.ts`、`fixtures/<engineVersion>-<scoringVersion>.json`。
2. **前端实现 Runner**：按 `task-package.json` 声明路径实现前端 Runner 与契约单测。
3. **生成前后端清单并检验**：
   ```sh
   npm run cognitive:manifest:generate
   npm run cognitive:contracts
   npm run cognitive:onboarding-check -- <task>   # 示例：npm run cognitive:onboarding-check -- gonogo
   ```
4. **合入部署后一键上线**：
   - 推荐直接在管理员后台 **`/admin/cognitive-intake`** 页面依次完成：**安装为草稿 → 发布此配置 → 预览并批准各 Profile 产品入口**。
   - 若需脚本自动化，也可使用 CLI `npm run cognitive:configs:publish -- --input <release.json> --apply --actor <system-admin-user-id>`。

### 4. 跨工具整体反馈问卷（Declarative Bundle）

1. **脚手架初始化目录**：
   ```sh
   npm run bundle:scaffold -- <bundle_key> src/modules/assessment-bundle/packages/<bundle_key>/1.0.0
   ```
2. **编排声明文件与 4 套合成试跑夹具**：
   - `manifest.json`（含 `slots`、`cognitiveDependencies`）、`evidence-map.json`、`rules.json`、`report.json`、`scientific.json`、`publication.json`、可选 `context.json`，以及 `fixtures/{valid,missing,invalid,not-applicable}.json`。
3. **补齐 CI Sidecar 端到端样本**：
   - `server-version/backend/src/modules/assessment-bundle/ci-fixtures/<bundle_key>/1.0.0.json`（含真实 `trials` 与选项样本）。
4. **生成清单并检验**：
   ```sh
   npm run bundle:manifest:generate
   npm run bundle:manifest:check
   npm run bundle:declarations:check
   npm run bundle:onboarding:check -- src/modules/assessment-bundle/packages/<bundle_key>/1.0.0
   ```
5. **安装并发布上线**：
   - **网页端（推荐）**：管理员在 `/admin/bundle-authoring` 导入该包 JSON → 校验与合成预览 → 保存草稿版本 → 发布此版本。
   - **命令行方式**：
     ```sh
     npm run bundle:package:install -- src/modules/assessment-bundle/packages/<bundle_key>/1.0.0 <system-admin-user-id>
     npm run bundle:package:publish -- <bundle_key> 1.0.0 <system-admin-user-id>
     ```
     （`publish` 命令已简化为可选第四参数，同一位 `SYSTEM_ADMIN` 可直接安装并发布。）

---

## 四、使用 AI 辅助开发导入的标准 Prompt 规范与自检清单

当让 AI 协助编写标准量表、SJT、认知任务或跨工具 Bundle 时，请在任务描述中强制要求 AI 遵守以下 5 条约束：

1. **绝不覆盖历史已合并版本**：任何修改必须新建版本目录（如 `1.0.0` → `1.1.0`），不得修改已上线版本的任何字节或格式。
2. **绝不手写 `generated/` 索引**：增删工具后必须通过对应 `*:generate` 命令自动更新生成文件，并以 `*:check` / `tsc --noEmit` 验证通过。
3. **严禁伪造诊断结论或跨方法换算分**：Bundle 规则与报告文案仅陈述已观测指标与合理边界，`limitations` 必须如实声明非临床诊断与不可互换性；认知测试 fixture 必须提供真实 trial 序列而非伪造汇总分。
4. **明确区分科研采集与受测者报告**：若工具无阈值/常模或尚未配置面向受测者的报告文案，不得配置假分档去绕过报告准入门禁；面向研究者的模板 `audience` 必须保持 `'researcher'`。
5. **交付前必须本地跑通对应静态与构建门禁**：
   - 量表：`npm run scale:instruments:check && npm run scale:onboarding:check && npm run scale:qualification:check`
   - SJT：`npm run situational:contracts`
   - 认知：`npm run cognitive:contracts && npm run cognitive:onboarding-check -- <task>`（示例：`gonogo`）
   - Bundle：`npm run bundle:manifest:check && npm run bundle:declarations:check && npm run bundle:onboarding:check -- src/modules/assessment-bundle/packages/<bundle_key>/1.0.0`
   - 通用：`npx tsc --noEmit`（后端）与 `npm run typecheck`（前端）
