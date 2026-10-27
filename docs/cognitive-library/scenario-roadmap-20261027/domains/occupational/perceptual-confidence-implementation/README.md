# 知觉判断＋信心：原计划已实现候选

状态：**已实现，未DOT独审、未产品接入、未发布**。设计基线9b39a51fbc6601220c6412d6f247296c74e5ab91；用户认可交互／图片，在了解次数来源后明确“可以按这个原计划实现，了解了”。保留research300／experience60、完整6条件、4题练习和原时序，不把图审改成新审批。原PNG仍为审批时原字节，图内待审状态保留为历史记录；当前状态以本页为准。

## 代码与冻结组合

backend `src/modules/cognitive/content-candidates/perceptual-confidence/`：protocol、原始capture、单项本地校验schema、权威scorer、白名单report、DRAFT原生package、18维metadata、隐藏全部内部通用指标的participant-presentation及NOTICE。frontend `src/modules/cognitive/tasks/perceptual-confidence/`：逐字节相同的generated protocol/report/capture、语言/context/digest契约、session、实际PcTask/PcReport、完整中英教学和局部CSS。共享注册、平台schema、server、依赖与CI均未改。

engine/scoring/config/protocol/profile/metric/quality/reportDefinition/presentation/parameterExplanation初版组合均0.1.0。configHash和protocolSignature绑定原生快照；prepare固定真实zh/en教学语言、contextKey、seed、完整正式／练习manifest、realm及bindingDigest，原件与FINAL均带语言和contextDigest、逐条recordDigest。UI语言／context／ports变更停止原会话，用原端口保留原件；未知身份或报告组合拒绝。不覆盖旧冻结报告。

正式条件＝目标左／右×名义混合权重0.04/0.10/0.20。科研5块各60，每块各条件10，总300／每条件50；体验1块60／各10，同seed的科研第一块与体验计划一致。每题有独立刺激seed。算法是固定条件洗牌，不是自适应阶梯；300沿开源代码次数，60是项目短版，两者都不是已验证最低要求。

原创灰度生成：两幅128×128 CSS像素、间距24px，竖条纹周期16px。N为独立均匀0…255；S=127.5×[1+cos(2πx/16)]；目标round[(1−c)N+cS]，参照round(N)，R=G=B、alpha=255。正弦16点以百万分之一灰度整数表冻结，混合使用整数分子，避免不同JS数学实现的边界舍入漂移；最终为8位RGBA。这是实现精度定义，不改变批准的128px／周期／混合强度。完整seed／版本／参数在快照，原件保留灰度字节FNV审计校验；FNV不是安全认证或物理显示测量。原始像素可按冻结定义复建，不把每帧像素重复上传。

流程：软件注视1000ms→Canvas成功putImageData后记一次drawn事实→拟200ms（练习500ms）后隐藏图案、开放左右判断→首侧选锁定后开放1–4信心→首信心锁定→保存回执确认→1000ms间隔。两回应无倒计时，图案阶段不收答案。实际阶段事件／软件用时保留；普通计时器稍早唤醒只等剩余时间，稍晚就记录实际事件，不增一帧误差阻断、预检或逐帧探测，不声称物理曝光精度。

两阶段独立pointer完整按放、键盘左右／1–4或聚焦Enter/Space、辅助技术激活。按住、错配释放、多接触、旧阶段残留不变成下一阶段答案。可以跳过判断或信心；信心缺答保留先前判断。早期结束／失焦／隐藏／pagehide／真实卸载保留实际阶段与原件，不补题。StrictMode使用generation＋microtask区分effect replay和真卸载。保存失败保留pending，同一原件／FINAL摘要重试；不匹配回执不能显示成功。完整原件归档另需真实回执，合成端口不冒充DB/API/COS接入。

## 教学与练习

正式和练习前完整中英说明、例子、两阶段顺序、信心无正确值、输入、跳过和退出规则。4题练习左右各2、权重0.45、500ms；4次配对完成且侧选≥3/4即可。信心全报1仍可通过，不按信心、收益或速度过关。信心回答后才给练习正确侧解释；正式不给逐题对错，避免先看答案再报信心。未完成／未过先重呈完整说明与例子再练，最多3组，无第四组；不新增理解题或把练习门槛变成正式质量线。

## 权威统计与三态公开报告

scorer按冻结计划逐题重建图案校验与输入／阶段状态，不信任客户端正确标记；拒绝换题、换seed、换图案校验、负／错归属时钟、提前阶段结束、重复／错位envelope、未知版本和中断后补造题。

每条件判断正确率C/V只用可核首侧选；完整配对Npair须同题侧选＋之后首信心。每档频次Nj/Npair、该档选对Cj/Nj；零分母null、真实0保留。未开始、开始但未绘图、已绘图、已判断、配对、跳过判断、跳过信心及中断分开。信心未答不是0档，侧选全错／信心全同仍可解释，不按表现自动invalid。

折叠差值D=0.5×[(A.20,left−A.04,left)+(A.20,right−A.04,right)]，四匹配条件计划侧选全满才给，缺分母null，负值和0均保留。没有平均信心能力分、概率映射、Brier、过度自信百分比、meta-d′、M-ratio、IQ、常模、诊断、排名或岗位结论。

