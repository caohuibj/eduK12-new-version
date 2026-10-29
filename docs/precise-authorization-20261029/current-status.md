# 当前状态：量表工程候选，尚未正式合格/合入 main

本任务分支 `task1-scale-exact-authorization-20261029` 已正常整合 main
`dc0f46ba506d51d42c5bb379059df82f18860b72`，保留 Task2 已合入的 Bundle 工作。
量表工程与当前验证的产品检查点为 `ca7cef4b0dbaf943eb61d925b4883bf6de2dfbdc`；
后续文档/探测脚本提交不改变所标注产品输入。完整身份见 [来源索引](scale-review-source-ca7.json)。

| 范围 | 实际状态 |
| --- | --- |
| 共同精确 binding、不可变修订及草稿/发布/入场 | 已实现并有分阶段本地证据；复用既有 grant/source/snapshot，不新建权限中心 |
| 量表四入口管理员 C/P/R、分权/委托、业务命名、替换及原请求恢复 | 工程已接线；真实受控 HTTP/PG 与 UI 单测见各进度，静态编译浏览器不是 MFA/真实写入证明 |
| Training COURSE + GENERAL、Survey、School、Teacher 作答/回读 | 分阶段已有实际链路和当前 main 保存结果回读；School READY、Teacher WITHHELD、Survey 空 R、Training full R 分别保留原合同 |
| 当前整合产物 | 前端新 tree 单次 build＋8 页面 PASS；后端变化闭包 CommonJS emit＋4 独立入口冷加载 PASS，未冒称完整 release build |
| 实际受限运行身份 | 新克隆中 Training 精确授权写入/重试/旧报告已过；账本写入 42501、255 迁移契约已验；其余入口尚未改称受限角色资格 |
| 性能 | main/candidate 小目录 A/B/B/A：各 20 查询、候选约 20ms p50；报告只有候选自身 30 样本，无可比较 main 新格式成功基线；大/批量/写入/START 未验 |
| 素材 | 三份 basic 本节点既有装载回读保留；main 纯素材已增加，不将后来的预期总数当已实跑载入；fun JSON 未自动独立注册 |
| 认知 | 11 个远端候选已在独立库 DRAFT 装载且身份回读；不是 main native runner 就绪，也不是四入口精确 profile 授权；相关工程待量表阶段后开展 |
| PR、正式 CI、合并/部署 | 未创建 Task1 PR、未触发 Actions、未合入 main、未生产部署、未授真实用户 |

当前具体缺口：有界 CI 路线及原件接纳须独立审查；正常连接浏览器的 MFA/写入、
其他入口受限运行身份、规模/批量/写/START 性能与未覆盖兼容路径还需定向补证。
[CI 准备](scale-ci-review-preparation.md)给出实际 platform 回落和完整来源；不以旧通过或 skip 冒充正式门禁。
DOT 特定拒绝的混合 seed/独立趣味 R 工程保持未执行；没有通过复制旧树绕开审批。

`implementation.md` 下半部的“初始”段落和旧检查点保留历史原貌；其中旧 SHA、无迁移、
尚未收到素材等描述只适用于该初始时点，不能覆盖本页及后续逐阶段记录。
