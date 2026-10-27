# 点数判断输入合同：更薄方案的只读比较

本轮基线db4920995395c73e9897ecc849e40ec1e95efc78。本文件取代上一轮README中的B/F、首正式header、额外摘要及FINAL前helper建议；旧文原样保留为未实施历史。没有改产品代码、跑测试或新增采样。

**推荐采用薄方案，经必要的配置读取/宿主/归档适配后可满足本轮产品目标。没有找到必须新增FINAL字段的现有报告业务不变量。** 它保证已保存core和声明原件能在归档阶段对应，不认证物理呈现或自报校准真实性；这点加B/F或更多hash也无法解决。不是宣称当前枚举已能运行：其配置仍只接受null配方，真实入口/专属归档尚未接通。

## 一、删除与保留

|上一提案|本轮推荐|
|---|---|
|config中的definition/id/hash重复包装|直接将完整既有Recipe对象放进现有stimulusRecipe；由既有configHash冻结，不新增运行时recipeHash包装|
|calibrationHash、bindingHash、B/F|全部删除；沿用已有Calibration.id和一次完整artifactHash|
|首正式core.presentationContext和每trial.presentationBindingHash|不新增；core保持现有字段|
|新Artifact/Record v2和canonical编码|不因审计需要升级；保留既有v1字段及candidate-json-stringify-sha256-v1语义，旧原件不改写|
|unified-final-submit前新helper|不增加；不向报告路径搬完整校准、pageOrigin或点位|
|同epoch本地冻结与既有配置/归属保护|保留；复用真实身份事务，不用改usage字符串代替授权|

配方内容及获批刺激/布局/输入/100与25次数/名义50ms宽容政策均不变。recipe-definition.proposed.json仍是可亲读配方；1aee9b741bbdd8d8ca64cded52bed2bcc294f78be1415ebe1fcd5b4a3130acf1仅是这份提案的静态审阅摘要，不要求在运行时再存一套同义hash。实际冻结采用已有完整config及configHash。新ID参与现有点位seed的事实仍保留，不重标旧合成记录。

## 二、现有报告不变量究竟由谁保护

|需保护的事实|实际已有消费者|薄方案的处理|
|---|---|---|
|谁有权提交、属于哪个session/epoch|unified-final-submit.service.ts的assertPrincipal、assertAttemptEpoch、admission及事务内复核|直接沿用；不靠client的B/F自证|
|同submission不能换core、必须对应冻结配置/runtime|同文件assertDefinitionHash、prepared payloadHash、assertSubmissionReplay和compiledRuntime复核|沿用；core已有引用也在实际payloadHash内，改变引用不能沿同submission静默替换|
|正确数量/顺序、响应值/输入/时钟与正式分母|enumeration/scorer.ts的seed重算plan、封套/阶段时钟/flags与技术缺失规则；schema.ts的范围/顺序|照原规则生成本次描述；不在服务器重建点位或光学曝光|
|是否有可追溯引用|已有calibrationReference/renderedStimulusReference字段、非null/有界检查及缺失技术排除|不新增core字段；空值保持原null与排除事实，不伪造补齐|
|完整校准/realm/点位是否确实属于这份已保存core|当前报告输入没有这些原件，也不能证明硬件事实|报告先保存；完整材料的归属、非空引用和core逐项对应在归档时核|

AuthoritativeScorerInput确实没有真实sessionId/epoch，但它不需要再次授权提交；外层已用真实child及admission做到。校准数值不参与本次数量正确率/偏差的算术。因此缺少这些字段不是新增FINAL header的理由。

引用的边界要说清：现有scorer只检查缺失，不检索或认证引用实体，也不拒绝“不同非空引用”。当前runner/端口按一份artifact运行；本地首次冻结保证它不被同epoch换掉，归档再核对实际非空引用。**本轮不悄悄新增跨trial引用不一致就拒交/隐藏指标的评分规则。** 若以后确有产品不变量要求这种新后果，应单列其接受行为/质量版本影响；不能当作本方案已存在的门禁。

## 三、完整原件怎样对应，不走报告热路径

