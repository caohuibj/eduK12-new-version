# EduK12 认知能力评估体系｜多阶段路线图 v2.0

状态：v2.0 合并升级版（2026-10-31），取代 v1。分支：`cognitive/twelve-new-tasks-20261028`。
质量框架：AERA/APA/NCME《教育与心理测验标准》+ ITC/ATP 数字测评指南（2025 更新）。

## 一、总体路线：三阶段、三产品线、两个不可跳级

| 维度 | 阶段一 题库与施测 | 阶段二 标定与自适应 | 阶段三 综合评估 |
|---|---|---|---|
| 产品目标 | 测验可用 | 测量可信 | 综合评价 |
| 核心技术 | 题库与版本管理 | IRT/CAT/等值 | 多维模型/组合施测 |
| 分数 | 正确率、描述性反馈 | θ 及误差，条件满足时给年龄参考 | 分领域标准分、经验证的综合指数 |
| 科学成熟度 | 试测（PILOT） | 单领域验证 | 多领域验证 |

**不可跳级 ①（测量证据）**：工程可并行（阶段三子测验在阶段二期间开发），但任何报告能力的开放以证据阶梯为准，不以开发进度为准。
**不可跳级 ②（验收两轨）**：代码 CI 通过 ≠ 科学验收通过。每项交付物有两个状态：工程状态（onboarding/CI）与测量状态（seeds DRAFT / declaredMaturity / calibration 审核），后者独立评审。

## 二、版本身份体系（六流独立，阶段一一次留全）

| 版本流 | 内容 | 系统落点 | 状态 |
|---|---|---|---|
| `engineVersion` | 任务引擎（生成器/渲染） | registry 精确身份 | ✅ 已有 |
| `scoringVersion` | 计分规则与阈值 | registry + scorer | ✅ 已有 |
| `configVersion` | 难度、人群变体（儿童/青少年/成人固定组合）、profile | seeds + config | ✅ 已有 |
| `presentationVersion` | 报告文案与展示策略 | participant-presentation | ✅ 已有 |
| `bankVersion` + 题目元数据 | 题目身份、`source/license/ruleTags/itemSetRole(form/anchor/parallel)/calibration 参数引用` | 题库 schema（PR1 新建） | ❌ PR1 |
| `calibrationVersion` | IRT 参数快照：itemId、a/b、模型版本、样本定义、拟合诊断、标定样本边界 | 离线产物 JSON（PR5 新建）；只追加、不覆盖原始作答 | ❌ PR5 |
| `batteryVersion` | 专家组合：子测验清单 + 各自精确身份 + 施测顺序 + 报告模型；与 configVersion/scoringVersion/norms 相互独立 | 组合 config（PR11 新建），复用现有 bundle/assignment 施测机制，不建第二平台 | ❌ PR11 |

阶段一必须一次留全三件事（阶段二/三免重构的关键）：题目级来源与参数引用（PR1）、等值所需身份（`itemSetRole` 锚题/平行标记，PR1 schema 预留）、组合与报告的版本引用（`batteryVersion` schema 占位，PR11 前只冻结字段定义）。

## 三、证据阶梯 L1–L5（报告开放闸门，阶段三核心机制）

| 级别 | 可输出内容 | 解锁前提 | 现有机制挂点 |
|---|---|---|---|
| L1 | 单任务正确率、完成情况 | 评分契约可靠 | scoring contract + fixtures ✅ |
| L2 | 单领域能力估计 θ + 误差（research_only） | 该领域 IRT 模型验证（PR5） | metricDefinitions role + calibrationVersion |
| L3 | 领域内年龄参考区间 / 多领域画像 | 参考分布建立 + 跨群体可比（PR6） | reportMeta referenceMode literature→local + referenceEligibleMetricKeys |
| L4 | EduK12 综合认知指数 | 因子结构、信效度、常模三证齐全（PR12） | evidence-mapping + scientific-qualification（新建 battery 级判定） |
| L5 | 纵向变化推断 | 跨时间等值 + 练习效应分离（PR13） | 等值证据登记 + 纵向报告闸门 |

