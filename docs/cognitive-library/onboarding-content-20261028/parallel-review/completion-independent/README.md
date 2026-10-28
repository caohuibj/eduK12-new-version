# termination→FINAL独立只读复核

结论：对精确提交 **307d94ae5e15ca134a694c1dad8158eb29b58b49**，未发现本次范围内
需要阻断的代码问题。审阅以root仓库Git对象为准；本分支只保存独立审阅材料，未修改
root树或共享源码，未重跑既有case。

## 心与花实际32条消费者

读取root已保存的 `integration/frozen-completion-result.json`及其指向的
`hearts-flowers/completion-claim-regression.json`，不是重跑scorer或读取COS：

| 项目 | 原件/已保存结果 |
| --- | --- |
| 输入raw | 32条，全部status=complete |
| 已提交核心条数 / claim.formalCount | 32 / 32 |
| 终止声明 | aborted；window-blur-after-final-record |
| 结果received / valid | 32 / 32 |
| quality及公开报告外层/内层 | limited / limited / limited |
| 键盘switch−repeat | +400ms |
| 触控switch−repeat | −400ms |
| 其余未观察输入差值 | null |

因此本次修复确实覆盖“实际最后窗口均已闭合，随后终止”的情况。它没有把第32条
删掉或补成答错，原32条有效结果和有符号差值保留；终止状态单独降低解释状态。
冻结coreHash为 `b65b3551304cff4e25138fdaa9411ef810ba1305c70142ebe8dc3dff7b8eb649`，
trialsHash为 `601d9030312f5cd4dd8e9fd829e06e515f6e60983018c4b1dc3d31806b50974a`。

## 已核对的完整绑定

1. 前端 `core/native-completion.ts:4` 仅识别既有
   COGNITIVE_NATIVE_CONTENT_V1包，读取其封存claim，并先核对完整claim body摘要。
   `useCognitiveSession.ts:495`在首次sealForSubmission的builder里从该本机原件提取，
   不从当前UI或后来的archive响应推导termination。
2. 后端 `native-completion.ts:31`核对contextKey对应session/epoch/configHash，
   config/protocol、seed重建的manifestHash及实际trialCount；completed另要求无原因
   且达到该冻结definition的maxTrials。旧非UNIFIED路径收到新增字段会明确拒绝。
3. `unified-final-submit.service.ts:280`验证后的nativeCompletion进入canonical
   payload，与trials一同生成submission hash；`:460`把同一个结构存入加密核心原件。
   再次提交不同终止声明不能保持相同payloadHash而静默当作同一提交重放。
4. `v2/authoritative-scorer.ts:90`的首参仍只有原4字段。termination通过可选第二参
   传给scorer，避免破坏strict invocation schema。`hearts-flowers/scorer.ts:22`
   使用已存在的第二参接口：aborted令interrupted=true、quality=limited，实际已计入
   的32条分母和结果保持。其他一参scorer自然忽略第二参，本次没有替它们新增质量gate。
5. 归档先沿既有 `archive-detail.ts`验证manifest、完整claim body摘要、逐条摘要、
   记录身份与已提交core payload一致，再在 `raw-archive.service.ts:196`调用
   assertArchivedNativeCompletion。该函数比较claim的结束声明投影（含完整claim的
   finalPayloadDigest）与已提交core completion的canonical hash。
   core中承诺的完整claim摘要因而同时绑定记录摘要、practice计数及grad等工具的
   特定claim字段；后续更换任一部分须通过原完整claim校验和新增core承诺比对。
   归档不调用scorer，不从COS回算，拒绝错误claim发生在storeAsset之前。

```text
本机sealed claim → 首次FINAL封存payload → canonical提交hash
                                      ├→ HF第二参aborted → 冻结limited报告
                                      └→ 加密core.nativeCompletion
完整原件claim/recordDigests校验 ──────────┘ 比对同一承诺 → PRIVATE归档
```

这里保证新带字段提交中同一声明进入core/hash/archive。practice或完整recordDigests
的逐项真实性仍由原archive-detail校验完成，FINAL不会凭一个客户端摘要证明图片曝光。
既有报告只回读冻结对象；该修复没有重写历史无字段报告。

## 旧版本和重试兼容

- 无字段的旧请求：对象构造使用条件spread，仍为原 `{trials}` 或
  `{trials, administrationProvenance}`；不会插入null或空completion。
  unified-raw schema新增optional字段，返回对象也只在存在时添加，旧形状/hash保持。
- 已sealed重试：Memory实现 `finalDraftStore.ts:644`、IndexedDB实现`:1003`均在
  调用builder前直接返回原sealedSubmission.payload。升级后不会给已封存旧payload
  补字段、换hash或重放刺激；新payload重试也复用第一次封存内容。
- 旧MOT的 `{schemaVersion,formal,practice}`及Enumeration专属kind不匹配extractor，
  返回undefined；服务端新增结束声明比对只位于isContent分支，旧解析器未替换。
- Public FINAL schema显式omit新增字段；authenticated optional声明没有扩展到
  public/access-token/composite权限。原身份、epoch和归档guard继续执行。
- 无nativeCompletion的旧core归档按既有规则兼容；不会因这次新增字段让旧冻结
  claim突然变成必填，旧报告继续保持其历史解释语义。

## 原始证据核对与执行边界

读取并索引以下root原件，SHA256及具体case状态均在 `review-receipt.json`：

- backend-completion-original：真实失败 `child is not defined`，prepareRuntime误用
  变量名；最终源码已使用session。没有把首错说成测试通过。
- backend-completion-corrected：复用隔离DB时配置唯一约束失败；
  backend-completion-fixture-corrected：再次PUBLISHED→PUBLISHED失败。最终fixture
  复用既有配置，仅DRAFT才publish，未降低产品约束。
- backend-completion-final：隔离PG该1病例通过，32条aborted→limited、新hash/core
  completion、错误归档claim拒绝、正确PRIVATE加密归档、resultSnapshot不变。
  uploader明确为fake，未访问真实外部COS。
- frontend-completion-original：2病例通过；真实hook提交封存claim并在ACK失败后
  重试完全相同payload，以及旧格式/改动claim拒绝。API及耐久检查为测试替身，
  不冒称真实IndexedDB/HTTP全旅程。
- backend-compatibility：2病例通过；旧payload字节形状及canonical身份保持，
  authenticated optional与public schema边界保持。已sealed旧重试另按上面两份
  实际store实现静态核对，未虚构该场景的新运行测试。

唯一新执行为Node24.21的Git/JSON只读汇总：
`NODE docs/cognitive-library/onboarding-content-20261028/parallel-review/completion-independent/review-receipt.cjs`，
退出0，14份源码及已有证据绑定精确307d94ae5。初次inline汇总误把frozen.input路径
当内嵌trials，TypeError退出1，未写receipt；已改为读取该提交中的引用原件，记录在
preparationHistory。这不是产品或测试失败。

没有新增测试、DB访问、browser、scorer、archive上传或CI执行；没有shared源码改动、
push、Ready、merge、部署或新安全/权限设置。无denied/pending/uncertain操作。
