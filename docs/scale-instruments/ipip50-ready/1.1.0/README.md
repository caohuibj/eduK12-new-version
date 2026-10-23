# IPIP50 1.1.0 可执行研究准备版（未发布）

## 状态与边界

- `ipip50_zh_cn_research@1.1.0` 为现有 ScaleInstrumentSourceV1 可执行 DRAFT；不是 CATALOG_ONLY，也不是已安装、已发布、已验证或可对真实被试施测。
- 保留旧 PR #328 / `fa355ff2dcd859b57a4bf2e8bddd77f8d428e3cf` 的 1.0.0 材料及候选目录源码，不覆盖或改写冻结历史。1.1.0 增加执行定义、版本轴、报告、适用性及披露策略；中文题项本身未更改。
- 仅限18岁及以上成人自评研究/描述性反思。中文为独立 AI 辅助工作译稿，未经专家审核、认知访谈或心理测量验证，非 Jhu/Xu 中文版，不外推 K12。
- scientificMaturity=PILOT，未创建 scientificReview、InstrumentAuthorization、数据库记录、公共发布或真实数据收集。报告 qcReview 如实注明 AI 编辑核查，不冒充人类科学审核。

## 官方来源逐项核查

2026-10-23 直接核查以下页面。逐项英文、题序、中文工作译稿、五因素与正反向见 `item-source-audit.json`。

- 50题样表：https://ipip.ori.org/New_IPIP-50-item-scale.htm
- 五个10题计分键：https://ipip.ori.org/newBigFive5broadKey.htm （不混入同页20题版本）
- 正反向规则：https://ipip.ori.org/newScoringInstructions.htm
- 公有领域许可：https://ipip.ori.org/newPermission.htm

官方许可允许商业/非商业使用及改编；许可不等于本译稿有效性、平台授权或个人数据处理授权。论文仅链接，未复制论文正文。官网施测页本身说明格式是建议，不将本包锁序误称作者普遍强制要求。

## 冻结执行合同

50题保持原样，不插入注意力题；五个维度各10题，正向 r、反向 6-r，独立求和10–50，不提供总分、等级、阈值、常模、百分位、能力或人格优劣评价。情绪稳定性不改名为同方向神经质，智性/想象力不是 IQ。

允许跳题，缺失维度返回 null，不补值或折算。现有共用引擎将含不计分维度的整份质量标为 invalid，保留其余完整维度原始分，但抑制全部解释文字；本包不修改共用引擎。非法选项、未知或重复题号拒绝计分。此缺失策略为平台保守约定，非原作者规范。

指导语是独立平台改编，省略原示例的同性别/近龄比较与绝对保密承诺，不宣称施测等价。现协议将 catalog.construct.constructDefinition 映射为安装后的 scale.description，因此完整指导语/研究告知放入该现有字段；不是新增第51题。实际施测前仍须核查入口展示并补足真实数据用途、访问范围、保存期限与退出说明。

使用 versionAxes、ADULT_SELF 和已有 student 技术报告渠道；student 在此是本人报告受众，不表示未成年人。适用性策略实际要求 ageMonths >=216，缺少年龄不视为可用。respondent/subject/researcher 均不暴露逐题原始答案、逐题分及正反向转换；现共享报告仍输出维度的 expectedItems/answeredItems，因此维度→题号成员关系可见，不声称所有计分结构均隐藏。成人解释实际只对 respondent/subject 展示；虽然 researcher 能力配置允许解释，现 audienceContract=student 投影会抑制其解释。未配置 teacher，未知受众 DENY。

## 现有安装/发布协议

现有 source 注册、runtime compile、scoreScale、buildScaleResult、projectScaleResult 与 planScaleInstrumentInstall 均直接消费本包，无 schema、Survey 或公共计分器改动。

本轮只运行本地合成单测和无数据库 mock planner；未执行 install/publish 脚本或创建真实授权。现安装流程必须继续拒绝 DRAFT、LOCALIZATION_REVIEW_PENDING、LOCALIZATION_EXPERT_REVIEW_PENDING 和缺失部署授权。公共域材料权利不允许跳过这些门禁。

后续由授权流程完成中文专家/本地化审核、真实隐私说明与入口展示核验、明确适用范围的授权及发布，再用实际隔离数据库验证版本冻结/安装/施测/报告/撤回。不得将本地编译通过称为生产可用。

## 精确差异与最小检查

组件：新增IPIP50独立源/历史资料/注册生成索引/测试。风险：题序或极性错配、缺失补分、报告泄露正反向转换/逐题答案、误用于未成年人、绕过部署门禁。主要执行位置为本地，仅局部 package/runner/report/policy/install-planner 测试；不启动 CI、全量平台门禁、生产部署或数据库。

检查结果见 `verification.json`。依赖复用现有云端隔离归档，package-lock 与本工作树完全相同；这不是对整个归档字节的完整供应链认证。未对未修改组件重复检查。正式安装/发布及生产验证未执行。