实现原则：L 级别由证据登记表**推导**（现有 scientific-maturity/product-readiness 扩展），报告层沿用 metricGates/withholdFlags 消费——报告措辞永远落后于证据，而非领先。L4 即使达成，也只称「EduK12 综合认知指数」，不宣称与韦氏 IQ 等效。

## 四、三条产品线分离

| 产品线 | 数据性质 | 边界 |
|---|---|---|
| 认知能力测评（本路线图） | 测量数据 | 题目曝光控制、锚题保密、证据阶梯 |
| 认知训练（独立扩展线） | 练习数据 | 可复用规则生成器出练习题，但**独立题池**、绝不复用科研锚题/冻结库；报告熟练度，不推断智力提升 |
| 认知特长与岗位匹配（远期） | 按使用目的验证的数据 | 不用 K12 常模；需成人参考样本与预测效度研究 |

## 五、PR 分解（13 个逻辑单元，可按仓库实际合并）

### 阶段一（立即实施）

| PR | 任务 | 交付 |
|---|---|---|
| PR0 | 基线卫生：分支既有 37 个后端失败（round2-profile-release 15、session.service 9、profile-freeze 4、flanker/patterncompare publish-prep 6、pr12/pr13 2、library-catalog survey 1）与 main 上 survey 边界失败；可修则修，不可修立 issue 归档 | 干净基线 |
| PR1 | 题库身份、来源、授权元数据 + license 发布闸门 | 题库 schema（license/source/ruleTags/itemSetRole/calibration 引用）；pilotPublish 校验：公开发布题目 license ∈ {internal-generated, public-domain, verified}，否则 research-restricted |
| PR2 | matRiks 离线生成与质量检查 | R 脚本（tools/，MIT）批量生成 2×2/3×3 JSON+SVG；质检 = 规则覆盖矩阵、干扰项区分度、渲染回归测试；R 不进请求链路 |
| PR3 | K12 配置、认知映射、双报告 | icarmatrix engineVersion 2.0.0（与 1.0.0 并存）：儿童 2×2/大按钮/无文字、青少年/成人 3×3 configVersion；icarmatrix 补 fluid_reasoning evidence mapping；presentationVersion 双层报告，规则族正确率 research_only |

阶段一完成条件：学生可在手机/平板完成；科研人员取得可复现逐题数据；历史 icarmatrix 1.0.0 记录不受影响。此时无资格输出 IQ/全国百分位/经验证年龄标准分。

### 阶段二（工程先行，证据随数据）

| PR | 任务 | 交付 |
|---|---|---|
| PR4 | 试次质量与科研数据集 | item-level 研究导出、数据质量检查（未完成/异常试次留痕、分层采样变量：年龄/年级/设备/版本） |
| PR5 | 离线 IRT 标定与参数版本 | CTT → 1PL → 2PL 递进；局部依赖/拟合/DIF 检查；mirt 离线；`calibrationVersion` 快照（只追加）；θ(EAP) 作 research_only 指标进 scoringVersion 2.0.0 |
| PR6 | 平行题组、等值、年龄参考 | A/B/C 平行版本 + 锚题等值；年龄参考分布。**三种证据三个独立状态标签**：年龄参考分布 / IRT 能力估计 / 题组等值，不合并 |
| PR7 | CAT 算法与自适应施测 | catR 模拟 → 小样本实测试测 → 上线。在线只做轻量 θ 更新 + 选题 + 停止规则（参数与信息函数缓存，不逐题拟合；断线恢复后选题状态可复现）；限最短/最长题量；题库不足退回固定版；禁止界面反推题库 |
| PR8 | 科研报告三层结构 + longitudinal 集成 | 原始得分 → θ+区间（术语藏于"了解测评依据"）→ 年龄参考（无常模不显示百分位）；纵向集成区分年龄发展/相对位置变化/练习效应/版本差异，重测增益不直接解释为能力增长 |

