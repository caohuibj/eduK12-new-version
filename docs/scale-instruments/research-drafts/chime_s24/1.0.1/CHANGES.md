# CHIME-S24 1.0.1 修订

1.0.0的openness计分说明使用了“更多表示本次自述相关体验较常发生”，容易使人误以为反向后的高分代表疼痛或不适更多。1.0.1明确说明：反向题规则转换后，更多表示较少急于避开不愉快情绪或疼痛体验；不表示疼痛或不适更多，不作人群高低或临床判断。

精确JSON路径改动仅三项：

- `$.identity.instrumentVersion`：1.0.0 → 1.0.1。
- `$.executable.definition.scoring.scoringVersion`：1.0.0 → 1.0.1。
- `$.executable.definition.scoring.scores[7].description`：上述说明修正（scoreKey=openness）。

报告原文已经明确“较少急于避开”，未修改报告。reportVersion与localizationVersion均保留1.0.0，catalogManifestVersion保留1。算法、题文、选项、反向、缺失规则及黄金向量完全保留。1.0.0原文件不覆盖；新版本仍为DRAFT/CANDIDATE，人工译审与中国验证状态不变。版权文件与instrument包装文件原样复制，CC BY 4.0署名和来源保留。不改registry，不运行数据库或发布。

实际mixed结果见[report-result.mixed.synthetic.json](report-result.mixed.synthetic.json)，其中9项解释为真实buildScaleResult输出，不代表施测或上线。
