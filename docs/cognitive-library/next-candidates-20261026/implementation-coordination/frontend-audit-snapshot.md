# 前端候选：供独立审计的中间快照

本快照按统筹要求在三位agent安全暂停写入后提交，不等待全部问题完美。它保留实际组件、原始rAF数据、失败与截图，不授予施测/入库/合并/部署资格。父核心提交d78332d；设计批准固定9969583。精确内容哈希、原始计时索引与未完项见frontend-audit-snapshot.json。

## 点数判断计时：已知未通过

25次正式合成记录中，0-based indices 1、2、11、12、14、16、22为4帧、约66.6ms；其余18次为3帧、约50.0–50.1ms。没有私加容差、修改旧时间或改策略使其通过。正式施测仍禁止，报告关闭个人表现结论。

逐帧原始数据：[browser-captured-raw.json](../enumeration/implementation/frontend/browser-captured-raw.json)；其SHA256为92ce9ca47badb38c0af37e28c4ee497ecf3c5863c4c752a4c7f26290ccace132。Capture.frame的时长比较位于capture.ts约65行，调用和canvas命令位于EnumerationTask.tsx约145–147行。保存的标记来自rAF回调时间；同回调随后执行draw，并不构成光学物理onset/时长测量。阈值跨帧、阶段语义、时钟分辨率或主线程延迟等原因尚未由独立审计归因。

## 可读取的位置

- [点数实际组件总图](../enumeration/implementation/frontend/review.png)、[前端状态与哈希](../enumeration/implementation/frontend/status.json)。
- [连续再认前端证据](../recognition/implementation/frontend/evidence.json)、browser/中的实际组件截图/合成流记录。使用native受限投影，未接回任意客户端ResearchReview。
- [ANT前端说明](../ant/implementation/frontend/README.md)、各原始Vitest与浏览器记录/PNG。窄屏报告-responsive图为后续可读性修订；原图与失败保留。最终总manifest尚未生成，不把它当已冻结。

主线开发自查不替代统筹独立审计。本快照未修改已冻结的16份backend候选源码，未改平台core或注册。参与者文案清理尚未做，仍有工程术语；ANT最近两个TSX入口的最终类型续验未做，原11入口类型结果保留其当时输入哈希。原始失败不隐藏、未达真实50ms不写PASS。

## 恢复、许可与平台边界

三项当前不承诺跨刷新继续正式序列。刷新/clock realm变化或中断后结束本次曝光，只保留及重试旧记录；host耐久marker必须拒绝重复attempt/曝光，不允许伪造连续时钟。候选端口不是产品持久化实现；localStorage/IndexedDB与服务器回执在浏览器证据中均为明确合成host，不能当真实API/DB/COS通过。

上游固定来源与许可证据仍在各design.json和implementation/README：点数flowersteam MIT参考，未复制其noise/字体；再认nwrim MIT插件参考，OMI脸图NC-SA不随代码获权，当前全为合成占位；ANT PEBL GPL协议参考，当前为原创TS/SVG候选，不宣称GPL整包已清权或Fan原版等值。字体/图像等生产素材、手机/平板实机、Safari/Firefox/WebKit、理解与人群效度均未验。

native注册、仅research/experience的发布准入、Survey固定Go/NoGo入口、设备/标签/导出消费者、DB核心+COS完整归档仍为平台接入依赖。没有补假score/standard别名、没有激活CI、合并PR356或部署。Notion第9节已保存用户批准的三张原生图，第10–11节保存核心进度及后续新测验人工审核门禁。
