# SPANE-12｜独立中文研究工作稿 v1.0.0

## 原版与内容
2009年Ed Diener及Robert Biswas-Diener制定的12项SPANE原表。完整正式英文与计分：https://eddiener.com/wp-content/uploads/2024/10/SPANE-Scale.pdf ，原始研究：Diener, E., Wirtz, D., Tov, W., Kim-Prieto, C., Choi, D. W., Oishi, S., & Biswas-Diener, R. (2010). New Well-being Measures: Short Scales to Assess Flourishing and Positive and Negative Feelings. Social Indicators Research, 97, 143–156. https://doi.org/10.1007/s11205-009-9493-y.

本版固定12项原序，问过去四周的体验；1–5表示从很少或没有到非常经常或一直。独立中文工作稿未获译审，不冒充官方中文版本。所有12项均是感受频率而非对生活的同意程度。

## 三个正式计分输出（无反向）
- SPANE-P 积极：1、3、5、7、10、12，六题原始频率求和6–30。
- SPANE-N 消极：2、4、6、8、9、11，六题原始频率求和6–30。
- SPANE-B 平衡：SPANE-P 减去 SPANE-N，−24～24。**不能把全部12题相加当幸福感总分**。

开发按原作者公式运行；本版自行规定“各域须6题齐全才计域分，平衡分需要两域均完整”，避免零补和估算，这是保守平台规则而非作者缺答标准。

## 现有平台的唯一特殊适配
现有`ScaleDefinitionV2` 的两种来源聚合权重必须为正，无法在配置层直接写 `P - N`。本工具采用现有 `scorerPlugins` 版本化扩展：`scorerKey=spane12.balance.v1`，位于量表自身`scorer.ts`；在`instrument.ts`内注册并由全局现成registry自动加载。没有修改通用计分、source schema、授权或前端。三个 score 均显式声明原范围，测试覆盖平衡±24以及缺答部分分数。

## 版本／标签／治理
- 内容、计分、工作译稿分别：instrument1.0.0/scoring1.0.0/localization1.0.0；指导语instruction1.0.0；报告report1.0.0。无真实ReferenceSet或阈值，score_only。
- 八轴标签为domain、construct、orientation、population、response、use、license、language_validation，此外加中文关键词。
- 著作权：官网允许非商业研究，平台译文及公开再分发范围由管理员协调；详见THIRD_PARTY_LICENSE.md。不存在“作者未回信所以停止内容开发”门禁。
- 本轮目标是内部版本结构和数学定义；静态对象／算术检查与源回读分别标记。Vitest、TypeScript、真实scoreScale/buildScaleResult、数据库、浏览器、CI、部署与发放全为NOTRUN。不把示例断言当作执行通过。

## 修改→检查→唯一位置→复用→预算
只增加本量表source/scorer/registry/定向测试和研发文档→避免正负颠倒、遗漏、虚构阈值和重复注册→本次GitHub对象与内存静态算术→复用官方PDF/本分支现有schema及SCORER支持证据、不跑历史无关检查→本轮只做静态编辑；运行证据另计。
