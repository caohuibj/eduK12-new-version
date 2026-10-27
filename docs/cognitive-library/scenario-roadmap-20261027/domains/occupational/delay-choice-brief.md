# 延迟选择：单项图审简要介绍

[直接看界面图片](delay-choice-review.png)；[静态HTML](delay-choice-review.html)。这是原创设计图，不是施测截图；报告数字为合成例子，无参与者数据。DOT已确认`delay-choice`仅归职业科研领域；**等待用户图审，未批准实现、未接入**。

每题比较两张金额／等待卡，选择更愿意的一张。例如“今天20点／2周后25点”，任一均可。两边都是假想点数，不实际付款，也不用真的等数周；没有正确偏好或高收益标准。金额、日期持续可见，首次有效选择结束本题，无倒计时；可明确跳过或结束。手机、平板用同一两卡界面，触屏／鼠标／键盘兼容，两卡样式相同、左右位置平衡。

| 拟版本 | 正式选择与完整条件 | 预计含首次教学／练习 |
| --- | --- | --- |
| research | 72次；9金额倍率×4等待对＝36条件，各2次 | 约6–10分钟 |
| experience | 36次；全部36条件各1次，只减少重复 | 约4–7分钟 |

两版基准20.00点，倍率1.01/1.05/1.10/1.15/1.20/1.25/1.30/1.50/1.75，对应较晚金额20.20/21/22/23/24/25/26/30/35点。四等待对为今天→2周、今天→4周、2周→4周、2周→6周；全部时间均从今天起算。理解金额／日期负担中等，动作负担较低，长版重复更多。时间按每题3–5秒＋约0.5秒过渡、教学练习2–3分钟估算；非实测，慢读／休息可更长。由此将旧初稿体验版4–6分钟修正为约4–7分钟，次数不变。

练习2题，用较小金额与较短日期（例如今天10点／1周后12点、1周后8点／2周后10点），没有正确偏好；随后2道理解题检查金额／获得日期与假想不付款。操作完成且理解全对再继续，失败／未完成先重呈完整说明与例子再练，最多3组，可退出。重练另约1–2分钟；练习不计正式记录。

正式前完整说明（中文）：“两边都是假想奖励，不会实际付款，也不用真的等待。每题两张卡分别写出点数和获得时间，所有时间都从今天起算：2周后是第14天，4周后是第28天，6周后是第42天。请比较后，选你更愿意要的一张。没有正确答案，不要求总选较多、较早或固定一边。首次有效选择结束本题，不能改答；没有作答倒计时，可以跳过或结束。例子：今天20点或2周后25点，两种选择都可以，不推荐哪一个。”

English: “Both rewards are hypothetical. No payment will be made, and you will not actually wait. Each card shows an amount and when it would be received. All times are measured from today: in two weeks means day 14, four weeks means day 28, and six weeks means day 42. Compare the cards and choose the option you prefer. There is no correct answer and no requirement to choose more, sooner, or a particular side. Your first valid choice ends the item and cannot be changed. There is no response deadline; you may skip an item or end the attempt. For example, you may choose 20 points today or 25 points in two weeks. Either choice is allowed; neither is recommended.”

主要改造：参考公开36条件结构，固定基准而非随机金额、改用假想点数并去掉真实奖金承诺、原创卡片和中英教学、增加研究版重复。来源不是自适应滴定；本项目不估折扣参数。用真实选择数／条件分母描述本次结果，遗漏为空、早选真实0类选择不等于0能力，不按偏好评判。正文、小图、下载共同受三态控制；不输出自控力、耐心、常模、IQ、诊断或岗位结论。

固定来源为[Experiment Factory同提交源码](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/discount_titrate/experiment.js)及[MIT许可](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/LICENSE)，没有导入源图片、题库、译文或旧运行时。假想／真实激励等效、中文、设备、人群及短版效度均未验证。来源／许可／公式／版本与位置平衡细节见[附录](delay-choice-appendix.md)。本包只提交设计资料，用户图审批准后才实现。
