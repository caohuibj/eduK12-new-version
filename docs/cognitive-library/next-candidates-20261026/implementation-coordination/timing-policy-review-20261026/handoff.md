# 点数判断计时设计交接：只供独立审核

本增量基于 `97883153077a9527b6b5442feec7055f72933ab4`，只新增两个文档目录。它不修改 capture、阈值、runner、scorer、测试、版本或原始记录；不启用新计时策略、CI、合并或部署。主线在此进行的是开发材料一致性核对，独立审核仍由外部统筹本人执行。

完整设计位于 `docs/cognitive-library/next-candidates-20261026/enumeration/implementation/frontend/timing-policy-design-20261026/`：`README.md` 为数值总表，`policy-design.json` 为21条规则卡，`boundary-cases.json` 为22个未执行的描述性案例，`sources.json` 为精确来源，`consumer-map.json` 为实际消费者及平台依赖，`validation-plan.md` 为获批后的最小受影响验证计划。

拟观察的是浏览器 rAF 回调节律，不认证硬件刷新率。初始准备在clock probe前开始计时，最多6秒；30个warmup间隔加240个连续测量间隔，共271个marker，理想60/120节律约需4.5/2.25秒，首回调等待也占预算。60/120档各按周期±0.5%分类，其他档拒绝；稳定性、累计marker、entry及draw工作预算均逐项列明。全部数字为项目暂定，规范和框架资料不为这些数值背书。

未来正式刺激首个真实发出且无异常返回的draw组为0；60档刺激组0..2、首mask组3，120档刺激组0..5、首mask组6。marker、回调entry、命令start/return分别记录。所有门槛即使通过，也不等于物理曝光50ms。周期、marker和命令预算叠加的commandStart跨度最宽48.75–51.25ms；这一范围必须交独立审核，不能隐去。

预留任务曝光（包括练习）后出现缺帧、超时或绘制异常，拟停止后续刺激、尝试清原#808080背景并终止同attempt。保留原尝试/成功/异常及clear事实，不补造mask或offset；失败后只允许保存原记录的重试，不重新曝光。该显示政策仍待审核及用户明确批准。host合法冻结attempt的映射尚未实现，不能由客户端字符串绕过预算。

原raw SHA256仍为 `92ce9ca47badb38c0af37e28c4ee497ecf3c5863c4c752a4c7f26290ccace132`。7/25正式记录的66.6ms路径来自第三间隔累计49.9ms未达到原elapsed>=50条件，不能归因主线程卡顿。28个trial段最长182间隔，不能拼接成完整270间隔准备证据。没有新clock probe、120Hz实机、draw时钟或光学数据；旧25条未重新判为通过。

本次检查仅为JSON可解析、材料哈希、相对路径、原数据哈希及文档差异范围；没有执行新policy/边界测试或重跑旧检查。下一步由外部统筹读取固定Git提交独立审核，实质政策获明确批准后才实施并运行受影响验证。