### 阶段三（与阶段二并行启动审计与开发）

| PR | 任务 | 交付 |
|---|---|---|
| PR9 | 现有 56 任务 CHC 复用审计 | 逐任务构念效度清单（复用 evidence-mapping + scientific maturity 现状盘点）→ Gf/Gv/Gwm/Gs/Gc 候选与缺口。不假定已有任务天然具备构念效度 |
| PR10 | 新增/升级子测验 | 按审计结果：复用优先（mentalrotation/visualwm/corsi/digitbackward/auditorynback 等已是候选）；缺口=Gv 图形拼合、Gwm 听觉顺背（音频管线现成）、Gs 设备受控版、Gc 相似性（P1–P2） |
| PR11 | 标准化认知组合 | `batteryVersion` + 三预设产品：认知探索版（10–15min）/ 基础评估版（25–35min，Gf+Gv+Gwm）/ 综合评估版（40–55min 可分段）；组合/计分/常模版本相互独立 |
| PR12 | 多维标定与综合计分 | 分领域多维模型 → 高阶一般因子检验；综合计分按 L3→L4 证据阶梯开放 |
| PR13 | 综合报告与纵向 | 四受众（学生/教育支持/研究者/群体管理）复用 School/Survey/Teacher/Training 权限与快照缓存模式；成人使用者不得套用 K12 常模；雷达图只作概览不展示微小差异 |

注意：PR6/7/8/12/13 的部分功能会长期处于「代码完成、科学验证待完成」状态——按验收两轨管理，正式发布依赖证据评审而非 CI。

## 六、试测样本策略（规划预算，非自动门槛）

| 数据阶段 | 目的 | 规模策略 |
|---|---|---|
| 认知访谈/可用性 | 适龄性、操作理解 | 小规模多年龄覆盖、迭代 |
| 初步项目分析 | 筛题、题目族与年龄适配 | 每主要年龄层约 100–200 |
| 正式 IRT 标定 | 拟合/精度/DIF | 按预定置信区间精度与模型仿真定；通常数百至上千有效作答 |
| 年龄常模 | 参考分布/百分位 | 独立代表性抽样方案；全 K12 细分可能需数千 |
| 重测/纵向 | 稳定性/练习效应 | 等值题组 + 对照设计 |

未成年人施测：学校组织 + 监护人同意 + 学生知情同意 + 数据使用边界，进入 PR4 的数据集设计。在线自愿体验数据只能做探索，不得冒充常模样本。

## 七、风险登记

- GPLv3 传染性（OMIB）：内容不随产品分发；对外分发需作者/法务确认（独立 gate）。
- MaRs-IB 非商业：仅限内部科研与等值研究。
- Gs 设备碎片化：跨设备分数不直接互换（2026 平板 vs 笔记本研究）；正式报告需设备等价证据或设备专属解释。
- TTS 变异（听觉任务）：PILOT 期 audioEnvironmentUnverified 留痕；科研版换录音资产。
- 本地样本不足：禁止 literature→local 升级，报告回退 simulated。
- OMIB 构造式→选择式改造：需重建干扰项并重新标定，不能直接视为已标定题。

## 八、工程惯例（不变 + 补充）

每任务一 commit；onboarding-check 全绿；守卫计数同步；seeds DRAFT 起步；typecheck + 测试全过再推。按 Huisurvey 最小验证规则：按实际改动选择必要检查，同一产物只构建一次，不对未影响的认知任务全量重测；统计验证与代码 CI 分别管理。

## 九、里程碑

- M1 = PR0–PR3 完成：数字矩阵推理 K12 版可内部试测。
- M2 = PR4–PR6 首轮：首批标定 + 研究参考带（code-complete，随证据开放）。
- M3 = PR7–PR8：CAT 模拟达标 + 三层报告。
- M4 = PR9–PR11：三领域基础版（Gf+Gv+Gwm）battery 可施测。
- M5 = PR12–PR13：综合评估 MVP（L4 按证据逐步解锁）。
