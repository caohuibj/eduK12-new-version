# 认知能力评估多阶段计划（智力测验数字化线）

状态：提案 v1（2026-10-31）。分支：`cognitive/twelve-new-tasks-20261028`。

## 0. 背景与基线

- 现状：56 个真实任务在库，全部 seed 为 DRAFT、科学成熟度 PILOT。`icarmatrix 1.0.0` 已具备「冻结题库 + 规则生成」双轨（`tasks/icarmatrix/generator.ts`），governance 已声明「不换算 IQ、不与 Raven 等价、生成题未逐题标定」。
- 外部资源核查结论：matRiks（R 包，MIT，4/9 格矩阵 + 1 正确 + 10 干扰）、OMIB（220 题构造式，GPLv3，Koch et al. 2022）、MaRs-IB（80 题，非商业，青少年 IRT 数据）、MatriKS（2026，4–11 岁平板施测，α=.91，IRT+KST）、ICAR（公版但学术限定）。
- 总原则：不复制受版权题目；本地常模建立前不输出 IQ/标准分；评估与训练分离；三族版本管理（configVersion=难度与人群变体 / scoringVersion=阈值 / presentationVersion=报告）。

## 阶段 0：基建与基线清理（先行，全部小改动）

| # | 任务 | 落点 | 退出标准 |
|---|---|---|---|
| 0.1 | 题库元数据 schema：条目统一带 `license / source / ruleTags(family, ruleTypes, ruleCount, distractorType) / calibration(a,b,DIF 预留) / render 数据` | backend 题库目录 + zod schema | schema 校验纳入现有 fixture/contract 测试 |
| 0.2 | license 发布闸门：pilotPublish 校验新增规则——对外发布题目 `license ∈ {internal-generated, public-domain, verified}`；否则该条目只能处于 research-restricted（内部科研可用） | `cognitive-onboarding-check.ts` | 闸门测试就位，违规样例被拦截 |
| 0.3 | 补 evidence mapping：icarmatrix accuracy → `fluid_reasoning / rule_induction`（当前只有老 matrix 挂了域） | `cognitive-analysis/evidence-mapping.registry.ts` | catalog 域摘要非空 |
| 0.4 | 基线卫生（timebox）：排查分支既有 37 个后端失败（round2-profile-release 15、session.service 9、profile-freeze 4、flanker/patterncompare publish-prep 6、pr12/pr13 2、library-catalog survey 边界 1）与 main 上 survey 边界失败；可修则修，不可修立 issue 归档 | 对应测试文件 | 基线失败清零或全部有归属 |

## 阶段 A：数字矩阵推理 K12 版（icarmatrix v2.0.0，与 v1 并存）

| # | 任务 | 说明 |
|---|---|---|
| A1 | matRiks 离线生成管道 | R 脚本（`tools/`，MIT 许可）按规则族批量生成 2×2/3×3，导出 JSON+SVG 题库；R 不进请求链路 |
| A2 | icarmatrix engineVersion 2.0.0 | 渲染层支持矢量题库；选项策略 1 正确 + 5 干扰（从生成器 10 干扰中采样定死）；服务端正确性推导机制不变 |
| A3 | 人群 configVersion | 儿童：2×2、6–10 题、大按钮、无文字依赖（参照 MatriKS 平板经验）；青少年：3×3 混合规则；成人：3×3 全量。体验/标准/科研仅试次数不同 |
| A4 | 题源导入（科研限定状态） | OMIB（构造式→选择式改造后需重新标定，先内部研究）；MaRs-IB（青少年等值研究用）；逐题 license 标注，闸门拦截公开发布 |
| A5 | 前端/测试/报告 | SVG 矩阵组件、守卫计数、fixture、onboarding；presentationVersion 双层报告；规则族正确率作为 research_only 指标 |

退出标准：v2 与 v1.0.0 并存（registry 精确身份支持）；onboarding 全绿；儿童 config 通过交互预检。依赖：0.1、0.2 先行。

## 阶段 B：本地测量证据（数据驱动，与招募联动）

| # | 任务 | 说明 |
|---|---|---|
| B1 | 试测方案 | 分年龄段（低小/高小/初中/高中），IRT 标定建议每段 ≥300；理解性访谈 + 儿童认知预试 |
| B2 | 离线标定管道 | 作答数据导出 → mirt/catR（`tools/`）→ 逐题 a/b + DIF（设备/年龄/性别）→ 回写 calibration |
| B3 | scoringVersion 2.0.0 | theta（EAP）research-only 指标；锚题等值 + 平行版本 |
| B4 | 研究参考带 | 用 OMIB/MaRs-IB 已发表参数提供 `referenceMode: literature` 参考（明确标注非本地常模） |
| B5 | 设备等价性 | 手机/平板/桌面三类；决定 Gs 类任务常模是否分设备 |
| B6 | 科学成熟度升级 | 复用现有 scientific-qualification 机制：PILOT → 研究级 |

Gate：每年龄段样本量与信度达标前，theta 不进 referenceEligible，报告措辞不升级。

## 阶段 C：综合评估与画像

| # | 任务 | 说明 |
|---|---|---|
| C1 | CHC 域补全 | Gv：积木设计数字版（Kohs 1920 公版，canvas 拼块）；Gwm：听觉数字顺背（音频管线 + SpeechSynthesis，PILOT 带 audioEnvironmentUnverified 旗标，科研版换录音资产）；Gs：设备受控版 |
| C2 | 言语相似性（Similarities） | 自建题库，与 wordanalogy/wordmeaning 同族不同构 |
| C3 | 因子结构验证 → g 合成报告 | 本地数据 EFA/CFA；四指数（Gf/Gv/Gwm/Gs）+ 总指数，需本地常模与 referenceEligible |
| C4 | KST 规则能力画像 | 基于 A 阶段规则标签 + 知识空间理论；报告带估计不确定性，题量不足不出细分结论 |
| C5 | CAT 上线 | 先 catR 蒙特卡洛模拟选题路径，再服务端选题实装（禁止前端自选） |
| C6 | 纵向追踪 | 等值版本 + 变化报告 |

Gate：因子结构可复现 + 效度关联证据后，才输出标准分/百分位。

## 跨阶段产品边界（固定）

1. 不复制受版权题目（Pearson/Hogrefe/Raven Ltd）；来源逐题登记 rightsProvenance。
2. 常模建立前不输出 IQ/标准分/百分位；不宣称与韦氏/瑞文等效。
3. 评估与训练分离；训练熟练不解释为智力提升。
4. 题目曝光控制：生成轨 + 冻结库轮换；锚题池不外泄。
5. 版本成熟度可追溯：seeds status + declaredMaturity + rightsProvenance + license 字段四点联动。

## 风险登记

- GPLv3 传染性：OMIB 内容不随产品分发；对外分发决策需作者/法务确认（独立 gate）。
- MaRs-IB 非商业：仅限内部科研与等值研究。
- TTS 变异（C1）：PILOT 期以 audioEnvironmentUnverified 留痕；正式科研版换录音资产。
- 设备碎片化影响 Gs：常模分设备或限制设备范围。
- 本地样本不足：禁止 literature→local 升级，报告回退 simulated。

## 工程惯例（不变）

每任务一 commit；onboarding-check 全绿；守卫计数同步；seeds DRAFT 起步；前后端测试 + typecheck 全过再推。

## 里程碑

- M1（阶段 0 + A）：数字矩阵推理 K12 版可内部试测（约 4–6 个工作块）。
- M2（阶段 B 首轮）：首批逐题标定 + 研究参考带上线。
- M3（阶段 C1–C3）：综合评估 MVP。
