# PR356 本轮修复的限定 CI 激活

用户在本对话明确授权“继续，收口，提交，激活 CI”。本轮执行位置为 GitHub Actions；不合并、不部署、不接生产。验收目标仍为 `PR356-merge-qualification`，累计正式失败从 0 计；不能通过改称“限定验证”重置失败轮次。

固定产品提交为 `48516ef5900cf9f711ea3cc852ac148cd221d7f8`，main 为 `ff8471e529e7b3c56e1e20f17d1e2581040fc896`。最终激活 head 由官方 PR API 与实际 checkout 精确比对，不用占位 SHA。317 个原始产品/文档路径的 mode/blob、两 application tree、schema/锁和完整控制路径均由 bindings 检查；base/main 或业务 tree 漂移即停止。最后提交仅增加本页及 CI 控制，不改应用。

## 选择与复用边界

- 限定 source、生产依赖 audit、main 230→237 的真实旧 FINAL/组合报告升级及独立 dump/restore、当前源的 Training 四用例和真实 worker 一用例、两生产组件各一次编译、保留镜像上的 HIGH/CRITICAL 扫描、同一 frontend dist 的 Chromium 状态页、JS/TS 和 Python 的 security-extended CodeQL。
- Training 四用例的旧成功早于指导语/冻结/授权改动；worker 旧记录是失败及分段 continuation。不能把两组当作当前完整 invocation 通过，所以这两组在 Actions 作为缺失项执行。正常开关不允许 continuation，报告必须精确 4+1、零失败、零 skip。
- 已有指导语、实际年龄、UTC、批准 scope、状态 SQL/HTTP、前端竞态等开发证据保留原报告，含失败与过滤项；CI 只核原 reporter digest，不重复这些检查。它们标为 `retained-development-observation`、`ciExecuted=false`、`originalExecutionSigned=false`、`qualificationClaim=false`。没有补签执行，也不把类型空日志当成功证明。未建立本地→正式合并门禁通用接纳。
- 后端 Dockerfile 的真实 build 包含 Prisma、生成一致性和 TypeScript 编译；前端 production build 不冒充 typecheck。此前实际本地 app types/lint 仅保留开发身份，本轮不重复。若正式合并独审要求更强接纳，须单独解决，不能靠本限定 route 冒认。
- 两组件只各构建一次；worker 使用同一 backend 镜像。镜像 tar/inspect/log 与 frontend 文件 SHA-256 清单保留，扫描/浏览器是独立消费者，不编译。相同输入的消费者失败优先复用原成功 producer；新 run 的脚本尚不支持跨 run 自动继承，禁止盲目整 run 重启重建。
- 浏览器只覆盖真实构建的接入状态：生命周期分离、退回动作、下一页/上一页、检索、昼夜/窄屏、无写请求与无横向溢出。HTTPS 由 Playwright 严格合成路由提供，验证 secureContext/crypto；不访问生产、不忽略证书。仅 Chromium，不声称 Firefox/WebKit 通过。

## 事件、范围与预算

使用已注册的 `CI` / `ci.yml`，单次 `workflow_dispatch`，ref 为原 PR 分支，`step_probe=none`、`full_acceptance=false`、`complete_training=false`。不同时改 Ready 或推无 skip 的触发提交。已阻止此分支手动转入 legacy/full/probe。其他分支既有路线不变；自动 PR 事件会拒绝当前分支未经规划的全量路线。

Source 5 分钟、audit 8 分钟、隔离 DB 20 分钟、两镜像 25 分钟、runtime scan 15 分钟、浏览器 12 分钟、各语言 CodeQL 30 分钟、汇总 3 分钟。作业并行；5 分钟后报告真实等待阶段。预算是上限，不是要求跑满；不追加全媒体、全 Ops、整站浏览器或压测。没有改变 reusable 50-reference 拓扑或 main required rules。

汇总名为 `PR356 / affected qualification (no merge eligibility)`，只在全部选中作业真实 success 时成功。现有 `merge gate / ready PR` 在本限定 dispatch 中 skipped，不出具虚假成功，main 的 strict required 保持。PR 保持 Draft；NFC10 内容验收、PHQ 家族 HOLD、原 Training 纵向及 356-01 基线、其余 opt-in suite 的正式资格保持未完成身份。该 CI 结果不能直接宣布整个 PR 可合并。

## 下轮 checking list

激活前重读 [Notion CI 常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)，适用项为 CI-001/002/003/005/006/008/009/014/015/016/017/018/019/020 及 LOCAL-001/002。要点：完整隔离变量和源、schema-only DB、真实 ONLINE 生命周期、不空跑/skip、同产物、原断言、实际引擎与语言、不覆盖原失败。

若 Actions 真失败：先保留 run/job/attempt/head、首错及下游 NOTRUN；定向修复和验证，再在同一 Notion 页写回错误事实、原 ID/复发计数、精确修复、证据 digest 与下一轮清单，核实写成功后再激活。连续两轮不收敛暂停全量，换 SHA 不归零。本次没有发生 CI 失败时不虚构 Notion 条目。

这是开发修复与 CI 资格准备，不是功能内容验收、合并或上线。

## 激活前实际预检

候选拒绝契约 4/4；受修改分类器的直接消费者 29/29；固定官方 actionlint 1.7.7 在修正 job 上下文后无错误；新增 Node 文件与 Python AST 可解析。主 CI reusable 引用集合未增加。原始开发 reporter 25 份 digest 读回一致，其中 10 份含原失败，均原样保留。

main 旧数据夹具在现有独立本地 PG 的新库中准备。提前发现并保留：旧 fixture 缺 allowedProducts、重复写入已获批准的入口策略、两个 Survey 开关未完整接线；已按实际 main 源合同修正。仅继续未完成的公开准入→FINAL，真实生成了一份旧格式加密组合报告，并恢复当前 Prisma client。此为 setup 预检，不宣称 CI/230→237 升级还原已经通过；升级还原留到 Actions 唯一执行。失败库及各轮日志均保留，未删除或重写生命周期状态。没有把这些本地准备问题伪称 Actions 失败，因此没有创建 Notion CI 事故。
