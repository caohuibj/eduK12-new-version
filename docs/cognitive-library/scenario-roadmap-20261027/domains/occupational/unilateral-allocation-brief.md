# 下一项建议：单方资源分配

状态：**待用户图审，未批准实现、未接入**。stable key=`unilateral-allocation`。研究同一规则下，资源总量改变时，留给自己／给他人的数量与比例怎样变化。它区别于已有风险、努力、延迟选择与知觉信心，也不含信任互惠中的伙伴返还；不输出合作能力、慷慨、诚信或岗位结论。

[直接看一张原创界面图](unilateral-allocation-review.png)；[静态HTML](unilateral-allocation-review.html)。全部数字是讲解／合成报告示例，无参与者数据。

每题给出总量，你主动输入自己保留的整数，剩余点数实时显示给情境中的另一方，再明确确认。例如总量20，自己14／对方6，只是合法例子，不推荐这个比例。没有真人等待，没有实际付款；对方不能拒绝或更改，没有正确分配，不要求均分或多给。

| 拟版本 | 正式次数 | 预计含首次说明／练习 |
| --- | --- | --- |
| research | 6次；总量20／40／100各2次 | 约3–5分钟 |
| experience | 3次；同三种总量各1次 | 约3–4分钟 |

两版同界面、同规则、全部三条件；短版只减重复。每题选值＋确认按10–15秒、教学练习2–3分钟估时：长版约3–4.5分钟、短版约2.5–3.75分钟，向上取上述范围。没有倒计时或已验证短版；休息、慢读或重练可更久。自然短任务不为“科研版”硬加大量重复；算术与自他视角负担较低至中等。

练习仅1次（总量10点），随后1道守恒理解题，例如自己保留7点，对方得3点。操作完成且理解正确即可，不按给多少过关；失败／未完成先重呈完整说明与例子再练，最多3组，可退出，重练另约1分钟。

正式没有预填金额；留空时自己／对方均显示“—”，确认不可用。0必须主动输入，不能把空值变成0。确认前可以改；保留第一次有效选值供原件追溯，**最终答案取首次明确确认**。输入框Enter不提交，键盘Tab到确认按钮再Enter／Space确认。可跳过或结束；未确认为null，确认后给出0是真实0，中断不抹去已确认分配。

中文完整说明：“这是假想资源分配，没有实际付款，也没有真人在等待。每题先看总量，决定自己保留多少，剩下的给情境中的另一方；对方不能拒绝或更改。请输入0到总量之间的整数，检查双方数量，再点确认。没有正确分配，不要求均分、多给或保留更多；例子总量20、自己14、对方6只是合法例子，不推荐这个选择。确认前可以修改，首次明确确认后不能改答。没有作答倒计时，可以跳过或结束。留空不等于0，选择0或全部保留也都合法。”

English: “This is a hypothetical allocation, with no payment or live person waiting. Read the total, choose how much to keep, and give the rest to the person in the scenario. That person cannot reject or change the allocation. Enter a whole number from zero to the total, check both amounts, and confirm. There is no correct allocation and no requirement to split equally, give more, or keep more. For example, keeping 14 of 20 points and giving 6 is simply one allowed choice, not a recommendation. You may edit before confirmation; your first explicit confirmation is final. There is no response deadline, and you may skip or end the attempt. Leaving the amount blank is not zero. Entering zero or keeping all points is also allowed.”

报告按各总量显示真实自己／对方数量、给出比例及有效确认分母，少量重复只描述本次，不生成“慷慨指数”或稳定社会偏好参数；缺条件不比较，零分母null，差值保留正负。正文／小图／下载共用interpretable／limited／invalid；无确认不生成表现图或下载。建议是实际沟通分配前先说清总量、各方约束及对方能否回应，不评价道德。

固定参考[oTree单轮示例](https://github.com/oTree-org/otree/blob/4731e6ac46a6dd35b4bd44813933e081ac205965/dictator/__init__.py)。原代码两人、1轮、总量100；本项目6／3次是原创假想变式，不是文献标准次数或原版等效。代码许可除宽松使用条款外，另含使用该软件发表实验结果时的提名／引用承诺，**不简写纯MIT**。不导入Python、等待页、源图、题库或译文。来源、分项许可、公式和记录边界见[附录](unilateral-allocation-appendix.md)。当前只做设计资料，等用户决定是否实施。
