# CCFQ-18 中文工作译稿：独立内容候选

## 当前状态

`ccfq18_zh_cn@1.0.0`：18 题、6 反向、两个九题均分 1–7，**无总分**。

- source 为 `DRAFT`，目录 `CANDIDATE / PILOT`；中文本地化 `PENDING`，无 scientificReview、无 ReferenceSet。
- **未接入共享 registry、未安装、入库或发布。** 当前没有数据库可见性事实；未来获授权 materialize 新行时须维持默认 `DRAFT / HIDDEN`。
- 成人边界已在既有 applicability 声明为至少 **216 个月**；215 个月不符合，缺龄为不确定。这是本地政策测试结果，不表示真实入口已完成年龄采集/拦截验收。
- 中文题文、选项端点、指导语均为平台**未经验证的工作翻译**；专家译审、认知访谈和中文目标人群验证未建立。
- 此包可做离线内容、计分及报告合同验证，**不等于完整可施测页面**。

## 阅读入口

| 文件 | 内容 |
|---|---|
| `references.md` | 原始论文、证据范围、CC BY 4.0 署名与改动说明 |
| `scoring-and-thresholds.md` | 反向键、维度成员、均分、缺失政策及无阈值边界 |
| `report-example.md` | 明确标注的合成报告阅读示例 |
| `administration-and-translation.json` | 完整英中指导语、共有引导句、逐题对照及待接限制 |
| `source-en.handoff.json` | 原样保留的英语来源研究交接 |
| `validation.json` | 精炼验证摘要和仓库外原始证据的 SHA-256；不是 CI 或签名证明 |

## 指导语与 #356 待接

原共有引导句 `Generally, in stressful situations …` 工作翻译为“通常，在有压力的情境中……”。时间窗为一般/通常的压力情境，不加“最近两周”。仅 1/7 有已核实的英文文字端点，中文为“非常不同意”/“非常同意”；中间 2–6 只显示数字，不自拟后称为原版完整选项。

当前 checkout 的 `ScaleDefinitionV2` 没有独立指导语/stem 字段；此包不扩展引擎，也不将指导语挤入题 1 或每个题干。文档内容未被 runtime 读取。**#356 完成后仍须显式接入并核验题前展示、固定题序和选项**，按相应版本轴冻结新输入，之后才能讨论正式施测页面资格。

## 权利、证据与报告边界

© 2018 Gabrys, Tabri, Anisman and Matheson；[原开发全文](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02219/full)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本平台 2026-10-25 新增中文工作翻译、数字呈现和原创通俗反馈，不改原题序、反向或聚合；不暗示作者背书，不额外添加非商业限制。代码许可证不抹去源题文/译文署名义务；说明和标签不替代部署授权事实。

原英语研究不是中国常模或本译稿效度证明。工具与 CBT 中的认知调节/应对有关，但非该疗法专属，不等同 ACT 心理灵活性。报告不设诊断、高低档或百分位，不要求压抑正常情绪。`ADULT_SELF` 明确成人；现有 schema 的 `audience=student` 是自答报告技术槽位，不代表 K12 适用。必填 `qcReview` 仅 AI 编辑自查，非人类专家/科学审批。

## 验证摘要

- 原单包测试：30 项通过、1 项测试 API 断言误用失败；只修复并复验失败项后 1 项通过。原失败身份和记录保留。
- 补成人政策后，仅运行直接受影响的 source 校验、报告序列化和新年龄测试，**3 项通过、29 项未重测**。合计覆盖 32 个不同用例，不称一次全套全绿的新执行。
- 更新后限定导入闭包的严格 TypeScript 检查退出 0；不是整仓类型检查。
- 原始 Vitest JSON、执行日志、路径错误、首次错误类型参数日志及旧输入快照均留在仓库外私有证据目录，不进入公开内容包。公开 `validation.json` 保留结果和摘要哈希；不丢弃失败证据。
- 未改引擎、共享 registry/生成表、依赖、数据库、CI 或其他量表；没有安装依赖、生成 Prisma、连接数据库、commit/push。

### 最小命令（backend 目录；用于需要验证的新输入，不要求重复本次成功项）

```bash
./node_modules/.bin/vitest run src/__tests__/scale/instruments/ccfq18_zh_cn.test.ts
./node_modules/.bin/tsc --noEmit --strict --target ES2022 --module commonjs \
  --moduleResolution node --esModuleInterop --resolveJsonModule --skipLibCheck \
  --types node,vitest/globals src/__tests__/scale/instruments/ccfq18_zh_cn.test.ts
```

本次年龄增量仅选择：`-t 'passes strict source|builds serializable descriptive reports|enforces adult eligibility'`。后续新 main 隔离集成、注册、正式资格与推送由根任务处理，本包不声称这些步骤已经完成。