1. 配方由既有发布/START的config完整冻结；profile、seed和真实业务身份仍取服务器既有事实。Calibration继续保存现有id/source及7个数值字段，来源保持自报；pageOrigin仍是原有timeOrigin/pageInstanceId/source，不加probe。
2. 首次练习reserve之前，本机在现有META身份事务中保存一份完整artifact及所属sessionId/attemptEpoch/definitionHash。这里的身份是宿主提供的既有FinalDraftMeta字段，不另造B/F或总版本。该epoch已冻结则只接受原artifact；换contextId、recipe/calibration或新realm不能清掉曝光marker。旧记录保留，重试不重曝。
3. core仍是原EnumerationTrial/Envelope：已有calibrationReference指向artifact.context.calibration.id，renderedStimulusReference指向已有artifactHash。无需第0条携带完整原件。完整配方、校准、pageOrigin、mask、点位、练习及既有frames留本机原件；报告不等待它们上传。
4. 报告保存后，专属enum归档分支复用raw-archive.service.ts现有真实session/epoch/submission/definition授权、rawSubmission及短事务/幂等引用机制。对照已保存config/seed、上传身份与artifact所属身份；对照已有artifact摘要及其完整配方/校准、每条record与其artifact；再逐项核完整formal.core和已保存FINAL的payload一致。**只核声明一致性和已有引用，不重生点位、不拟合时序、不计分。**
5. 非空引用错指/身份冲突/已有core不匹配时不确认归档，保留原件和重试状态；报告不改写、不重新评分。原本缺失的引用/原件缺失事实保留，不自动补数或把已存invalid原件伪装成完整表现。归档是否可确认依据实际缺失/对应状态明确表达，不以“报告已保存”冒充已归档。
6. 旧JSON摘要依赖原对象序列化顺序；归档适配须保留原artifact/record内容和原摘要语义，在任何会重排属性的schema转换之前核对它，不能规范化后换hash再声称同一原件。外层已有canonical/rawSha幂等校验继续沿用，无需为此建立新哈希层。实际实现时若某格式确须变化，另明确局部版本，不能预先全面升v2。

已有setInstrumentMetadata只是浅合并，不能直接宣称首次冻结已经实现；后续只需在同META事务复用assertFinalDraftWriteIdentity并完成“未冻/已冻原件不变”的写入。无需新IDB版本/store、DB迁移、队列或校准备案API。现有EnumerationPersistence.complete仍把完整序列和单一confirmed混在一起，后续native宿主按MOT已经确定的core/归档分态适配；不增加报告链路负担。

## 四、收缩后的版本判断

|实际层|本轮最小建议与原因|
|---|---|
|configVersion|0.2.0→0.3.0提案：null变完整Recipe是真实配置合同变化；保留status原语义，不为CONTENT_CANDIDATE审计标签多改字段|
|engineVersion|0.1.0→0.2.0提案：新的真实配置/宿主读取能力；现resolver只按testType/engine/scorer取定义，不能在同一旧tuple静默替换旧configVersion|
|scoringVersion|保留0.2.0：core字段/算术/有效分母/null/质量后果均不新增；旧代码对身份/config的硬编码需要按精确引擎/配置适配，不是借审计另升计分号|
|metric/quality/report/presentation|各保持原0.2.0/0.2.0/0.2.0/0.1.0；若实际实现改纳入、解释、指导语或界面，届时单列评估|
|protocol key/version、randomization|保留当前对象/字面值，不能只为数字看齐engine而改签名；实际阶段、输入、几何与时序政策不变|
|profileDefinitionVersion|当前资源层随configVersion派生，若按现规则接新配置则为0.3.0；不是新增字段|
|Artifact/Record/摘要|保留原格式与算法；只有实际结构/语义变化才考虑局部升版，旧不重写|

这些是待独审的候选分配，未修改任何常量。新config字段为对象后，现enumerationPlan、display.validateEnumerationContext及report投影的逐字段===比较不能照搬：须正确按冻结内容读取，而不是把对象引用相等当内容相等。此适配不改变数量/滑杆随机流或报告算术，也不能把新记录伪装成旧tuple调用旧scorer。旧/新定义及资源版本事实仍须精确区分。

## 五、比上一案少动哪些文件

- 不动全局unified-final-submit.service.ts、unified-raw-submission.ts或AuthoritativeScorerInput，不新增presentation-binding helper、core header或B/F生成器。
- 必要的内容适配仍在enumeration的protocol/schema/package/scorer身份读取/report配置读取及前端display/persistence；绘制capture与CSS不因追溯而改。scorer身份/config适配不得追加质量规则。
- 本地只补FinalDraftStore现有身份事务的首次不变写入；专属完整原件核对放raw-archive.service.ts的enum分支，发生于报告保存之后。
- seed、delivery、native runner注册/真实旅程仍属后续接线，当前不实施。原配方文件/批准图、MOT结论和各项NOTRUN不变。

本轮只读比较、最小文档差异；未运行任务/测试/浏览器/采样/COS/CI，未操作PR356或生产。选薄方案的代价是报告时不承诺完整原件已验证或已归档；它不损失既有本次描述性反馈的算术或业务归属保障。