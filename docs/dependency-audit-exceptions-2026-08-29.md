# 依赖审计例外登记（2026-08-29）

本记录只保留无法在不引入已知兼容性风险的情况下立即升级的审计项。每次依赖更新、前端大版本升级或安全公告变化时必须重新评估。

| 依赖 | 审计等级 | 影响面 | 当前缓解措施 | 责任人 | 到期复核 |
|---|---|---|---|---|---|
| `echarts@5.6.0`（由 `echarts-wordcloud@2.1.0` peer 约束） | Moderate（GHSA-fgmj-fm8m-jvvx） | 仅前端大屏图表/词云；恶意标签若直接进入 ECharts HTML tooltip 可能形成 XSS | 大屏所有题目选项、词云和文本答案先经过 `sanitizeText`；不启用 ECharts HTML 内容；CSP 保持 Report-Only 收集并在清理后切换 enforced；升级到 ECharts 6 前需完成词云插件兼容性验证 | eduK12 维护者/安全负责人 | 2026-09-30 |

当前 backend 与 frontend 的 `npm audit --omit=dev` 没有 High/Critical；frontend 仍有上述 2 个 Moderate 传递项。禁止使用 `npm audit fix --force` 作为绕过方案。

## 临时开发依赖例外：picomatch（2026-11-18）

- 唯一允许的 High 漏洞为 [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)（CVE-2026-112366）。GitHub 公告当前标记 **Patched versions: None**。
- 来源：Vite/Vitest 的构建测试依赖；生产运行时不接受用户自定义的构建 glob。此例外仅适用于开发依赖，不能用于运行时处理用户输入 glob 的场景。
- CI 强制先执行生产依赖 `npm audit --omit=dev`（High/Critical 必须为零），再执行完整 `npm audit`。完整报告只对能沿依赖链追溯到上述唯一公告的 High/Critical 项临时放行；新增独立高危、无法获取审计结果均继续失败。
- 上游发布修补版本后立即更新锁文件并取消例外；**下次复核：2026-12-02**。禁止 `npm audit fix --force` 大范围升级/降级或用 `--omit=dev` 取代完整安全审计。
