# 分级 CI 与历史资格证据复用：独立改造

该文档记录实施边界，不授权跳过任何必需的合并检查。

## 风险分类

- L0：严格限定的非执行文档。
- L1：局部 CSS/SCSS；全局字体、主题、tokens、依赖或构建配置不适用。
- L2：独立前端单测；或明确白名单内的后端 SJT 纯单测。
- L3：限制明确的单模块业务变更，仍执行其完整模块资格。
- L4：跨模块、共享 runtime、CI 配置、依赖、安全边界或未知变化，继续使用原有严格门禁。

Git raw diff 的新增/修改类型与模式必须安全；删除、重命名、软链或混合输入默认升级 L4。分类以 PR 对最新 main 的完整变更为准，不能只取最后一个 commit 降级。

## 已接入的提速

backend-unit 仅在 PR 完整差异全由白名单 backend/src/__tests__/situational/**.test.ts 构成且没有 PostgreSQL/integration/fixture 文件时启用。
执行 Node 24.21.0 的 npm ci、Prisma 类型生成、真实变更测试集合，并要求至少有一条通过的测试。新路由仍通过原来固定的 merge gate / ready PR，门禁会重算完整 diff，避免伪造范围。

其他旧的高风险应用路径保留不变，不会因新分类器自动跳过旧门禁。

## 历史结果复用：证据验证契约

ci-qualification.mjs 提供 closureDigest 和 verifyHistoricalSuccess。跨 commit 复用必须同时证明：

1. 官方 GitHub Actions 来源的相同仓库、相同 PR、相同 base，已完成的 run（允许整体 failure）、已完成且成功的具体 job。
2. 源 run 必须关联当前 PR，源提交位于当前 PR 历史；不能跨 PR、跨主分支或使用失败/取消的证据。
3. 72 小时以内的未过期 artifact；原始归档字节与 GitHub 官方摘要一致。
4. 原始与当前的所有资格输入 blob SHA/文件模式一致，包含 .github、相关代码、测试、夹具和共享脚本。
5. 复核必须产生当前 HEAD 绑定的 REUSED_VERIFIED，不能把旧 HEAD 的绿色 check status 复制给新 HEAD。

当前阶段只实现了验证纯函数与负向测试，未接入跨 run artifact 下载/认证，也没有授权生产合并门禁使用历史证据。
要全面缩短 #601 的重复检查，需要将官方 artifact 读取、闭包证明和可审计的执行/复用结果接入每个 job。验证不成立则正常执行。不得以缓存命中替代证据。

## 简化原则

仅保留一个固定 required context merge gate / ready PR。新路由小规模增量接入；禁止先关闭旧门禁再逐步补上。逐步将 6,000 行以上的旧历史 PR 特例抽出为生命周期隔离的 reusable workflow，并在消除行为差异后删除，不做一次性不受控重写。

在独立改造 PR 验收成功前不合并、不改变 #601。

## 首个接线的跨提交复用 lane

Backend Regression 使用独立的 `backend-regression-reuse` 任务，检索相同 PR 的官方历史 Actions run。原运行的整体 CI 可以失败，但完整的 backend regression 及其每个分片、汇总必须已成功；检验原始完整报告 ZIP 的 GitHub 官方 SHA256、每个分片的真实 checkout SHA 与覆盖范围，并比较旧 checkout 和当前 checkout 的整个 Backend Regression 依赖闭包，才发放 `REUSED_VERIFIED`。

无法取得任何证明时任务输出 `reuse_backend_regression=false`，原 Backend Regression 照常执行；复核过程发生异常、未完成或缺乏报告时不准绕过门禁。所有结果都经当前 HEAD 的固定 merge gate 校验。不采用旧提交的 success status 作为新提交的结果。

注意：这是真实接线的 **Backend Regression 一个 lane**；其他昂贵检查仍使用原执行方式。分级和检查点机制将逐步扩展，不应将单 lane 的复用描述成全 CI 全自动复用。

## 已关闭历史 PR 的 CI 清理

#356、#357、#363、#364 已关闭并合并（#356 的 post-merge 资格链路也已结束）。从在线的 `.github/workflows/ci.yml` DAG 移除了共 39 个只为这些历史提交服务的顶层 job 和 5 个僵尸 merge-gate `needs`，并取消 PR356 手动参数入口。主 CI 从约 6,639 行减少到约 3,206 行；原有 Backend/Frontend/Browser/CodeQL/Docker 等常规检查及固定 required gate 仍保留。

专用归档测试和脚本尚保留作为历史证据，不意味着历史路由仍可作为新 PR 的资格通道；剩余历史字符串需要谨慎逐步替换，以免误放行新工作流。新增的 `ci-legacy-retirement.test.mjs` 检查被移除的 job 不会被重新引入，以及当前 `needs` 不引用不存在的 job。
