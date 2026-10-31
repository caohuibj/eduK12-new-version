# G3 数列补全与认知估算交接（未入库/未发布）

基础 #477 `605a3a5f5a03e23da442f0e17a6fb9486870e8dd`；只提取 #441 `16d9bbaa5fffb424ce463220d6f9f7d3a7280db5` 中 seriescomplete/cogest 的任务、局部 schemas/scorers/tests。没有整合其余任务、CI、公共注册或生成文件。

| 项目 | 原 1.0.0 | 新 1.1.0 |
|---|---|---|
| 数列正式题 | 24；profile18/30/36，实际最多24 | 36（原24按原答案保留，补12个不同规则结构/表示的原创题）；真实18/30/36不重复 |
| 估算正式题 | 24；profile18/30/36，实际最多24 | 36个原创情境，单位/数量级/时间/距离/容量/面积/体积；真实18/30/36不重复 |
| 练习 | 使用正式池首题；cogest正确键错位 | 各1道独立练习，ID/题面与正式池分离；错误后完整重呈说明 |
| 历史 | 原候选，不冒称已经上线 | 保留1.0.0条目/答案/评分/fixture；旧 entry 不推荐新建；新增C/S/config/P/R 1.1.0与新随机序列身份 |

逐题答案、规则/计算过程在各 `bank-v1.1.ts` 的 explanation，前后端题目逐项相等已测试。所有新增题为本项目原创，未复制标准化或受限题库。数列正式页面不显示答案/解释/规则提示，仍要求发现规律；有限序列不存在绝对数学唯一延拓，逐题按常见简洁规则选定预期选项，不能声称排除了任意多项式构造。数列增加的12题覆盖交替运算、交错子列、乘加递推、除减递推、阶乘、分数、小数、正负交替、位数交换、奇差递增、平方偏移、倍数分组，非只改数字凑数。新选项固定轮换降低旧答案位置偏斜。

估算审计：旧 ce-02/06/09/17 含健康/人群口径，ce-04/08/21等缺规格，ce-13会随时间变化，ce-15/23是事实记忆而非数量估算，整池无可用常模。本次不为这些含混题指定虚假的统一数值，而另建题内线索充分的生活估算池。所有单位/条件写在题内，explanation 给出预期近似计算；不要声称其等价于无提示认知估算、标准临床测验或纯粹估算能力：它混合单位知识、数量推理与线索辅助估算。这是需母线/用户审阅的新版本候选，尚无真实施测或科学等效证明。旧题仅保留历史，不混入新池。

交互修订限新 runner：练习答案从独立题定义取值；忽略长按重复键；超时发送 responseIndex/rtMs 双 null；保存失败后显式重试同一原始响应/RT，不自动超时重试忙循环；落库成功但完成确认失败不重交末题；保存尚未确认时不显示“已记录”。固定400ms注视、15秒时限、300ms用时下界不下调。估算说明/种子名称/报告移除误抄的逻辑推理/类比文案与“能力指数”。

新 scorer 保留准确率分母为全部正式题，漏答单列；有效0正确率保留，RT无记录为null；正确用时排除中断/过早/越时，越时有选项的矛盾输入拒绝。少量或没有有效正确RT仅限制速度解释，不隐藏本次有效零正确率。两项新 report referenceMode=none，无排名/诊断/常模，旧报告原件未覆写。时长3–5/5–8/7–10分钟是含说明练习的估计，未实测；36题全超时的正式部分约9.4分钟，不能承诺人人10分钟内结束。

## 本地验证

Node24.21.0，复用环境现有依赖（未安装/更改lock）。后端两文件8 PASS；前端两文件10 PASS。最终源码闭包 types 使用：

```
node server-version/backend/node_modules/typescript/bin/tsc --noEmit -p docs/cognitive-intake/g3/tsconfig.json
(cd server-version/backend && node node_modules/vitest/vitest.mjs run src/__tests__/cognitive/{seriescomplete,cogest}-audit-v1.1.test.ts --maxWorkers=1)
(cd server-version/frontend && node node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/{seriescomplete,cogest}/__tests__/audit-v1.1.test.tsx --maxWorkers=1)
```

测试覆盖题池/练习分离、profile实际题数与过量拒绝、评分/零/漏答/非法提交、中断速度、练习失败与通过、timeout、repeat、保存失败重试、完成确认失败。评分fixture含36题全对与全超时的明确输入和结果，不是独立科学验证。首次 FE 命令因cwd错误未找到测试；首次 types 配置缺node/Vite声明，之后修正配置；旧 bankMeta 依赖的 #441 公共banks模块不在#477，本地任务metadata改为同值普通对象，未引入其许可/门禁框架。历史runner仅改type-only import指向任务schema，未改旧行为。

未跑全平台/完整CI、onboarding注册闭包、真实浏览器/真设备/真实施测、时长/信效度/难度标定、安装/发布/迁移或生产。DOM预览不是实机验收。

## G1 集成动作

只取本分支G3提交叠放#477；由G1统一更新公共注册、generated outputs及必要全局类型，读取每任务task-package.json中的两个identity/FE entry、两个seed order、两个bank和两个presentation/scientific对象。本组没有修改公共文件。manifest里新增order=旧order+1000仅作局部唯一顺序，G1统一检查跨组顺序；旧identity仅历史兼容，勿把已知24题旧池作为新36题默认配置。新三轴版本均1.1.0，旧版本不冒名接纳新内容。

由母线决定审阅/浏览器和最终集成Draft节点；本组不单开PR、不Ready/merge、不部署。科学限制、历史失败与未执行项不得在合成时改称已通过。
