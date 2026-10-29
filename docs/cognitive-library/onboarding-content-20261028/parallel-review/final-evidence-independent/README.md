# 本轮最终证据复用核对

只读 root `/workspace/eduK12-new-version`，不运行测试、计分、DB、浏览器或整库检查。
快照绑定 HEAD **`d8d5d136c44cc2bb186ac6d67b1fc1cab0cda3ac`**（采样时root干净）；完整路径、
SHA256、原证据引用和 `git status` 在 [source-evidence-snapshot.json](source-evidence-snapshot.json)。
[snapshot.py](snapshot.py)仅读取 git 元数据和文件字节；实际执行 `python3 .../snapshot.py`
退出0。该文件记录的是快照，不是后续 root 提交的自动认证。

结论：未发现要求重跑旧工具全套的新源码漂移支点。76个本轮变化源码中45个产品文件均
可对上现有证据记录的当前SHA；另外225个未变工具源码引用、45份旧原输入/原结果文件
引用全部一致。**哈希相等只支持输入复用，类型闭包相等不替代运行用例。** 下表按各
运行目标引用实际记录，未把过滤项相加成末次整套通过。

## 逐工具覆盖

证据路径均相对于 root 的 `docs/cognitive-library/onboarding-content-20261028/parallel-review/`。
每份表内JSON及其引用的原始文件SHA在快照内；不是只依赖README的PASS文字。

| 工具 | 本轮实际源码变化与覆盖 | 保留的边界 |
| --- | --- | --- |
| 气球努力 | a67后工具源码无变化；`effort/reuse-inputs.json`匹配控制/计分/公开呈现；`representative-records.json`六例、`native-report.json`覆盖三态消费者。 | 没有为交付强造新修复；自由选择不按高收益判正确。 |
| Horizon | a67后工具源码无变化；`horizon/presentation-reuse.json`、`historical-input-comparison.json`区分历史版本变化；`audit-receipt.json`四组核算。呈现版本拒绝已有独立修后记录。 | 历史suite保留原身份；偏好不是正确答案。 |
| 空间记忆 | a67后工具源码无变化；`spatial/execution-inputs.json`、`presentation-inputs.json`及类型记录可对上当前值；首响应两反例、quantity三态与中英阅读分别留证据。 | 早期Node24.19记录仍是历史结果；后续合规Node检查沿batch-3原件引用，不重标环境。 |
| GradCPT | `GradReport`输入行口径：`gradcpt/input-copy-corrected.json`只新增1项通过/2过滤，真实capture保持输入2、settled1、山景分母0；原计分/归属源码不变。新wire：`grad-transport/wire-execution.json`绑定本工具源码；后端4例、BOM专项修后1例/3过滤、前端3例、真实Chrome字节还原各有独立结果。 | 不能把小prefix计分与packer通过说成科研所有原件无条件可保存；见下方新DB链路及8MiB边界。 |
| 视觉搜索 | scorer eligibility与中英报告变化；`visual-search/execution-inputs.json`当前哈希匹配。原4例修后4通过；追加混合只3项/4过滤；2阅读用例；7条capture分母/零/null独立核算。 | 注入timeout等是受影响envelope反例，未改变正常无deadline规则；旧36轮不重跑。 |
| 注意瞬脱 | backend `analysis.ts`与生成副本绑定实际键盘动作；`attentional-blink/input-review-corrected.json`3通过，`frontend-review.json`3通过/2过滤。`reuse-inputs.json`保留原时序/公式及具体首答分母证据。 | 物理code优先、e.key fallback与聚焦按钮路径保持；没有新输入方案。 |
| 双箭头 | session/Task/完整说明变化；`dual-arrow/practice-fixed.json`原两目标2通过，后续`practice-boundaries.json`2通过/1过滤。`execution-receipt.json`与最终direct-types绑定实际输入；六类计分及教学预览单独保存。 | active结束/pagehide/身份改变仍停止；没有把未闭合窗口补成错误或复播同组。 |
| 心与花 | protocol键盘token与生成副本变化：`hearts-flowers/keyboard-fixed.json`3通过，`keyboard-ui.json`2通过；type-only修订有`ui-type-reuse-proof.json`。共享termination变更由下方真实32条链路覆盖。 | 旧专属README的pending是当时状态；不得继续代表当前集成状态。 |
| ANT guided | scorer冻结binding与专属已存报告消费者变化：`ant/presentation-binding-after.json`6通过、`report-binding-after.json`9通过；`attempt-marker.json`1项只核真实port/storage fixture重开拒绝。`execution-inputs.json`绑定源与旧48条原件SHA。 | 原48+8、物理几何批准及浏览器耐久结果复用；新marker不是再次真实刷新或物理计时。 |
| MOT | 只改`MotTask`启动中英文；`mot/reuse-inputs.json`证明intro外字节不变，`intro-render.json`与英文续验、4例核算保留。 | 2+9/45与旧native1.1.0/1.1.1未重建；共享termination兼容用例另列。 |
| Enumeration | protocol常量同值移出scorer、NativeRunner核冻结配置；`enumeration/frozen-config-after.json`5通过。Task/instructions中断与重呈：`incomplete-practice-after.json`2通过，后续wrong仅1/2过滤、既有中断仅1/16过滤。`execution-inputs.json`匹配当前源及不变协议签名。 | 错答无新增门槛；未完成按旧暂停策略结束，重呈说明不授予旧attempt重曝。 |
| 连续图像再认 | 仅`RecognitionReport`目标重复配对分母文案及对应断言；`recognition/report-copy.json`2通过/5过滤、guided续验1通过/5过滤，实际capture前缀/CRR负值/三态展示另存。 | 原素材/native/冻结安装缺口仍存在；不是仅差素材，也未新授素材权利。 |

