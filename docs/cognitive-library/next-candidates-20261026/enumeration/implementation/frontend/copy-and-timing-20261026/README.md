# 文案小步与冻结时序开发分析

基线：`cognitive-next-three-core-20261026@94152032885d5cbaf149a15ec03d5a0c72ea2c67`。本步只调整普通用户文案并新增受影响状态截图、只读timing-diagnosis、待审timing-proposal。未改capture、显示几何、随机化、时序策略、保存门控、报告gate、布局CSS或原始25条数据；正式施测仍禁止。

## 当前源码差异

- `EnumerationTask.tsx`：去掉参与者页的主机/配方/端口/回执等实现词；缺校准提示先完成屏幕与观看距离设置，设置未就绪提示联系发布者，提交未确认提示保持页面打开并重试。保留内部审阅与合成标记；报告仍无表现结论/内部metrics。
- `enumeration-candidate.test.tsx`：仅同步可见按钮/标题/提示文字选择器，未改原有断言逻辑或运行原17项/3+25流程。

入口SHA256：`a2cacadbed917ae742a285a8818e060ee07be284b42938a88ee061d9eaacf463`。修改前后入口与测试全文归档在本目录/状态哈希中。原时序capture SHA256为`05e0dc40d8be27cc0d7efa7bfab48594d23d4e0ebffa35e818aaa23a337cb8ce`，本步未变。原raw SHA256始终为`92ce9ca47badb38c0af37e28c4ee497ecf3c5863c4c752a4c7f26290ccace132`。

语义分类：参与者文案/呈现层修订，操作、目标数量、次数、响应范围、分母、计分、版本/参照选择与质量后果不变。timing proposal仅文档，不是新运行字段/版本或协议冻结。任何真实帧策略/原始时钟语义改变仍需独立审阅、用户明确批准和实际版本兼容评估。

## 这次确实检查了什么

`copy-state.check.json`：云端Chromium151、sandbox开启、localhost隔离，10.58秒exit0。`copy-state-evidence.json`记录85条文案/状态断言、17截图：中英文指导、缺校准/缺配方/屏幕变化/放不下、开始受阻、提交等待/失败、中断练习及关闭报告。核对普通文字不含实现术语、内部/合成标记保留、相关开始按钮仍禁用、报告无获准结论/伪造metrics泄露、手机390×844/平板820×1180及200%无横向溢出。实际查看了中文提交失败、中文200%关闭报告及英文设置未就绪截图。

重要范围：为避免重跑完整3+25，等待提交/关闭报告使用**仅云端测试bundle里的合成初始view注入**，没有给产品组件增加入口。它们只证明当前源码的文案/状态渲染，不是再次证明最终ACK或保存完成。提交失败和中断练习各在中英文各做一次：共4次合成练习曝光（2次完成后故意拒绝保存ACK、2次中断），没有新增正式50ms试次。原工具scope中的“Two single synthetic practices”指这两种状态；这里明确总次数为4，不能误读成全程只2次。

入口类型检查由主线统一执行并已成功，见`docs/cognitive-library/next-candidates-20261026/implementation-coordination/frontend-copy-types.json`：实际frontend tsconfig、5个改动入口合并检查，exit0、3.826秒、本入口hash匹配且执行期间稳定。本子任务没有重复types。旧backend算术、前端17项和完整3+25/原浏览器检查均未重跑；它们保留各自原source与原始结果。本次未启动CI/全量构建/依赖安装/生产访问。

## 只读7例诊断

`timing-diagnosis.cjs`读取原raw和未改capture源码；输出JSON含25例对照、7例完整刺激回调、IEEE754 precision17、阈值判定及源码行号；Markdown供人读。这是开发分析，不是本agent独立科学结论。

7例0-based index为1、2、11、12、14、16、22。最后stimulus距onset均约49.9ms，源码`elapsed>=50`为false；下一回调约16.7ms后，距onset约66.6ms，为true，因此切换mask。首stimulus记录与core onset一致，首mask与core maskOnset一致。保存间隔约16.6–16.7ms，不支持把这7例归为主线程卡顿。0.1ms差距也不能只说成“精确50.0减法的二进制微小尾数”。

这些是已有数字/源码可以证明的软件直接路径。具体API计时分辨率/量化、rAF相位、compositor调度及物理像素on/off没有独立测量，仍不能宣称根因或实机50ms验证。原raw读取前后hash一致；未加epsilon/容差、未删失败帧、未改任何时序政策。

## 只提交方案，不实现帧量化

`timing-proposal.json/md`明确标记`PENDING_INDEPENDENT_REVIEW_AND_EXPLICIT_USER_APPROVAL`。建议供审阅：观测rAF节奏，初期仅评估60/120Hz档位对应3/6次刺激绘制机会；90/144等不能精确整除50ms的档位开始前阻止，不静默取整或交替次数；100Hz即使数学可整除也不是自动准入。数值分类频带、采样、稳定性、缺帧与容差保持未定，不能null即通过。

提案分开记录rAF参数、进入回调perf、draw命令开始/返回，以及刺激首组和mask首组on/off；实际像素on/off未知为null。首个真实draw指命令确实发出并无异常返回，不伪装物理呈现成功。仅按callback计数也可能在缺帧时延长，所以缺帧/中断画面策略同样待审。JSON给10个描述性边界样例，明确不是已执行的新测试或可用运行配置。

后续顺序：统筹独立审原协议/源码与方案→必要示意及用户明确批准→冻结数值、实际schema/版本/兼容→决定真实浏览器/设备续验范围。当前不修改renderer，不添加0.2ms或任何epsilon，不放大到66.6ms，不沿用旧语义悄悄改core onset，不授权正式施测。

## 未验证

未做真实手机/平板/iOS Safari/Android等硬件验证、物理尺寸/观看距离/亮度/扫描/曝光、遮罩等效、语言/人群/年龄/常模或并发容量研究。生产耐久host、注册/四入口、API/鉴权、DB/COS/导出仍未接通；开发自查不是独立审计。全部检查与文件在云端，未访问用户Mac文件、终端或浏览器。无commit/push/合并/部署。
