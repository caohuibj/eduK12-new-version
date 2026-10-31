# O11 — 单问卷打开失败的最小恢复（本地原件）

产品候选 `6c208bd3e85419b3d911dd1d5f22bb46d752fc44`；基准 `f5fa29314e`。
产品 tree `a0801daf9efe8c0f975622126c973819d61d0e70`；基准 tree
`8924079fcb1cf193deac45ac7d1a18080f581867`。后续本提交仅增加证据，不改产品。

打开网络错误显示规范化原错误并提供手动重试；重试进入 loading。
保留旧 runnerError 通道和成功三种分派，不改交卷、认证、Group、CI 或数据库。
只新增本页面状态，没有自动重试框架。

## 原执行与退出记录

以下均在本候选 `server-version/frontend` 目录执行。日志原文直接复制，
没有把历史文本加工成 JSON 执行结果。时间为日志内本地时区显示，非 UTC 标签。

- 红阶段：`./node_modules/.bin/vitest run src/pages/student/__tests__/QuestionnaireAssessment.open.test.tsx --maxWorkers=1 > /tmp/o11-questionnaire-red.log 2>&1`。
  产品仍为基准源码，仅加入首读失败恢复测试；原件 `o11-questionnaire-red.log`：
  **1 failed / 3 passed**，找不到 alert、仍显示不存在。该命令随后执行了 tail，
  所以工具外层 exit 0 是 tail 的结果，**未单独保存 Vitest 数字退出码**，不补造它。
- 最终绿阶段：`set -o pipefail; ./node_modules/.bin/vitest run src/pages/student/__tests__/QuestionnaireAssessment.open.test.tsx --maxWorkers=1 2>&1 | tee /tmp/o11-questionnaire-green-final.log`。
  原件 `o11-questionnaire-green-final.log`：**5 passed**。外层 shell 后续执行 lint、echo；
  没有单独打印 Vitest 数字退出码，测试成功由原始 Vitest 汇总支持。
- lint：`./node_modules/.bin/eslint src/pages/student/QuestionnaireAssessment.tsx src/pages/student/__tests__/QuestionnaireAssessment.open.test.tsx > /tmp/o11-questionnaire-lint.log 2>&1; echo lint_exit=$?`。
  实际工具输出 `lint_exit=0`。原件包含 0 error、1 个已有 useEffect 依赖 warning。
- types 两次均：`./node_modules/.bin/tsc -p tsconfig.app.json --noEmit > <log> 2>&1; echo types_exit=$?`。
  第一次 `o11-questionnaire-types.log`，实际 `types_exit=2`：新 worktree 没有 backend/node_modules，
  引起 prisma、express、zod 等缺失和后续类型错误。链接下述现有 backend 依赖后，第二次
  `o11-questionnaire-types-deps.log` 为空文件（编译器静默成功），实际工具输出 `types_exit=0`。
- `git diff --check` 实际成功。没有重跑旧完整测试、安装依赖、生成 Prisma 或联网。

测试包含旧三种成功分派、GET 抛错后的人工重试成功，以及 **fulfilled nonzero envelope**
旧 no-data 分支。最后一种是 mock 返回 `{code:404}`，不是 Axios 实际 HTTP 404 拒绝，
不证明真实 404 时隐藏重试。当前真实请求 reject 统一显示真实错误及重试；
也不把本组测试称为生产端到端或全部交卷恢复重新验收。

## 本次依赖与输入边界

worktree `/workspace/scratch/5a77e8bdc1ae/dot-questionnaire-open-retry-20261031`。
frontend/node_modules 链接到同父目录 `dot-main-review-perf-20261030/server-version/frontend/node_modules`；
backend/node_modules 链接到 `dot-school-login-local-20261031/server-version/backend/node_modules`。
这些是既有本地安装，不是本次 npm ci。对应 donor 与本候选的 frontend/package-lock.json
SHA256 相同；backend/package-lock.json SHA256 亦相同（见 inputs.sha256）。
仅锁文件相同不等于证明整个安装目录经过本次洁净重建。
工具：Node v24.22.1、TypeScript 5.6.3、Vitest 4.1.11（日志所示）。

`inputs.sha256` 记录产品源码、测试、锁、tsconfig、实际安装锁、Prisma 生成声明、tsc 实现的哈希。
类型检查成功之后额外执行一次只列输入的
`./node_modules/.bin/tsc -p tsconfig.app.json --listFilesOnly`，实际 exit 0，
得到 3514 个可达文件；没有再次执行语义类型检查或测试。
`reachable-inputs.sha256.gz` 是其按路径排序后的文件 SHA256 清单压缩原件，
解压后内容摘要也列于 inputs.sha256。路径保留真实依赖来源，包含前后端、类型声明及 TypeScript 库。

**这些输入哈希在执行后采集**，不是运行时读取追踪、签名证明或原子快照；
不能据此声称全局所有依赖在检查期间绝无外部变化。此目录只提供可复核本地记录，
不替代独立审查、CI、合并资格或部署验证。未上传、未创建 PR、未合并。

`types-terminal-excerpt.txt` 另存本对话实际工具执行与最终返回摘录，明确
session 77455 的原输出 `types_exit=0`，不是根据空日志推断。依赖符号链接
`server-version/backend/node_modules` 未跟踪且不属于任何提交/上传内容。
证据原日志末尾空行原样保留；证据提交的 diff-check 因这三份原日志末尾空行
提示 whitespace，不能把产品补丁检查通过扩称整个证据提交检查通过。
