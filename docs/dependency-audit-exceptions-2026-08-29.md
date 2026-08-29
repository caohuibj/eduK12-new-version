# 依赖审计例外登记（2026-08-29）

本记录只保留无法在不引入已知兼容性风险的情况下立即升级的审计项。每次依赖更新、前端大版本升级或安全公告变化时必须重新评估。

| 依赖 | 审计等级 | 影响面 | 当前缓解措施 | 责任人 | 到期复核 |
|---|---|---|---|---|---|
| `echarts@5.6.0`（由 `echarts-wordcloud@2.1.0` peer 约束） | Moderate（GHSA-fgmj-fm8m-jvvx） | 仅前端大屏图表/词云；恶意标签若直接进入 ECharts HTML tooltip 可能形成 XSS | 大屏所有题目选项、词云和文本答案先经过 `sanitizeText`；不启用 ECharts HTML 内容；CSP 保持 Report-Only 收集并在清理后切换 enforced；升级到 ECharts 6 前需完成词云插件兼容性验证 | eduK12 维护者/安全负责人 | 2026-09-30 |

当前 backend 与 frontend 的 `npm audit --omit=dev` 没有 High/Critical；frontend 仍有上述 2 个 Moderate 传递项。禁止使用 `npm audit fix --force` 作为绕过方案。
