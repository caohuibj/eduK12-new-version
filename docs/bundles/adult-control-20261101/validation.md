# 定向本地验证

以下均是本地开发证据，非正式 CI、隔离 DB、生产权限或生产安装证明。Node 使用 `/opt/codex/cua_node/bin/node` 24.21.0；依赖复用本环境现有锁定目录，未执行全库安装。Prisma/schema/依赖声明和锁文件未改。

| 检查 | 实际结果 | 原件 |
| --- | --- | --- |
| 新成人包 + 真实任务种子计分、原 ADEXI 计分、成人年龄边界、质量/缺失/零值、冻结读取 | 最终 9 PASS，exit 0 | [最终原件](evidence/backend-adult-final-import.json) |
| 原声明式规则消费者 | 4 PASS，exit 0；与成人包首轮同次运行，成人首轮 setup 失败单独保留 | [原件](evidence/backend.json) |
| BundleReport 原通用报告消费者 | 2 PASS，exit 0；与新增图表首轮共 8 PASS | [原件](evidence/frontend.json) |
| 双来源图表/原量尺、实际分母、d′负值、无界 RT 变异、缺失/invalid/redacted/limited、未知构念和无网络读取 | 最新布局 6 PASS，exit 0 | [最终原件](evidence/frontend-final.json) |
| 后端直接受影响 roots 的完整 TypeScript 前向闭包 | 1,197 文件，0 diagnostics，exit 0 | [原件](evidence/backend-types.json) |
| 前端报告与直接测试 roots 的 TypeScript 闭包 | 292 文件，0 diagnostics，exit 0 | [原件](evidence/frontend-types.json) |
| 4 个变更前端 TS/TSX 文件 ESLint | 0 errors / 0 warnings，exit 0 | 最终执行命令见下 |
| 现有 Bundle 生成物、旧版本不变性、依赖和四状态 fixtures | 全部 5 个声明包通过，exit 0；未重跑其他工具的参与者流程 | [原件](evidence/content-check.json) |
| Chromium 真实排版，仅合成报告 | 1280×1000、390×844；6 个原量尺图、无横向溢出/页面错误/API或外部请求 | [浏览器原件](evidence/browser.json)；[窄屏截图](report-mobile.png) |
| Git whitespace 检查 | `git diff --check` exit 0 | 未变更业务运行器、schema 或依赖 |

可解释合成样本使用冻结 seed：Go/No-Go 为 120 次、6/30 误按；CPT 为 180 次、31/36 命中，即 5/36 遗漏；ADEXI 的 14 个合成回答经过现有 scorer 得到工作记忆 23、抑制 17。无跨来源相加。hash 在该单元测试中仅用于合成来源投影，不声称完成了真实 CognitiveResultSnapshot/数据库 FINAL 持久化。

关键命令（均在对应 frontend/backend 目录，PATH 指向 Node 24.21.0）：

```sh
node node_modules/vitest/vitest.mjs run src/__tests__/bundle-onboarding/adult-control.test.ts --maxWorkers=2
node node_modules/vitest/vitest.mjs run src/pages/bundle/__tests__/BundleEvidencePanels.test.tsx --maxWorkers=2
node node_modules/eslint/bin/eslint.js src/pages/bundle/BundleReport.tsx src/pages/bundle/BundleEvidencePanels.tsx src/pages/bundle/bundle-evidence-display.ts src/pages/bundle/__tests__/BundleEvidencePanels.test.tsx
BUNDLE_CONTENT_BASE_SHA=24061f5e349d1f8df34b0ed5dd99a33e3014da8c node node_modules/tsx/dist/cli.mjs scripts/bundle-content-check.ts
```

类型验证采用 TypeScript createProgram，读取原 backend tsconfig / frontend tsconfig.app，roots 为原件所列直接变更 TS/测试文件，保留所有前向闭包诊断，不过滤错误；noEmit、不开增量缓存。不是全平台 tsc 或正式生产构建。内容检查在提交前读取当时工作树，原件 head 字段仍为基线；它不是最终提交的 CI 身份证明。成功内容 JSON 仅规范化末尾空行为单换行，字段与结果未改。

## 已保留的失败与修正

1. 初次包检查发现整数计数与 JSON number 类型不一致；仅修正依赖合同的这个兼容方向。最终仍用错类型反例验证拒绝，单位与精确来源不放宽。
2. 首次成人 suite 的 FORM slot 误带 valueSelectors，9 项未运行；按现有 FORM 合同移除，新包重新生成。[原 FAIL](evidence/backend-initial-form-contract-failure.json)。
3. 下一轮 4 PASS / 5 FAIL，根因是测试投影误用 `scoreKey` 读取现有 scorer 的 `key`，不是生产 scorer 错误；修正夹具映射，原数字断言保留。[原 FAIL](evidence/backend-adult-initial-fixture-key-failure.json)。
4. 首次后端类型检查因新测试导入旧 scripts/bundle-content-check，将旧脚本的 Zod record typings/rootDir 诊断带入。测试改为直接读取新包 JSON，仍真实运行两个任务 scorer 和 ADEXI scorer；未修旧脚本或过滤诊断。[原 FAIL](evidence/backend-types-initial-fixture-import-failure.json)。
5. 初次 ESLint 仅两个 Fast Refresh helper-export warnings。将字典/helper 拆到普通 TS 模块后 0 warnings；最后相关类型、图表消费者、浏览器布局重新验证。
6. 一次内容检查命令的 base 参数录入错误，现有严格校验拒绝、未执行检查；改用 `git rev-parse origin/main` 核实的完整 SHA 后才通过。失败不算历史校验成功。

最终保留四个已有引擎用例、两个原 BundleReport 用例的原成功，不因图表小幅布局重跑不变引擎。最新新增 9+6 个用例因测试 import/实际布局变化定向复验。没有用本地 PASS 掩盖正式 CI/DB 未执行项。

## CI 与范围

只交付 Draft 候选，提交带 `[skip ci]`，不主动启动资格 CI、转 Ready 或合并。原因来自已读取的仓库 AGENTS/CI 清单：真正激活前由主对话 dot 核对精确候选及未跑范围。该标记不构成任何 merge-ready 资格；后续如推进需按原流程独立复核并正常激活缺失门禁。无需增加审核系统。

本次没有 PostgreSQL/Redis/START-FINAL/报告真实落盘/恢复、真实角色权限 E2E、其他浏览器、认知任务实机计时、全平台编译、SAST、CI 或生产安装/发布/部署。来源与授权附注不阻止本 DRAFT 源码整理。
