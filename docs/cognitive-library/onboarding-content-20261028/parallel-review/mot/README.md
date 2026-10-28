# MOT现有native独立复核与启动说明补齐

基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`；分支
`review/cog-mot-20261028`。所有新Node执行使用
`/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`（下称 `NODE`），实际v24.21.0。
不重建旧工具，不重跑2练习＋9正式、45科研或旧时序研究。

## 实际改动

原MOT启动页已经解释10圆点、5红色目标、先看后选、不可撤销和2次练习，但缺少本次
正式次数、各速度重复数、既有用时估计及保存完成含义。仅在 `MotTask.tsx` 的intro补：

- 体验版9次、每速度3次、预计2–5分钟；文献对照版45次、每速度15次、预计9–15分钟。
  数值取自现有config及package的estimatedMinutes，不编造实测时长；明示校准/阅读/
  重练可能更久。
- 做完本次正式次数并等服务器确认报告保存；练习另计，完整原件归档另行确认。
  保存待确认时保留页面、重试原记录，不重复正式施测。

中英文同步。`reuse-inputs.json`从当前文件移除新增intro文字后，与基线逐字相同；
未改运行、练习、校准、刺激、测量布局、速度、时序、题量、输入、计分、版本或保存
协议。不为这项可逆说明文字新增单元测试或重跑旧整套。

## 原件、选择与分母复核

已读现有MOT implementation、实践1.1.1修复、C-02归属、真实native HTTP/浏览器及
原件archive service/client、冻结report格式修订证据；沿实际capture→draft→
NativeMotRunner→nativeHost→FINAL/冻结报告/归档路径阅读源码。历史engine1.1.0、
现有engine1.1.1/scorer1.1.0/config1.0.0及report1.1.0/1.1.1兼容未变。

`audit.ts`只采集4个独立的正式首轮代表原件，seed
`mot-independent-review-20261028`，真实MotCapture→motTrialEnvelope→
runAuthoritativeScorer。完整输入、frame raw、核心摘要、选择与权威结果在
`representative-records.json`。

| 真实输入 | 有效次数 | 平均找回 / 比例 | 核对点 |
| --- | --- | --- | --- |
| 2个目标＋3个非目标，重复点首个已选对象 | 1 | 2 / .4 | 首选择不变，重复不添第6项 |
| 5个非目标 | 1 | **0 / 0** | 完整全错是真零，不是技术无效 |
| 首选择后失焦中断 | 0 | **null / null** | 原首选择保留，不把缺失补0 |
| 运动结束回调晚17ms | 1 | 2 / .4 | 正常接受，未加门禁或重测 |

这几例每次只收到1条，尚不满足现有每速度3条完整有效条件，因此公开投影均invalid、
headline=null、rows=[]。不能拿内部有效首轮的2或0绕过既有public gate。分母仍是5个
目标/有效试次；速度1/4/8的条件不混成日常注意容量、排名或诊断。

```text
真实时钟/首选/中断 → core摘要 + 独立raw帧
        → 原身份draft（session/attempt/protocol/configHash/seed）
        → native envelope保留实际时钟 → FINAL权威评分/冻结报告
        → 独立原件归档确认；仅报告ACK不足以清原件
```

既有实践规则复用：中断练习保留原件、不显示0/5、不推进；先完成该次后再继续。
完整全错的练习是真0，可继续；这是既有已批准教学策略，未擅自增加正确率门槛。
本页代际身份和同摘要重试、C-02原端口归属、真实epoch、刷新后不重曝、FINAL回执与
归档SHA/身份验证仍走原实现。未新增对旧raw、服务器或COS的回算。

## 实际命令与退出

1. 根目录：`NODE server-version/backend/node_modules/tsx/dist/cli.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/mot/audit.ts`。
   退出0，4个代表原件核算通过，原stdout为 `representative-run.log`。
2. 根目录：`NODE docs/cognitive-library/onboarding-content-20261028/parallel-review/mot/intro-preview.cjs`。
   退出0，实际React组件静态渲染4份intro及2份校准；原文字在 `intro-render.json`。
   阅读发现新增英文两句间缺空格，修正文案后仅用 `--english-intros-only`续渲染两份
   英文intro，退出0，保留首轮记录与 `intro-render-english-final.json`。不是失败测试。
3. 根目录：`NODE docs/cognitive-library/onboarding-content-20261028/parallel-review/mot/intro-types.cjs`。
   退出0，实际tsconfig.app闭包18份源码零诊断，摘要见 `intro-types.json`。
4. 复用索引脚本通过Node24.21读取既有原件摘要，并核对新差异仅intro文本。
   六份直接消费者protocol/scorer/生成协议/draft/context-retention/NativeMotRunner
   与对应历史记录摘要完全一致，见 `reuse-inputs.json`。

无新的计分失败。一次编辑工具在读文件时发生 `exec-server transport closed`，随后
读回确认尚未修改，正常重试成功；无未决或重复写入。

## 可读交付与证据复用

实际组件静态预览：[体验中文](intro-experience-zh.html)、[文献对照中文](intro-research-zh.html)、
[体验英文](intro-experience-en.html)、[文献对照英文](intro-research-en.html)、
[中文校准](calibration-zh.html)、[英文校准](calibration-en.html)。均有合成标记，
未执行校准、浏览器交互、实际设备时序或新的截图，不冒称正式施测证据。

原2+9真实HTTP/浏览器、先503后200归档重试、既有三态图文/PNG下载、practice与
C-02运行原件，按索引复用。MotReportCard和MotTakeHome/下载共用projectMotReport；
limited隐藏受限速度和整体均值，invalid不输出表现。真实0和null沿原投影保持。
原report1.1.1仅显示精度修订，旧冻结report1.1.0及其字节身份保留。

既有语言接线边界仍明确：native入口目前默认中文，独立组件支持English不等于产品
英语施测已接通；可信的本次language元数据透传仍由主代理协调，未按UA猜测或增加
客户端权威。这个已知范围不是本轮新增失败，也不扩大完成声明。

本轮无 denied/pending/uncertain 操作或新阻塞；未push、CI、Ready、merge、部署、
schema、凭据、安全设置变更，未动共享core/registry/archive或其他设计线。