interpretable仅指冻结条件完整配对、记录可核；limited只描述实际判断／配对，抑制缺条件比较；invalid无可核侧选时不给表现正文／图／下载。三个公开渠道共用验证和白名单，内部observations、时钟、输入聚合及质量原因不外露。首屏真实次数＋普通中英解释＋建议＋短限制；条件与差值折叠，一张可选小图可收起。没有信心配对时只显示判断，不伪造信心表现。

## 实际原件与报告样例

- `research-synthetic-originals.json`／`experience-synthetic-originals.json`：完整300／60条真实纯capture类输出、原生envelope、native scorer结果及公开报告，**软件合成draw确认，非参与者数据或物理呈现记录**；对应`*-public-report.json`及`*-public-summary.svg`。
- 体验算例准确对应已审图：60判断、45正确、60配对；各档次数12/18/18/12、该档正确6/15/13/11。科研重复同类合成安排，300判断／225正确／300配对。实际强减弱差为−0.2及约−0.04，保留有符号结果，非优劣或能力结论。
- `react-synthetic-originals.json`：最终定向续验的实际React/jsdom流程，Canvas与端口为明确模拟；4题练习中3/4正确、信心全1，通过后正式第一题错误但有信心、第二题正确但信心前结束。保留4练习＋2正式＋同一FINAL，报告V=2/C=1/Npair=1。首轮UI合成导出文件未另存，续验更新了这个示例；首轮检查结果保留，不把它称全部尝试的原件档案。没有参与者原件被覆盖；后端300／60示例只生成一次。
- `replay-react-example.ts`读取这2条实际保留正式记录调用native scorer，输出`react-replayed-report.json`和`limited-public-summary.svg`；空记录三态见`invalid-public-projection.json`。这只是制作可审报告，不重跑旅程。
- `generated-stimulus-preview.png`是真实生成器静态Canvas示例，不替换已批图；`pixel-readback.json`保留8个128px Canvas回读SHA256，10%两图与独立Python基准／native单测一致，390px静态无横向溢出。没有时序或物理亮度研究，未验证真实设备。

## 定向检查原件

本节点Node24.21.0；不调用旧任务全组、构建、CI或生产。独立目标总计12（backend6＋frontend6），续验次数不累加为新目标。

| 文件 | 真实结果 |
| --- | --- |
| backend-first.json | 6PASS，包含300/60完整计划／原件、独立金标准像素、配对分母、null/0/负差、阶段／输入与公开门控 |
| frontend-first.json | 首5目标PASS：实际React阶段／练习／键盘、StrictMode／真实卸载／原端口、保存重试、三态／语言／迟到prepare |
| frontend-bound-first.json | 新增输入上限遇阶段切换目标实际FAIL，其余5filtered；保留原失败 |
| frontend-final.json | 只续验会话tick/drawn直接受影响5目标，5PASS／1filtered；三态／迟到prepare未改不重复 |
| types-first.json | 首轮真实失败：阶段Event联合类型未收窄；测试getByRole用了不支持的exact选项 |
| types-final.json | 修正后backend3入口／49源码、frontend2入口／54源码零诊断；backend源码之后未变，仍可复用 |
| types-current.json | 会话上限修复后只核受影响frontend2入口／54源码零诊断；保留此轮hash |
| types-visual-final.json | 最终题间画面收口后frontend2入口／54源码零诊断；当前前端hash |
| lint-first.json | 新项10前端TS/TSX文件，0error／0warning |
| lint-final.json | 会话修复的session／测试2文件，0error／0warning |
| frontend-visual-final.json | 题间画面对齐已批“空屏／注视”定义，显示中央十字；仅实际React对应目标1PASS／5filtered |
| lint-visual-final.json | 最后变化PcTask单文件0error／0warning |
| render-first.json | 首次将esbuild的ELF误用node执行，命令失败、未产生bundle；随后Python读取缺失文件也失败，非应用断言 |
| pixel-readback.json | 改为直接执行已安装esbuild后，静态Canvas像素回读和手机布局成功 |

边界修复：恰好256条非终结输入后，下一次阶段tick／drawn因上限使capture中断，原session只看阶段变化，可能未消费done。现在tick/drawn也统一消费done并保存中断原件；不改刺激、时序、输入或质量阈值，没有放宽断言。原件保存与报告保存仍不混同。

## 次数依据与实施范围

300来自固定开源实现的正式数，60是本项目6条件各10的短版提案，不是文献最低标准。用户了解后批准保持原计划。相邻研究实际用量不同：[Song等2011](https://doi.org/10.1016/j.concog.2010.12.011)每任务540次；[Fox等2024](https://www.nature.com/articles/s41598-024-64900-0)传统任务总210次、Meta Mind总100／40次，短版主要支持信心偏向，其起始稳定阶段和任务结构不同，不能继承为本条纹变式的效度。仅引用，没有导入论文刺激、游戏、图或题库。

旧信息采样31ace660、延迟选择08dc6e85以及其他WIP、已批PNG保持原样。本包仅独立候选和合成检查资料；没有共享注册、接口接线、权限／schema／COS、依赖或CI变化，没有合并、部署或激活。最终集中测试、共享集成与PR360仍由DOT独审后安排。
