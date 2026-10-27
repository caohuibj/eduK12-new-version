# SART 本次静态核对与交付边界

2026-10-27 UTC。单项状态：**已设计、待人工图审、未开发、未接入**。所有次数、时长、练习规则与报告公式均为提案，未得到开发批准。

## 精确基线与范围

- 当前独立 Linux 云端节点，未使用 Mac、另开对话或子代理。DOT 提供创建配置 `gpt-6.1-sol / high` 已受理证据，无模型替换警告。
- 本轮远端重新核对：`cognitive-next-three-core-20261026` 为 `a0130ea6603d7e37fd4f900d8694b5b7d490c51e`，main 为 `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`。
- 独立分支 `cognitive/domain-clinical-research-20261027` 从上述认知 SHA 建立；本提交只含本领域目录下的 SART 原创说明／静态图、18维标签映射、静态证据及既有24＋11项目去重索引。没有新测验实现。
- 已读根 AGENTS.md、发布 README 的文档／范围／最小验证规则、场景路线图及既有候选资料。仓库未发现 `.agents/skills`；节点 `/workspace/.agents`、`.codex` 为空。本轮未增任何门禁。
- 不改共享 README、词表、注册表、其他领域、PR363或平台；不动 MOT／ANT 暂停 WIP。临床相关任务唯一归属尚未确定时不新增记忆实现。

## 来源与去重证据

SART 固定参考来源、三项重新读取且一致的 blob、许可边界与论文图审结果见 [附录](sart-appendix.md)。原论文 PDF SHA-256 为 `99f2826572e87031762b87f3d8adcb21616964935d5dee775910dd5f967e50f7`；仅在 `/tmp` 临时下载、转图核看印刷页749–750，未入库论文原文、截图或上游素材。源码只读，未执行 PsychoPy。

[去重索引](inventory.md) 与 [read-basis.json](read-basis.json) 绑定24旧项目和11既有候选的108份实际源文件；用途是范式识别／去重，不是完整审计、当前验收或新PASS。18维／131稳定词表从固定 `22721e5c63dd78819e8c58921adf20157cdaa08c` 实际读回，SART文档映射中的原key均存在；无精确key的轴保留空，不改共享词表，不宣称后台标签接通。

## Notion风格与真实静态图

只读 [认知研发总表](https://app.notion.com/p/405d27635a3881b2a2d3fecce26d7cb3)，返回编辑时间 `2026-10-27T09:08:24.763Z`。查阅图片引用和简短介绍结构；当前工具未提供该页图片二进制下载入口，未声称取得Notion原图。视觉参考为本仓对应 `next-candidates-20261026/horizon-exploration/review.png`，已人工查看；旧图／旧批准不代表SART获批。

本轮原创 [静态HTML](sart-review.html) 不含脚本，不生成序列、不计时计分或采集响应。真实渲染截图为 [总图](sart-review.png)、[手机390宽](sart-phone.png)、[平板820宽](sart-tablet.png)，已人工核看。报告数字全为合成排版示例；不是参与者数据。

[sart-static-review.json](sart-static-review.json) 记录 Chromium 版本、视口、文档宽度、脚本数和请求；1440／390／820宽均无横向溢出。该文件只保留本项SART静态页面结果，不是手机硬件、Safari、施测旅程、测量时序或后台验收。

首次渲染因节点Chromium SUID sandbox配置退出；本地file://导航随后被管理策略阻止。最终在现有平台进程沙箱内用setContent排版本轮原创无脚本HTML，HTTP(S)请求关闭；Chromium自身sandbox未启用，记录为false。未改系统／浏览器策略，不把失败冒称成功或称为带Chromium沙箱验收。

## 交付与尚待事项

DOT 指出本节点路径无法跨任务读取，要求优先Library，工具不支持时授权本独立分支纯SART资料单项 `[skip ci]` 提交推送。本轮Library官方helper在tools/list阶段返回HTTP401，未传输／创建文件；没有虚构library_file_id，也未重复直接上传。按已明确授权走Git交付，不修改Notion历史或分享权限。

DOT需实际核图和短介绍后再发人工notice；用户批准前不开发runner、序列或scorer。未运行应用／旧任务／集中集成测试、构建、CI、DB、服务器、COS、合并或部署。只做源文件／词表／静态布局／交付字节核对，不能当作效度或平台接入PASS。

既有DB/core＋私有COS规则保持；报告保存与完整原件归档分开，当前均未接通本任务。年龄、人群、中文、难度、设备等效与短版精度全部未核。公开报告正文／图片／未来下载同三态，内部指标不公开，不造能力总分、常模、IQ、诊断、排名或岗位预测。
