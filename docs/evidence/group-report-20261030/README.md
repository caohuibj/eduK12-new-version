# Survey 单次群体报告：原始证据

这是云端本地执行记录和合成 UI/数据，不是 CI 接纳、Ready、生产性能或部署资格。源码基线/首批提交/文件 SHA-256 见 `manifest.json`；源绑定在执行后整理，不补造原始签名、完整历史环境或 contemporaneous node_modules 清单。

- `backend-tests.json`：共享叶统计、Survey 适配及三个直接受影响来源/字典消费者，81 PASS。
- `frontend-tests.json`：原 1 PASS / 1 FAIL；`frontend-repair.json` 仅修复完整句子选择器后重验失败用例，1 PASS / 1 filtered。不相交共 2 PASS。
- PostgreSQL 从原测试基线复制到独立 loopback `eduk12_group_report_test_20261030`，当前全部迁移成功；没有迁移开发/生产库，也未启动应用或重型消费者。旧基线缺失迁移的应用是测试环境准备，不冒称精确最新 main→候选的正式升级验收。
- `postgres-setup-*` / `postgres-diagnostic.log` 保留未进入用例的准备失败：同意文本不足 20 字、缺已有 workspace 开关。初次 JSON reporter 未输出套件前置错误，诊断时补用 default+JSON；未声称这两轮业务断言执行或通过。
- `postgres-first.json` / `.log`：真实 FORM 发布→匿名正式提交→HTTP 生成与读取，1 PASS；第二个权限用例因合成陌生研究者缺 surveyAccount 而 FAIL。随后仅执行该失败用例，`postgres-boundary-repair.*` 为 1 PASS / 1 filtered。包含新版与旧版共存、真实跨项目拒绝、匿名会话拒绝、来源排除后拒读与快照不可变。
- 初次事务/解密对照：生成 59.507 ms、5 次事务、2 次正式原件解密；读取 11.087 ms、1 次事务、只解密一个 Artifact。N=2 的合成小样本，**不是容量承诺**。独立 SQL 计数补充只测缺失的查询指标，不重跑上述业务断言；`postgres-query-count.*` 实际为生成 46 个 SQL event / 102.567 ms，读取 8 个 SQL event / 18.911 ms，口径包含事务语句而非网络往返；未做容量或长时压测。
- `browser-original.cjs` / `.log`：原脚本在打印时遇同名 h2/h4 定位歧义；在此之前读取、局部切换、显式生成、旧版读取、全屏、1440/390 无溢出和两张截图均实际完成。`browser-print.log` 仅续行打印，使用首次保留编译字节，不重建、不重跑前述交互。PDF 为两页 A4，`group-report.txt` 是其实际文本提取，中文/样本/全部指标/限制与快照版本可读。
- 类型检查均真实 exit 0，空日志是原始 stdout/stderr，不以空日志本身证明成功；进程退出记录来自本轮工具调用。前端 lint exit 0，保留两条 warning，未称零 warning。

所有原 FAIL、setup 未执行和过滤项保留，不将后续通过改写为原调用全绿。`browser.json` 是原打印续行脚本生成的合并摘要，应结合原脚本/失败位置/截图及本 README 判断其分段来源。

当前 CI 只准备 Draft 源码/范围控制预检；三项新的控制合同主要执行位置为 GitHub，不在本地重复执行。正式构建/适用镜像扫描、SAST、精确 main 升级与 native dump/restore、Ready 汇总尚未执行。没有 APPROVE、合并、部署或真实用户写入。

## 首轮真实 CI 与受控续行

PR404 / source `83f5e9a0a069d386d2ae230402f179c1ea69053a` 的 CI `41012289991` 在 `classify changed content` job `123920641090` 的 lightweight 分类 step 拒绝：实际 base 已是 `dfd506347cfa2c684a75812936f32d48bdce34d4`，原精确 pin 为 `5a39fd7b...`。这是新 main 被正确拒绝，不是应用失败；三个新控制合同也未执行。`merge gate` job `123920739968` 为下游 failure。独立 publication `41012289643` 成功。原记录见 `ci-first.*`。

新 main 是 PR400/402 的纯量表素材和目录，无 reporting/Survey/schema/锁变化。安全 merge 后仅更新 Draft 精确 base；原应用源码与受影响消费者输入未变，不重跑单元、类型、PG、浏览器或构建。下次仅执行尚未运行的新控制合同、当前 scope/gate，继续保持 Draft；CI-019/020 的来源/消费者绑定检查适用。正式资格仍 NOTRUN。
