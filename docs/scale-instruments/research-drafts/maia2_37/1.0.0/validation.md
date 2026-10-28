# 本地验证与未执行边界

本包为DRAFT/CANDIDATE独立中文工作稿，未作人工科学批准。专家译审PENDING，认知访谈和中国验证NOT_ESTABLISHED。

2026-10-26 06:57:30–06:57:33 UTC，仅对本工具执行一次定向检查：

- 唯一19项单元测试全部通过，0失败、0跳过，真实进程退出0。覆盖完整37题/固定题序/六点原值和未标中间锚点、9反向、八维4/6/5/7/5/4/3/3均分、最小最大/原始端点/中间/混合向量、每一题只影响自身维度、禁止总体总分、逐维完整缺失策略、非法/重复/未知回答拒绝、18岁边界/缺龄/非自评拒绝、真实buildScaleResult/parse报告、独立版本轴不污染及DRAFT拒绝激活。
- DRAFT拒激活采用真实previewScaleInstrument并显式传入本source，mock全局registry lookup以避免依赖未注册状态；得到EXECUTABLE_NOT_PUBLISHED和AUTHORIZATION_MISSING，allowActivation=false。这是本地预览证据，不是数据库真实激活尝试。
- 严格TypeScript闭包退出0，入口仅本唯一测试的传递依赖；558个源码/声明/工具/配置/锁文件输入的路径、字节数、SHA256执行前留存，执行前后无漂移。未运行全后台应用构建、全目录onboarding、无关测试或安装依赖。

06:59:15 UTC，单独对8个黄金合成向量实际调用buildScaleResult并parseScaleResultV2，生成report-results.synthetic.json：6份完整结果各8段解释，共48段；2份缺失结果quality=invalid、解释为空。report-example.md选mixed向量，不是真实被试。8个primary summary纯中文字符数155–168，均含体验解释、反思和具体小行动。没有常模、分级、百分位、诊断或新增图卡。

内容静态复核：公开双语37条英文与私有固定原出版商Table2逐字一致（仅版面空白折叠）；后端中文37条与双语一致；选项一致。版权原文、来源、改编说明、66条八轴及中文检索词均保留。原始HTTP403/工具读取失败在私有证据保留，没有回写为PASS。

版本：instrument/content、scoring、localization均1.0.0，report1.0.0；parameterPlanVersion1.0.0为NONE_SCORE_ONLY计划，现引擎none参数无独立运行时version。hashScaleDefinition有versionAxes时只绑定内容/计分；报告版本变化不污染内容hash，题文变化会改变hash，已测试。

NOTRUN：本agent未改generated registry、未做数据库安装/非owner事务或激活、未做浏览器/指导语sidecar展示、未跑CI、未提交/推送Git、未发布/部署、未联系作者。NIH node20646返回403，NIH DOCX实际回读NOTRUN；PLOS S1已实际回读且不冒称NIH镜像，此非必要来源缺口不影响固定Table2方案。PREPARED sidecar尚未接入旧instruction消费者。标签不授系统使用权。

源码SHA256：3d1fc6192db0261518b8d85c6bea2eed7219d7f3e7ca73a5e0010d7a3292c3cb。

完整原始证据：/workspace/eduk12-scale-evidence/20261026-wave7/maia2/，主要前缀20261026T065729Z。包含source-audit.json、原始JATS/Table2/许可、原S1 DOCX/原英文PDF、HTTP失败记录、执行前输入与源字节快照、JSON reporter/退出日志、严格类型结果和实际报告输入/日志。已有依赖环境复用，未声称完整node_modules字节已签名。
