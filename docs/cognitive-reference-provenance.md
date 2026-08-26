# Cognitive reference provenance

Round 1 参考层可审计来源。没有完成指标、年龄带和 protocol 映射的参数不得作为“文献参考均值”展示。

## 状态总表

| Set | Mode | Enabled | 原因 |
|---|---|---|---|
| `sim-k12-v0.1` | historical simulated | 仅历史兼容 | 固定种子均匀随机，不是文献样本 |
| `lit-sim-k12-v0.2` | internal simulated | 仅开发/QA | 分布形状参考常见发展范围，**未**从论文表中提取 mean/SD/n |
| `lit-reaction-rutter-2020-v1` | literature | no | 无已审核的 7–9 / 10–12 岁切片 |
| `lit-memory-woods-2011-v1` | literature | no | 听觉自适应 mean-span ≠ 视觉固定两题 `maxSpan` |
| `lit-stroop-forte-2024-v1` | literature | no | 7–11 岁 N=55、mean 干扰效应 ≈ 9.24±93.92 ms；与代码中曾出现的 190±70 / 125±55 n=150 冲突 |

## Direct literature

每套必须有 `provenance.sourceId`。`literatureSetIsEnabled` 要求：

- `enabled === true`
- `provenance.comparable === true`
- `transformation !== 'not_approved'`
- provenance.protocol 覆盖 resolver 使用的全部 gate 字段

当前三套均为 `enabled: false`，resolver 即使 protocol 匹配也返回 unavailable。

### Forte et al., 2024（Stroop）

- DOI: `10.1186/s40359-024-01844-0`
- 儿童组 7–11 岁，N=55
- Stroop effect 约 9.24 ± 93.92 ms（mean RT，含对数变换）
- 120 trials，fixation 400 ms，stimulus 最长 3000 ms
- 下一发表年龄组为 16–20，不是 10–12
- 本系统 `stroopEffectMs` = 正确试次 median RT 差

因此不得把 Forte 写成 K7-9=190±70 或 K10-12=125±55。

### Woods et al., 2011（Digit Span）

- DOI: `10.1080/13803395.2010.493149`
- 自适应、听觉呈现，指标为 mean-span
- 本系统为视觉呈现、每级两题、`maxSpan`
- 仅 `startLength=2` 不能视为 protocol 匹配

### Rutter et al., 2020（Reaction）

- DOI: `10.3389/fnagi.2020.00062`
- 跨生命周期网络样本
- 仓库中没有已审核的 7–9 / 10–12 岁 median RT 切片

## Internal simulated (`lit-sim-k12-v0.2`)

生成器使用 log-normal / beta / truncated-discrete 与固定种子，便于 QA 复现。文案必须是“内部模拟参考”，禁止“文献样本均值”。年龄带只在 Assignment 冻结的 `referenceBand` 精确匹配时使用；缺失或非法 band → unavailable，禁止回退到第一档。

## Historical simulated (`sim-k12-v0.1`)

均匀随机开发 fixture。兼容解析改为均值/SD 比较，但标签保持“历史模拟参考”。
