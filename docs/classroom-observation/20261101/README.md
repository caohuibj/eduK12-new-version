# EduK12 课堂观察候选内容包 v0.1.0

**状态：内容候选与实施交接包；未安装、未发布、未合并、未部署。**

基线：`caohuibj/eduK12-new-version@d7d43535c8eac445918ae113a43b1cc04032d310`。本轮按已读取的 `AGENTS.md` 与 `docs/release/README.md` 限定范围：不改业务源码、数据库、权限、生成索引、依赖或 CI。源码状态不冒称生产状态。

[完整内容与开发资料包](eduk12-classroom-observation-v0.1.0.tar.xz) · [来源台账](SOURCES.md) · [实际离线验证记录](validation.json) · [归档摘要](archive-receipt.json)

## 一、优化结论

量表负责自身计分和反馈；表单只保存原始观察记录；普通组合问卷固定工具版本与顺序。**本包不是 BUNDLE，不为表单增加评分或报告，不计算跨工具综合分。**

本轮交付三个首批组合，明确区分原版、衍生模板和评分伴随工具：

| 组合 | 实际交付 | 不能宣称 |
| --- | --- | --- |
| LICC 框架下的原创课堂记录 | 课堂信息 → 四维事实/问题记录 → 观察者反馈 | 不是原 68 观察点全文，也不是标准化量表 |
| RTOP 原表配套课堂观察 | 课堂信息 → 证据 → 25 项评分录入 → 观察者反馈 | 不含原 25 项题文；不能脱离原题表与手册独立施测 |
| Teach Primary 两段观察 | 课堂信息 → 第 1 段快照/行为/评分 → 第 2 段快照/行为/评分 → 观察者反馈 | 不是官方中文译本、完整培训包或含环境附加清单的全工具 |

RTOP 原题表未镜像进仓库；本包只提供编号对应的评分录入、五个分区及总分。LICC 表单为参考四维框架编写的原创记录模板。Teach 依据第二版（2021）手册，保留原英文行为名称、许可、署名与改编/翻译声明。

## 二、归档中的实际文件

归档共 25 个文件，包含：**6 份 FormDraft V2、2 份 ScaleDefinitionV2、2 份独立量表说明、3 份组合装配清单**，以及生成器、离线测试、原生定向校验脚本、来源、说明、摘要和原始验证记录。

```text
native/
  forms/context.json
  forms/evidence.json
  forms/observer-feedback.json
  forms/licc-inspired.json
  forms/teach-snapshots.json
  forms/teach-behaviors.json
  scales/rtop-score-entry.definition.json
  scales/rtop-score-entry.instruction.json
  scales/teach-element-ratings.definition.json
  scales/teach-element-ratings.instruction.json
  recipes/licc.json
  recipes/rtop.json
  recipes/teach-primary.json
  manifest.json
build_pack.py
teach-data.json
test_pack.py
validate-native.cjs
README.md
SOURCES.md
validation.json
syntax-validation.json
offline-tests.stderr.txt
offline-tests.stdout.txt
SHA256SUMS
```

解压：

```bash
tar -xJf eduk12-classroom-observation-v0.1.0.tar.xz
cd eduk12-classroom-observation-v0.1.0
# Linux 可用 sha256sum -c SHA256SUMS 核对解压内容
```

归档 SHA-256：`7d3dac7d7b4b76db6d84e11ca8fb7da34da70757a91cf2e0e5c88f1617758456`。Git blob SHA：`389c2f3f52f72d2e378abf87455ab0a60196385e`；上传返回值与本地计算相同。

## 三、测量与流程上的修正

### Teach：行为编码不等于要素分

行为在表单中按 L/M/H 或原手册允许的 NA 记录。观察者依据整段证据及完整锚点，再为 9 个要素分别评定 1–5 分；**不将 L/M/H 换算后机械平均**。本包保存 28 个主行为及 1.4a/b 两个子码，共 30 个行为编码字段，不把它们称为 30 个独立量表条目。

两个 15 分钟段独立记录，每段在 4/9/14 分钟采样。漏采不等于 0、N 或 NA。0.1=N 时 0.2=NA；0.1=Y 时按离任务人数判读。行为 1.3、4.2 的 NA 仅按手册使用。1.4 的分项与整体编码由观察者依据原规则填写；表单不计算。

两个时段复用相同叶工具版本，以不同 blockId 保存，不复制评分定义、不覆盖前段，也不增加跨段或跨维度总分。完整锚点、FAQ 与观察培训仍使用原手册。

### RTOP：录入真实原表评分，不伪造原题全文

25 项均为 0–4 分，按原五个连续五项分区保留 0–20 分及 0–100 总分。0 是有效最低等级，不是缺失。证据不足不得用 0 补齐。此候选不制造百分位、当地常模、优秀/合格阈值或教师排名。

### 身份与反馈：保持实际作答者

同一份组合由同一位受邀观察者完成。教师本人反思改为独立身份下的任务或既有协作记录，不让观察者代填，不在普通组合里虚构多人交接。

量表报告只解释本次课堂证据，不推断教师稳定能力。Teacher 正式证据投影目前展示获准的描述性数字或 WITHHELD，以及表单记录；不能承诺自动展示完整独立报告文字，或自动发送给受评教师。披露沿原冻结配置与读者权限。

