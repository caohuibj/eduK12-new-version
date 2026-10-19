# Survey S02 解锁后原生补测

产品输入仍为 `6b19767ee5a536d3f8f17942cb55eebb7e5a08fb`；6 个源码/测试文件哈希与 S02 清单完全一致。本次只增加文档、脱敏观察和截图，不重跑已通过的组件、类型、lint、资源测量，不修改产品源码。

Mac 已经由用户解锁；工具成功读取和操作本任务 Safari、Chrome 窗口。本次没有锁屏或连接阻塞。父任务对 S02 作限定 review 通过，Training 未合并改动仍未纳入。

## 新证据与勘误

- Chrome 原生正常窗口逐页核实工具/项目/参与/数据介绍、claim、reset 的工具栏 `Zoom: 200%`，滚动至说明和底部操作，没有观察到重叠或主操作不可见。其余 home/login 已有独立观察，本批没有重跑。此次 Chrome 截图在 CUA 工具记录中，没有新 Chrome PNG，不冒充持久化文件。
- Safari 曾出现“前页确认 200%、后页菜单 100%”的状态；状态变化的具体原因没有证实，不能认定是导航本身导致。**撤回旧报告跨页面沿用缩放值的推断**，也排除本次第一张项目页的 100% 观察。补测中逐页检查当前 Page Menu，再保存首页、4 个介绍页、claim、reset 的 7 张 200% 原始 PNG。login 的独立确认与原图沿用上批明确的菜单记录。
- Safari Inspector 元素截图可能保留透明边界，首页绝对定位艺术元素可能扩大导出边界；PNG 像素宽度不用于推算 CSS 视口，不替代原生窗口观察。未声称做了每个视口、每级缩放与每页的笛卡尔积覆盖，也未声称物理手机/平板或完整屏幕阅读器通过。
- Chrome 与 Safari 均已通过原生 UI 明确恢复为 100%。没有更改 Safari 远程自动化、浏览器隐私或安全设置。

## Safari 重载异常保留

首次 S02 错误登录时的 `Web Crash Explanation Banner` / `This webpage was reloaded because a problem occurred.` 仍是有效异常记录。其后一次原生键入重试未见新横幅，不足以排除间歇故障。

本次针对性复验只增加一次：在同一 `survey.localhost:5197/login`、同一产品源码和相同的不存在合成登录名下，显式刷新并核实空表单及无横幅，再采用与首轮相同的 AX 字段设置方式提交一次。预期“用户名或密码错误”显示，提交前后都未见新横幅。保存 `safari-login-error-followup-100.png`。刷新时出现本任务合成表单的重载确认和保存密码提示；确认重载，选择 `Not Now`，没有保存合成密码。

**结论仍为原因未明，本次未复现，不是故障排除。** 没有 crash dump、归因堆栈或受控 baseline A/B 证明，不能归因于 Safari、CUA 或应用代码中的任一项。后续若再见横幅，应先留当时页面、步骤、时间、环境及可用诊断，再针对该故障处理，不能用全量复测掩盖。

## 文件与后续

本机目录 `/Users/Qiang/Documents/Codex/2026-10-19/task/evidence/s02-followup/`：`followup.json`、`S02-followup-contact.jpg`、8 张新原始 PNG；`followup.json` 包含尺寸、SHA-256 与逐项限制。Git 只保存本文及脱敏清单，大图通过 review ZIP/Library 交付。

有效账号激活、新密码设置没有通过浏览器执行；S06 许可、下载、Numbers 不属于本次补测。S03 已获授权，但须先完成认知刺激及全部祖先的同条件 rect/computed-style 基线、时钟与输入源码冻结；相关保护不满足时停该区域样式改动。本补测没有开始任何 S03 产品修改。
