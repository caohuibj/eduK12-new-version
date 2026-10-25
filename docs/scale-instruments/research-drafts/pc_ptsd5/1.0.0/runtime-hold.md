# 执行阻碍与后续验收

状态：HOLD_SYSTEM_CAPABILITY，非版权阻碍。

原暴露门题不可计入五症状总分：NO必须停止且0，YES才呈现并要求5题；门题缺失不能等于NO。当前标准量表定义没有条件跳止路由，固定评分源不能按门题切换必答集合。不能只注册5症状或把门题加为第6题求和。

后续验收：NO只答门题即可结束0；NO+残留症状载荷不能覆盖停止分支；YES+完整5题按YES个数0–5；YES缺任一题不出完整总分；缺失门题即使5症状完整也不算分；无效门题拒绝；门题不进入分子分母；停止报告不声称已经否认所有症状；低分/缺失不保证安全。见 acceptance-vectors.json，协议向量均未在运行时执行。
## 源码证据（本批基线 02db018）

- `server-version/backend/src/modules/scale/scale-definition.ts:32–71`：响应集每个选项必须有有限数值 score、至少2个选项；所有题目要求 responseSetKey，无自由文本辅助字段契约。
- `server-version/backend/src/modules/scale/scale-scoring.ts:232–259`：validateAnswers 对所有答案查响应集中的离散选项，不支持任意事件文本。
- `server-version/frontend/src/pages/student/ScaleAssessment.tsx:686–710`：题目渲染为 options.map 下的 radio；不存在本包所需的事件文本/门题条件呈现合同。

这不是全系统所有问卷都不支持文本的断言；这里核验的是当前标准量表执行链。仅将 type 写成 text 不会建立支持。没有在本内容批修改引擎、UI、权限或触发器。
