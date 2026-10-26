# CFSR12 1.0.1｜实际验证

- PASS：原平台稿17项单元合同首次实际执行；修订稿对应17项已按受影响输入复核通过。首次时间格式失败及修复后的独立结果均保留。
- PASS：当前定向严格TypeScript、生成registry一致性；不等于整后端构建。
- PASS：新合成PostgreSQL 16.15中以scale_app非owner身份物化DRAFT/HIDDEN、幂等、失败回滚、快照不可修改/删除、内容冲突拒绝、拒绝未发布草稿激活。两工具共12项数据库合同，不把公共用例重复计入每工具。
- PASS：从数据库取实际definition，经buildScaleResult构建最高分报告；完整合成报告样例已生成，所选混合样例见[report-result.synthetic.json](report-result.synthetic.json)。
- NOTRUN：真实API/UI、独立指导语呈现、Survey/Training正式发放、生产、CI、激活、人工译审和中国人群研究。审核/研究进展与技术结果分别记录。
- 参数：score_only，没有新增经验分档或ReferenceSet；无实测阈值不是发布阻碍。当前独立参数版本缺口单列功能待办。

机器证据及原始执行哈希见[批次验证](../../../batches/20261026-pilot/validation.json)。原始日志和JSON reporter保存在本次云端仓库外证据目录，不伪造CI、专家审批或原作者中文验证。
