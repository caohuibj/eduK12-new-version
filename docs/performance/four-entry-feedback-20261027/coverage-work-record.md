# 独立云端验收映射任务记录

- 分支：`test/pr363-four-entry-coverage`；父提交 `6cf241d65b4bc44878ef9d9fe21c81fdd02561cd`，tree `d74a1d96567f0d2c0850440b2efbc205dc6c5007`。开始时 `git status --porcelain=v1` 空，原工作分支 `work`/HEAD `dff80f0604163a04e2f5a8119d7d4295116eeb41`；没有 reset/stash/覆盖其他工作。
- 环境：只使用独立 Codex 云端 `/workspace/eduK12-new-version`。已读根 AGENTS、release 统一规则及相关历史证据；仓库相关目录没有更深层 AGENTS。没有创建子对话。
- 交付：20 行阶段矩阵、20 组精确现有测试、六个最小缺项目标、最终 CI 建议/消费者依赖、96 个直接输入 Git mode/blob 对照、官方原件坐标与原候选 case pointer。只有文档与 JSON 证据索引，不新增工具或业务测试/实现。
- root 接口：只读 fetch `f46336cc45abaa21d4b946029cda2a0dfadec654`，已核新 identity reader 的实际返回值/原授权 proof 和 flow hash；具体接口与仍需约定的纯 Form BUNDLE/生命周期消费者见 validation-plan 末尾。没有在本分支集成或修改 root 来源模块。

## 实际命令和退出状态

| 动作 | 实际结果 |
| --- | --- |
| `git ls-remote origin refs/heads/main refs/heads/perf/four-entry-feedback-20261027 refs/heads/test/pr363-four-entry-coverage` | exit0；main/集成远端与委派一致，独立远端尚不存在 |
| `git fetch origin perf/four-entry-feedback-20261027`；`git switch -c test/pr363-four-entry-coverage 6cf241d65b4bc44878ef9d9fe21c81fdd02561cd` | exit0；独立本地分支成功，无集成分支修改 |
| GitHub connected read-only `get_pr_info`（356/357/361）、各 run jobs/artifacts | 全部返回成功；仅首页限制已披露；没有触发 workflow 或更改远端状态 |
| connected `download_workflow_artifact` + 云端 `curl --fail --silent --show-error --location` + `sha256sum` | 四个 ZIP 实际字节匹配官方 digest。PR356 admission 1.5MB、PR357 backend checks 108KB/frontend checks 44KB/connected 9.9MB；完整原 ZIP 保留 `/tmp/pr363-four-entry-coverage/`。未下载 PR361 384MB runtime ZIP；不称核验其实际字节 |
| `python3 /tmp/pr363-four-entry-coverage/extract.py` | exit0；4 ZIP digest 验证、JSON member digest/phase/case/原来源索引完成，没有执行包中脚本 |
| 初次直接输入 inventory 命令（inline Python） | exit1；把明确标为建议的 `integration/educationAssessmentDelivery.postgres.integration.test.ts` 当现有文件核查，AssertionError。未产生成功声明；只显式排除 N1–N3 三个尚不存在的建议文件，其他路径继续严格存在检查 |
| `python3 /tmp/pr363-four-entry-coverage/build-inputs.py` | exit1；96 个输入存在并成功写出 inventory，随后额外 tree 对照因历史 `9ece34cb...` 对象尚未 fetch，`git rev-parse` exit128。不能把整命令记 exit0；不重做已完成 inventory |
| `git fetch origin 9ece34cbfccbc60aac6c64ab03f07614d77906af` + 两 source `git rev-parse ...^{tree}` | exit0；PR357 source `8ca766...` 与原 artifact 标签 `9ece34...` 的 tree 均为 `1273c9b0f9580f257bd9e3fab6a25d24b176a394`，补齐上项缺失的只读验证 |
| Matrix/JSON/内部链接检查 | exit0；20 个唯一顺序行、96 路径、JSON/文档内部链接可解析。该命令输出把 JSON 文件数硬写为4，是输出文字错误；随后只读 count 明确实际为3。本记录不将错误输出改写成原命令正确计数 |
| 首次更新 metadata 的 apply_patch（Delete+Add 同一路径） | patch 解析失败：`multiple operations target .../coverage-official-metadata.json`，未执行编辑；改为同文件 Update 后成功。不是自动授权审批拒绝，无绕过 |
| 最终暂存差异/JSON/引用检查 | 以提交前最后一次实际命令结果为准；交付消息列精确结果，不由此行自授成功 |

原工具响应、错误和过滤状态保留在本任务历史。上述错误属于本任务文档索引/本地对象核对，不是业务、PG、浏览器或 CI 运行失败；不改写历史 PR 的失败或重新运行其中的脚本。`extract.py`/`build-inputs.py` 只是本地只读证据整理脚本，没有加入仓库、运行应用或伪造正式通过记录。

## 未执行和剩余依赖

未执行应用单元、真实 PG、浏览器、构建、audit/扫描、CI、迁移、部署、合并、required gate/保护/凭据变更。没有发消息给第三方，没有批准/发布任何具体工具。已有真实 PG/浏览器结果只以其**原候选**身份引用；不称由本节点执行，也不授予 PR363 跨提交接纳。

本任务线可交付，未被权限阻塞。系统能力是否关闭 20 行缺项，仍依赖 root 的来源/发布/授权/START/C-P-R 和其他实现分支实际集成，再由 root 独审最终源码与最小 CI 选择。本节点不修改集成分支，不创建替代 PR、不触发 CI。`runtime-table-policy.json` 原上传阻碍后经 root 告知获明确授权解除，本分支从未修改、代传或重试该文件。
