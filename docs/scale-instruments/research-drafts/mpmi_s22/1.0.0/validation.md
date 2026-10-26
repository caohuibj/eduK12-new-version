# MPMI-s22 实际验证

- PASS（来源静态核对）：作者附录完整22题、8/7/7维度、1/4/5/8反向，英文与平台双语档逐题对应；论文和原附录CC BY4与后续GESIS载体许可分开。
- PASS（单元）：21条新MPMI合同，包括12组黄金向量、反向混合、每维缺失边界、非法输入、维度独立与无总分、年龄边界和缺龄拒绝放行、真实报告。另有本批共享8条标签/报告合同及7条旧包受影响合同，共36条，不按工具重复计数。
- PASS（严格类型/registry）：使用当前锁定依赖的定向TypeScript和原生成器。
- PASS（真实合成PostgreSQL）：本批7条共享合同全部通过。恢复自有两工具合成dump后，以非owner的scale_app执行新增物化、幂等、失败回滚和DRAFT/HIDDEN边界。新增MPMI一行/一快照，未创建或激活ReferenceSet、未授权任何入口。
- PASS（实际结果）：12组buildScaleResult实际样例捕获；各维均分1–5，无总分。每维至多漏1题的结果保留已答均分；超过时不可算维度为null，报告整体不解释；当前引擎行为如实记录。
- NOTRUN：产品HTTP/浏览器、独立指导语展示、正式Survey/Training使用、激活、CI、生产、人工译审或中国人群研究。
- 参数：原始分数解释，无经验等级、诊断切点或ReferenceSet绑定；没有实测常模不阻碍内容加工。独立参数身份尚需功能线支持。
- 图卡：一张静态EDUK12.TOP素材已准备并记录版本与哈希，PREPARED_NOT_RUNTIME_CONNECTED，不在交卷时生成，不当作已在产品展示。

[批次验证](../../../batches/20261026-wave3/validation.json)与[实际报告](report-result.synthetic.json)。原始日志位于云端仓库外证据目录；未把本地开发证据称为正式CI或科学审核。
