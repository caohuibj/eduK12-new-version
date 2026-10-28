# MOT练习中断修复：内容候选

原组件把中断练习保存后显示“找回目标0/5”，且可进入下一练习/正式。新增回归在原代码真实失败，原JSON保留。现保存原中断record后显示“练习已中断”，不输出命中数，不推进practice index；参与者可明确重试该次练习。完整作答但真正全错仍为0/5，不能把0误当无效。第二次练习中断也不能进入正式。

这是练习行为/协议修复，engine与presentation从1.1.0升1.1.1，protocol.key为mot/1.1.1/1.1.0、protocol.version为1.1.1；scorer数值算法/metric/quality/report仍1.1.0，config/profile仍1.0.0。两版配置hash及原计划hash保留，新协议signature另冻结；旧golden和旧兼容矩阵不覆盖。新task要求draft公开的冻结protocol/seed相符，旧draft key仍按原身份可读取，绝不自动变成新engine。没有生产平台接入。

只运行直接受影响的三项练习场景、一个新增draft版本隔离场景及两个backend冻结版本场景（共6项通过）；三项练习通过后未再重跑，新增第四项单独过滤执行。受影响实际tsconfig类型闭包由主线统一另存，不把Vitest转译当完整types。没有重跑旧capture/轨迹/seed/scorer算术或完整浏览器流程，不涉及这次一帧偏差分析。

原始JSON报告附在本目录，before文件保留1项失败和未执行项；after文件保留3项成功；draft-version只执行新增1项，其余3项明确未执行。version文件为2项成功。合成虚拟时钟只验证反馈、保存和版本合同，不冒充真实设备/物理时序。

当前未关闭的其他MOT依赖：C-02宿主切换/异步callback隔离、C-03真实epoch归属、C-05永久保存预算出口；native注册/双profile、真实API/DB/COS/报告/四入口/标签消费者仍由平台线闭环。本修复只解决C-01及为该engine变动所需的draft版本隔离，不宣称其他项已完成。