## 四、与现有原生合同对齐

| 内容 | 已核对合同 | 本包选择 |
| --- | --- | --- |
| 表单 | `assessment-core/form/definition.ts` | FormDraft V2；既有页面/题型；不写选项 score、scoring 或 report |
| 量表 | `scale/scale-definition.ts` | ScaleDefinitionV2；observer_report；直接按题 sum；完整作答；无常模 |
| 私有量表 | `education-tools/private-tool.definition.ts` | 遵守 CUSTOM_DESCRIPTIVE：单响应集、单位权重、score_only，不放宽原校验 |
| 专家组合 | `education-tools/private-tool.composition-contracts.ts` | schemaVersion 2 / adapterVersion 2.0.0 / TEACHER + EXPERT_REPORT + PERSON |
| 活动接线 | `huiteacher/fieldComposition.service.ts`、前端 `HuiteacherFieldManager.tsx` | 复用来源绑定、邀请、START/FINAL、正式证据 |

后端合同路径前缀：`server-version/backend/src/modules/`；前端文件位于 `server-version/frontend/src/huiteacher/`。

`PERSON` 仅用于既有受评教师身份绑定，不改变工具实际评价的是课堂过程。非 PERSON 目标不携带本包 Scale。PEER 邀请存在不等于已开放本包 EXPERT_REPORT 的结构化评分流程。

专家组合不配置 contextFields、群体报告或纵向指标；专家背景不能成为受评教师的计分背景。建议标签只是说明，不冒充已注册 classificationTags。

## 五、按现有规范进入系统

1. 沿既有内容编制/入库通路准备叶工具，保留原版、衍生与评分伴随工具的真实来源；不能将外来工具假称自编原作。公共标准来源和私有工具各走原通路。
2. 使用当前原生验证器及 scoreScale 定向验证；固定内容、参数、报告及实施说明版本。无常模是明确配置，不补造参数。来源版本的专家适用性声明必须通过既有流程设置；本包内声明不是授权。
3. 从服务器读取实际 `provider + kind + versionId + contentHash`，作为 bindings。**文件 SHA-256 不是服务器发布 contentHash；不提供虚构版本 UUID。**
4. 使用离线装配器输出现有 V2 COMPOSITION JSON，再由原编制/冻结流程检查实际来源、所有权、适用性和授权。
5. 将固定问卷绑定到 Teacher 课堂活动，沿原专家邀请、接受、开放、作答与正式反馈链路使用。

```bash
# 仅生成候选文件，不联网、不安装、不计分
python3 build_pack.py build --out ./native

# actual-bindings.json 由真实目标环境返回的固定来源组成
python3 build_pack.py bind \
  --recipe ./native/recipes/rtop.json \
  --bindings ./actual-bindings.json \
  --out ./rtop.composition.json
```

bindings 的键为 recipe 中的 contentPath，值为现有来源引用对象。recipe 只是离线装配清单，不是新的运行时协议，也不是可直接发布的 COMPOSITION。归档不是系统新增的“一键上传导入”格式。

## 六、验证结果及唯一执行位置

| 改动 → 故障 | 检查 → 执行位置 | 证据 / 预算 |
| --- | --- | --- |
| 新候选结构/引用/规则 → 漏项、类型错、错误分区、伪绑定 | 15 项离线检查 → 当前隔离容器 | validation.json 与原日志；秒级完成 |
| 原生定向脚本 → JS 语法错误 | node --check → 同一容器 | 归档中的 syntax-validation.json；仅语法 |
| 打包传输 → 文件遗漏、损坏 | 归档回读、文件比对、摘要 → 同一容器；远端 blob 对比 | archive-receipt.json |
| 业务、数据库、权限、CI 未改 | 不运行其构建/整体验收/部署 | 不借历史证据冒称当前通过 |

**已执行：15 项离线检查通过；JS 语法通过；归档回读与传输 blob 摘要相符。** 离线断言检查结构、范围、引用、时段隔离、缺失绑定拒绝和确定性输出，不是系统原生校验器。

**NOTRUN：原生 TypeScript/Zod、实际 scoreScale golden、数据库安装/发布、浏览器、正式 CI、生产。** 因此不能把本包标为已入库或发布就绪。未克隆完整仓库或安装依赖，不声称有匹配的编译后端。

下一执行位为具有匹配源码/依赖的既有编译产物环境：

```bash
node validate-native.cjs /path/to/qualified/backend/dist ./native
```

该脚本只调用现有 Form/Scale 验证器、scoreScale 与组合 schema，不自动构建或启动数据库。应记录实际 dist 来源；成功也不等于授权、浏览器或正式 CI 已通过。后续只补受影响/缺失检查，证据接纳沿仓库现有机制，不重跑全平台。

## 七、后续批次与范围外

UTOP 双版本、MCOP²、ISTOF、eleot、FIAS/COPUS 和国内加权行政评分表尚未打包为执行工具。先核原文、NA/权重及实际来源合同，不能给表单加评分来填补缺口。

本轮不增加 AI 评分、事件编码统计、自动计时、附件接口、跨观察者平均、专家纵向比较、综合画像或新报告引擎。版权/联系作者状态与科学成熟度分别记录，不新增作者联系或真实数据的行政门禁。
