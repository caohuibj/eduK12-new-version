# 连续图像再认：正常描述报告政策修订

基线86adea091270134b5197fb81b76649007596b8f3，分支cognitive-next-three-core-20261026。读取[Notion页首当前产品原则](https://app.notion.com/p/405d27635a3881b2a2d3fecce26d7cb3)，实际fetch时间2026-10-26 09:22:25 UTC，页首政策生效09:20 UTC。用户允许偶发一帧/十几毫秒偏差，不为此关闭正常反馈或增加预检/科研回算；没有放宽未完成、数据丢失、非法输入或真实素材许可。

## 根因与最小修订

原native scorer将researchReviewRequired恒true；原生投影永远null；TaskDefinition的headline/user为空、表现全部research_only；前端final回执只接受limited/invalid，Report也恒受限。因此即使完整记录也无法显示表现，原因不在缺少总体score或没有常模。

现在完整、合法且冻结素材权利绑定合格的记录可提供**本轮描述**：HR=有效目标重复seen/同一有效目标配对数；FAR=对应目标首次seen/同一分母；CRR=HR−FAR，保留负值。研究版分母60、体验版20，填充/警觉/练习仍分开。正确“不回应”和重复漏认是有效行为，0就是0，不冒充缺答；缺失记录或零有效配对仍按limited/invalid隐藏，缺失率保留null。

不再以没有适用常模、物理计时证明或人工ResearchReview为普通描述门槛。native仍拒绝客户端ResearchReview；没有伪造review交给旧纯scorer。原数值/seed生成器和750/800ms输入协议未改，只在native剔除旧统一人工复核reason，按实际技术事实和资产绑定决定质量。实际766.6ms图像记录的合成case可正常描述，时间不重写。没有新增时序探测、阈值、白名单、科研回算或COS回读；无中断标志的任意长前台卡顿尚无专门新规则，本轮不私设门槛，也不宣称已经覆盖。

## 素材与host真实边界

现有assets.ts有assetManifest.status/manifestHash/evidenceRef及逐图hash验证，却没有nativeSession或服务端冻结的许可字段。本轮只把同一三字段精确绑定到候选NativeConfig.assetManifestBinding；默认pending。frontend要求该绑定与其已有assetManifest一致，authorized证据缺失或synthetic-review-only不开放正式报告；没有新增权限服务、客户端授权勾选或自动清权逻辑。

**生产host mapper尚未接入**：平台必须从受信素材权利记录取这些字段，确认清单hash/ID/许可覆盖后再服务端冻结，不能采信客户端自己构造的status/evidenceRef、session或回执。configHash是完整性检查，不是权利证明。正式图像库仍未选定/获权，OMI NC-SA与SVG合成fixture不能因此变成正式获权素材。本轮正常分支测试用的是明确标注的逻辑权威fixture，只证明分支/分母/报告绑定，不证明真实素材授权。

## 独立版本和兼容

- engine 0.1.0、generator seeded-blocks-0.1.0、responseRule 0.1.0不变。
- native scoringVersion 0.2.0、configVersion 0.2.0；protocol.key更新为continuous-recognition/0.1.0/0.2.0，protocol.version仍0.1.0，表示实际呈现协议未改。严格核真实SessionConfigSnapshot configHash/protocolSignature、身份、input.config。
- 质量规则独立标识product-session-descriptive-0.2.0，作为真实任务config.qualityRule被冻结并参与configHash。TaskDefinition并无独立qualityDefinitionVersion字段，本轮没有凭空宣称新增平台字段。
- TaskDefinition.report.version及public projection reportVersion 0.2.0。指标数学定义未改，但质量/公开可见性与导出语义改变，不能当纯文案；本轮以scoring/config/report新组合冻结。内部旧paired-targets-0.1.0计算实现保留，未替换历史候选协议。
- 旧0.1 native tuple不兼容新入口，旧结果不会自动放行或改写。若未来显式重分析，另存新tuple/结果并保留来源，不能默默重算。兼容矩阵见compatibility.json。

公开投影除quality.state还核版本、规则、冻结/素材hash、全体质量flags、记录/分母完整性、合法分子及率/差值一致。reportPolicy作为research_only MetricDefinition明列。正常报告给真实分子/分母与本轮解释，不给能力、年龄排名、诊断或招聘预测。limited/invalid隐藏表现，原生当前不生成take-home图片；至多一张可选图的产品规范未变。

前端session只接受与本次config/protocol/asset hash、数量和最终提交摘要一致的host原生投影。正常投影要求正式授权且非synthetic会话；报告组件不读内部metrics。指导语、刺激、输入与采集时序未改。metadata状态同步为CANDIDATE_DEVELOPMENT，并链接当前产品政策；原18维历史标签不变，不新增适用性/许可结论。

## 最小native接入要求

1. 平台原生注册/准入recognitionDefinition，支持research/experience而非捏造standard或legacy数值score；当前仍未注册、publication DRAFT。
2. 服务端受信素材mapper构造assetManifestBinding；createRecognitionSnapshot(profile,formalIDs,practiceIDs,frozenAt,binding)冻结0.2 config。平台randomSeed和完整manifest来源不改，客户端不得自报授权。
3. FINAL消费者用真实AuthoritativeScorerInput/TrialEnvelope并保留当前严格归属、幂等与耐久回执；timeout只能表示技术失败，不把正常无回应标timeout。
4. 保存scoring/config/protocol tuple、质量规则和report0.2依赖及原结果；公开/导出读取相同冻结projectNativeRecognitionReport，不直接取内部metrics。
5. host最终回执映射还需接真实API/DB/COS/设备回读；本轮仅候选端口准备，没有修改共享core、API、数据库或COS，未证明入库、上线或真实保存。

## 实际验证与边界

新增后端政策19项通过（正常两profile、16.6ms实际差异、负值/0/null、未完成、素材pending/synthetic、技术损失、旧tuple/非法/客户端Review、投影一致性）；最后补reportPolicy MetricDefinition后仅复验声明1项，另外18项未重跑。前端新报告7项通过（host绑定、synthetic/pending拒绝、真实分母、负值、旧版/错率/不足/缺binding隐藏）。未重复原84、完整8+100、素材采集、设备时序或科研分析。

后端native/package入口严格类型检查退出0；MetricDefinition收尾后仅package入口闭包再次退出0。根文件/hash/参数见evidence.json，主线可复用。metadata最后只作被明确允许的状态/政策文案调整，没有为它重复类型；记录当前hash及此边界。frontend类型按约由主线按实际配置统一处理，本轮不冒称已完成。

云sandbox Chromium仅6个合成报告阅读场景通过：中文/英文手机正常报告、负差值、limited/invalid，以及英文820宽200%阅读，均无横向溢出，无任务曝光。截图原件及report-review.json保留；约151KB可再生JS bundle已移/tmp，仓库不收录，保留其hash/大小与执行时harness快照，后续脚本直接在临时目录编译。测试权威状态是逻辑fixture，不是正式资产清权或真实平台权限。

本轮是候选自查，不冒称独立审计或发布门禁。没有CI、commit/push、Notion写入、部署。未验证真实素材/被试/设备、四入口、注册、生产host授权mapper与持久化链路；没有以这些未验事项继续关闭已合格记录的本轮非诊断描述。
