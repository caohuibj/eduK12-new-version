# 下一项建议：知觉判断＋信心

状态：**用户已了解次数依据并批准原计划；独立候选已实现，未DOT独审、未接入**。建议稳定key=`perceptual-confidence`。职业相关判断监控科研：看见多少视觉证据、是否选对，与“觉得自己答得对”的把握怎样对应。它在每次客观判断后增加独立信心阶段，区别于信息采样的停止选择、延迟选择的等待权衡；不替代它们，也不输出岗位结论。

[直接看一张界面图](perceptual-confidence-review.png)；[静态HTML](perceptual-confidence-review.html)。图案为原创强化讲解示意，非正式刺激或200ms录像；报告数字全部为合成例子，无参与者数据。

一题流程：注视中央十字→左右图案短暂出现，一边含条纹→图案消失后选左／右→再选1完全没把握、2较没把握、3较有把握、4很有把握。两阶段的首个有效回应各自锁定。判断有客观对错，信心没有正确档次，不要求选高；正式作答不逐题公布对错，以免先看到答案再报信心。判断和信心均无倒计时，可跳过或结束；信心缺答不抹去已作判断。

| 拟版本 | 正式次数与完整条件 | 全流程预计 |
| --- | --- | --- |
| research | 300次；目标左／右×3信号强度＝6条件，每条件50；5块各60 | 约24–35分钟，科研版较长 |
| experience | 60次；全部6条件各10，只减少重复 | 约7–11分钟 |

两版同界面、同单题规则、同难度条件。拟注视1000ms、图案200ms、题间1000ms；判断＋信心合计按2–4秒估时，加教学练习3–4分钟。无作答期限；休息、慢读或重练可更久，未实测。强度0.04/0.10/0.20是图案生成的名义混合参数，不是测过的物理对比度或难度等级。两次回应、持续视觉辨别，负担中等至较高；不宣称科研版或短版已具效度。

练习仅4题，左／右各2，条纹更清楚、显示500ms。完成4次判断＋信心配对、明显侧选至少3/4正确后继续；不按信心档次、速度或高收益过关。失败／未完成先重呈完整说明与例子再练，最多3组，可退出。练习逐题在信心作答后解释正确侧，不计正式报告；重练另约1–2分钟。正式低准确率本身不自动判无效。

中文完整说明：“先看中央十字。左右两块图案会短暂出现，其中一边有条纹；随后图案消失，请选你认为有条纹的一边。即使没有看清，也可以如实判断或跳过。选定左／右后不能改答，再说明你对刚才判断的把握：1完全没把握、2较没把握、3较有把握、4很有把握。没有正确信心，不要求总选高或低。首次有效信心回应结束本题，不能改答；也可跳过信心或结束，已作判断仍保留。两阶段没有作答倒计时。例子：明显条纹在右，先选右；之后按自己的感受选任一档信心，4不是练习通过条件。”

English: “Look at the central cross. Two patches will appear briefly; one contains stripes. After they disappear, choose the side you think contained stripes. If you could not see clearly, you may still judge honestly or skip. Your first valid left/right choice is final. Then rate how sure you feel about that judgment: 1 not at all confident, 2 somewhat unconfident, 3 somewhat confident, or 4 very confident. There is no correct confidence rating and no requirement to choose high or low. Your first valid confidence response ends the item and cannot be changed. You may skip confidence or end the attempt; your earlier judgment is retained. Neither response stage has a deadline. For example, clear stripes appear on the right: choose right, then select whichever confidence rating describes your feeling. A rating of 4 is not required to pass practice.”

报告将给真实选对数／有效判断数、各信心档次数和该档选对数，并区分未答、仅判断、完整配对；零分母为空，真实0保留。不会把1–4映射成概率、算Brier或“过度自信百分比”，不拟合meta-d′／M-ratio。建议是“判断不确定时先说明把握，再寻找支持或反对证据”，不是鼓励高信心。正文／小图／下载共用三态，不生成IQ、诊断、常模、排名或就业结论。

主要改造：固定6条件而非照搬旧阶梯、200ms而非源33ms、原创等样式移动图案及中英教学、信心阶段不设源4秒倒计时、减少练习与短版重复。所有改变均作为待审项目变式明示，不叫原版等效。来源为[固定Experiment Factory源码](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/perceptual_metacognition/experiment.js)，代码根MIT；方法边界参考[Fleming与Lau，2014](https://doi.org/10.3389/fnhum.2014.00443)。原图片、题库、译文和JGL派生helper不取用；精确来源、分项许可、公式与未核事项见[附录](perceptual-confidence-appendix.md)。已按原计划实现；[代码、检查原件与报告样例](perceptual-confidence-implementation/README.md)供DOT独立复核。原图保留审批时原字节和历史待审标记，未替换为运行截图。
