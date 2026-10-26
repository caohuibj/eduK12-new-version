# 9415203之后的小步交付

三位agent已完成各自小步并停写。此次只改参与者文案/诊断折叠，以及ANT已终止后迟到本地写失败的可重试状态；后者有原始失败复现和3项受影响复验。相同中断reason、raw与digest保留，不重曝、不改刺激/时序/计分。主线以实际frontend tsconfig仅补5个变动入口类型闭包退出0，最终根文件hash仍匹配；16个backend源码未改。

## 点数时序仍未通过，未修运行策略

独立统筹对9415203原raw和源码确认：7例在第三个间隔49.9ms未满足>=50，于是再画一次刺激，下次约16.7ms后转mask。现有间隔不支持将这7例归为主线程卡顿；不能当光学物理时长实测。原25条逐帧raw及capture/display源码与9415203逐字节相同，没有epsilon、放宽容差或策略替换。

[只读诊断](../enumeration/implementation/frontend/copy-and-timing-20261026/timing-diagnosis.md)与[帧量化提案](../enumeration/implementation/frontend/copy-and-timing-20261026/timing-proposal.md)现可审。提案建议先评估观察到的60/120Hz节奏对应3/6个绘制机会，不静默接纳90/144等档位；具体节奏分类/采样/稳定性/缺帧数值为null/待定。它清楚区分rAF参数、callback entry、实际draw command开始/返回和未知物理像素on/off。10个JSON场景为描述性合同，未写入运行器或作为新测试PASS。统筹审核并形成具体政策、用户明确确认实质变化后再实现/定真实续验范围。

## 证据入口

- [点数文案/诊断/提案小步](../enumeration/implementation/frontend/copy-and-timing-20261026/README.md)。85条状态断言/17截图；不复跑原3+25。
- [再认文案小步证据](../recognition/implementation/frontend/participant-copy/evidence.json)。14个状态/阅读场景；不复跑原8+100和后端84。
- [ANT最终前端证据](../ant/implementation/frontend/evidence.json)。32个不同病例；保留首次与新增组合失败、原图和原输入绑定，新增copy与late-save实渲染证据。原backend/capture未重复。
- [五入口实际配置类型检查](frontend-copy-types.json)。无全应用类型/构建/CI。

## 保留的边界

开发自查不替代独立审计，未宣称三任务已入库/可正式施测。点数计时、再认正式图片授权及native/双profile/实际host耐久保存/FINAL/API/DB/COS/四入口/导出与标签消费者尚待闭环。点数formal running中的计数进度仍应结合已批最小刺激界面规则复核，本次纯文案小步未擅自改变布局。三层语义分开：此轮文案属呈现修订，ANT修复不改测量数据，帧量化将是未来测量/配置/质量合同改变；不凭空添加生产normVersion或总版本字段。批准的原三张图在Notion第9节，未来新测验仍先人工审图。
