# 执行阻碍：安全说明覆盖范围不足

## 本次可以证实
- `server-version/backend/src/modules/scale/scale-result.ts` buildScaleResult在invalid结果也原样保留report.disclaimer（约367行）。
- `server-version/frontend/src/modules/reporting/ScaleUnitReportCard.legacy.tsx` invalid分支后仍显示disclaimer（约249行）。
- 原附题可不加入score.source，当前引擎实验可把它排除总分；这不是阻碍主因。

## 不能保证的路径
- `server-version/frontend/src/pages/student/ScaleResult.tsx` toScaleUnitReport对completion/unavailable将disclaimer设为空（约55–57行）。
- `server-version/frontend/src/modules/reporting/ScaleUnitReportCard.tsx` completion/unavailable直接提前返回，不显示disclaimer（约13–29行）。
- 作答前/作答中、未提交/不完整作答未形成结果页时，现有报告免责声明不能保证展示。

## 本轮处理
第一类题本资料可以公开GitHub；PHQ9仅文档HOLD，不创建可执行source或catalog注册，不导库。没有为了绕过缺口改题、加入自动风险触发器、伪造实时监测或重构引擎。

## 后续解阻要求
在既有共享施测/结果工作流中提供不依赖总分与结果披露等级的静态安全说明，并验证开始/作答/中断/缺失/结果不可用路径；明确专业人员进一步评估与无人实时值守的责任边界。第9项零或缺失不可作为安全保证。临床危机处置并未被本内容包实现。

## 后续正负向验收清单（待实现/未运行，不是本批通过记录）

| 场景 | 需要证明的结果 |
|---|---|
| 第9项非零、其余八症状为0，总分仅1 | 支持/专业评估说明独立总分可见，不出现低分安全承诺 |
| 第9项非零、其他症状缺失，invalid/无法求总分 | 仍展示说明，不等最终总分 |
| 第9项为0 | 不标“无风险”或“安全”，仍保留一般支持渠道 |
| 第9项缺失或中途退出 | 不把缺失当0；未提交时也能访问使用限制和支持说明 |
| reportKind=completion或unavailable | 不因免责声明被adapter清空/组件early return而丢失独立安全说明 |
| 报告请求失败/无权限/尚未产生结果 | 不依赖成功获取个体分数才显示静态使用限制 |
| 原功能困难附题四选项、跳过附题 | 九症状总分不受附题影响，不新增第十症状或静默删题 |
| 开始前、作答中、完整结果三个阶段 | 使用说明有独立呈现位置，不污染原症状题文，不伪称有人值守 |

上述需求不授权自动联系他人、录入风险名单或替代临床判断；任何此类新流程需另行明确责任与授权。
