# CFSR12 1.0.1｜实际验证

- PASS：原平台稿17项单元合同首次实际执行；修订稿对应17项已按受影响输入复核通过。首次时间格式失败及修复后的独立结果均保留。
- PASS：当前定向严格TypeScript、生成registry一致性；不等于整后端构建。
- PASS：新合成PostgreSQL 16.15中以scale_app非owner身份物化DRAFT/HIDDEN、幂等、失败回滚、快照不可修改/删除、内容冲突拒绝、拒绝未发布草稿激活。两工具共12项数据库合同，不把公共用例重复计入每工具。
- PASS：从数据库取实际definition，经buildScaleResult构建最高分报告；完整合成报告样例已生成，当时混合样例绑定前一报告版本，历史文件见提交d64cf139；本目录[report-result.synthetic.json](report-result.synthetic.json)已更新为下方Wave3报告版本。
- NOTRUN：真实API/UI、独立指导语呈现、Survey/Training正式发放、生产、CI、激活、人工译审和中国人群研究。审核/研究进展与技术结果分别记录。
- 参数：score_only，没有新增经验分档或ReferenceSet；无实测阈值不是发布阻碍。当前独立参数版本缺口单列功能待办。

机器证据及原始执行哈希见[批次验证](../../../batches/20261026-pilot/validation.json)。原始日志和JSON reporter保存在本次云端仓库外证据目录，不伪造CI、专家审批或原作者中文验证。

## Wave3：目录v2 / 报告1.0.2

- PASS：本批共36条实际单元断言（29条新合同及7条受影响报告合同），另25条不受影响旧合同按输入复用、未重复执行。两工具测量hash、计分、本地化和参数策略不变。
- PASS：定向严格类型与registry；从上一批自有合成dump恢复后，以非owner应用身份更新目录和报告，旧轴快照原样保留；本批7条数据库合同共用，不重复计数。
- PASS：实际混合样例与数据库definition报告版本一致。当前7组实际buildScaleResult样例全部成功捕获。
- NOTRUN：产品浏览器/HTTP端到端、正式双入口发放、激活、CI与生产。PR356纯检索函数成功不替代上述事项。

[本批机器验证](../../../batches/20261026-wave3/validation.json)；[PR356对齐清单](../../../batches/20261026-wave3/pr356-followup.md)。