## 共享消费者与本轮集成

- `307d94ae5` 的 termination→FINAL：`integration/frozen-completion-result.json`及后端
  `backend-completion-final.json`1条真实隔离链路，保留32个真实已闭合raw，aborted→limited，
  valid32不变；2兼容、2实际hook分别通过。规范hash、加密core、rawarchive声明一致性均有
  断言，旧无字段hash、旧MOT/Enum和已sealed重试保持。其它scorer未新增质量阈值。
- 本轮五个共享产品文件是 `native-content-port.ts`、registry的`archive-detail.ts`、
  `content-contract.ts`、`definitions.ts`及`export.service.ts`。工具wire已在`c4ea6d448`。
  这些共享文件已在`d8d5d136c`集成，当前字节都在快照中；已有类型闭包包含它们。
  异步冻结竞态证据在`7e7e49e62`的`docs/parallel-review/grad-freeze/`：原2通过/1失败，
  修后只续验竞争目标1通过/2过滤，另外seal后重试及跨epoch两个原通过目标输入不变复用。
  本核对未重复执行。`frontend-envelope-freeze-corrected.json`记录原正向1项通过；
  原始文件为缺wire模块导致的0项启动失败，不能把该原失败说成行为回归。
- root唯一新大件链路已出现：`grad-transport/backend-journey-original.json`1通过，
  `real-wire-result.json`绑定保存的research240原件 SHA
  `2c6ff2998506e1bcb10f2315720c84b723728b4405934538295468aceb0a4c7b`，raw canonical SHA
  `4b785da9e22fafafa9cf8a03dd4caa5736fc526295280b00a7d01a697cec0e3f`。
  实际旧提交3,668,003B被原限额拒绝；浏览器已生成wire含completion后284,415B，core保留
  相同wire，私有完整package 4,420,645B，报告interpretable/300图。测试还断言原件导出
  `T001_frames`逐值相等、没有`T001_data`，archive raw hash相同且result密文不改。
  这是保存合成原件的新FINAL/DB/PRIVATE存储消费者，不是300图新实机施测或COS重算。
- `getSession`仍读冻结snapshot；新export仅精确Grad版本tuple解码原字段，不调用scorer。
  没有发现实际旧消费者直接把wire当`GradRaw.frames`读取的遗漏。

## 需要纠正的文档状态

已先向root报告，未擅改root页面：

1. `batch-3/README.md`“留给root”仍写School/Teacher客户端“补archiveRaw”。这与
   `docs/parallel-review/entry-adapters/README.md`新7后端/5前端边界证据不一致。准确状态：
   School/Teacher当前使用Composite，尚无已批准native准入、本域原件端点、冻结运行事实及
   精确完成回执合同；客户端方法是后续一步。Survey还是独立proof/固定120题模板。不能
   移guard或借Training cookie补接；新证据也不是四入口登录成功证明。
2. `hearts-flowers/README.md`共享疏漏章节仍标pending；保留原历史反例，同时加已由
   `307d94ae5`和integration真实32条结果解决的链接即可，不需要重跑旧57/32。
3. 滚动`parallel-review/README.md`仍声明截至9704和三路在运行，应标历史快照并链接新收口。
   Gradtransport已由`d8d5d136c`追加root唯一大件链路收口，原实施者pending段保留历史身份。
4. Recognition在batch表的“素材未齐”是简写；下方及滚动表已明确native宿主、专属原件、
   素材冻结/选中安装同属pending。建议各摘要沿用完整限定，不能改成“仅需补素材”。
5. Grad应写“这份保存research240原件通过有界wire→DB→archive链路”，仍保留decoded8MiB、
   编码后大小和CompressionStream可用性边界。schema最大原件超过8MiB仍拒绝/保留，不丢帧；
   一份成功不构成科研所有设备/输入无条件完整保证。

没有因此制造新门槛或新检查。denied：无；uncertain：无；本项无待执行操作，正式发布/
CI/入口扩展保持原pending边界。后续root若改任何相关源码，应先比本快照，只刷新真正受影响的目标
及其证据引用，不能把这张表当成后续字节的永久PASS。
