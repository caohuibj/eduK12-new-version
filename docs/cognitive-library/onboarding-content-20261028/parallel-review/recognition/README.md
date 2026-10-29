# 连续图像再认：真实分母与报告说明补齐

基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`，分支
`review/cog-recognition-20261028`。已读AGENTS/认知报告规则、现有入库队列与路线图、
recognition实现/native adapter/产品报告策略/教学版本记录，以及实际相关源码。
所有新Node执行使用 `/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`
（下称 `NODE`），实际v24.21.0，未安装依赖。

## 确认的身份与本轮实际补全

实际ID为 **continuous-recognition**，不是emotionrecognition。
当前教学候选 engine0.2.0/scorer0.2.0/config0.3.0，protocol
`continuous-recognition/0.2.0/0.2.0`；report0.2.0、presentation1.0.0。
旧native engine0.1.0/scorer0.2.0/config0.2.0按精确身份保留。

现有后端、standalone、练习和计分已经实现，不重新造一套。明确的可独立修复缺口是
`RecognitionReport.tsx`主句和标签笼统称“重复图片识别率 / repeated pictures”，
但分母实际只含完整目标配对20/60，并不含另列的警觉重复6/16。

本轮把主句/标签中英明确为“纳入计分的目标重复图片”，在同一报告详情说明：填充图
及其短间隔重复另行记录，不进入这两个比例分母；练习另计。保留识别率、误认率和
有符号差值原值。仅修改该报告及2个对应测试中的文本断言；没有修改scorer、生成器、
刺激、布局、时序、数量、输入、版本、素材权利或public gate。

## 少量真实capture核算

`audit.ts`使用当前guided快照、真实RecognitionCapture和scoreGuidedRecognition。
只有逻辑ID，绑定明确为 **synthetic-review-only**；没有图像字节、URL、授权声明或
安装。seed `recognition-independent-20261028`下第3个目标重复在前缀第32次，故只取
这段，不运行100/260完整流程。

| 代表记录 | HR与FAR共同分母 | 命中 / 首次误认 | HR / FAR / 差值 |
| --- | --- | --- | --- |
| 3个完整目标配对 | 3 | 1 / 3 | 1/3 / 1 / **−2/3** |
| 最后目标重复中途停止 | 2 | 1 / 2 | 1/2 / 1 / **−1/2** |

首个有效回应保留；每个目标首次出现再按、held-repeat与额外点击分别留原事件，
不会增加命中。第一个目标重复在ISI中回应，仍归该图。最后重复中断后，整对同时
退出两个分母，不只从HR删去。内部负差值不裁0。

```text
目标首次图完整 + 对应目标重复图完整 → 同一有效配对分母
                          任一成员中断 → 整对同时退出HR、FAR
填充首次 / 填充短间隔重复 / 练习       → 各自单列，不混入上述分母
```

两份前缀都不完整且素材仅合成，真实public投影均limited，表现与公开分母保持null。
空记录invalid、null；没有用内部可算值绕过gate。另核对一个粗时钟边界：回应和中断
同刻时，事件保留在allEvents sidecar，半开封套不把它归给未呈现的后继图，并标记
技术排除。完整原件、封套、配对、计分与投影在 `representative-records.json`。

## 真实命令、退出和可读材料

1. 根目录：`NODE server-version/backend/node_modules/tsx/dist/cli.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/recognition/audit.ts`。
   退出0；两种配对核算、repeat/extra/ISI归属与边界原件通过，stdout为
   `representative-run.log`。
2. `server-version/frontend`：`NODE node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/continuous-recognition/product-policy.test.tsx -t 'renders HR/FAR/CRR|limited/invalid' --maxWorkers=1 --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/recognition/report-copy.json`。
   退出0，仅受影响2病例通过；中英目标分母文字、负20个百分点及limited隐藏保留。
3. 同目录：`NODE node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/continuous-recognition/guided-practice.test.tsx -t 'uses the new practical label' --maxWorkers=1 --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/recognition/guided-report-copy.json`。
   退出0，仅该报告消费者1病例通过；其余练习/完整流程过滤、未重复。
4. 根目录：`NODE docs/cognitive-library/onboarding-content-20261028/parallel-review/recognition/report-types.cjs`。
   退出0，59份实际app类型闭包源码零诊断，摘要在 `report-types.json`。
5. 根目录：`NODE docs/cognitive-library/onboarding-content-20261028/parallel-review/recognition/report-preview.cjs`。
   退出0，实际组件4份静态预览：[负差值中文](report-negative-zh.html)、
   [负差值英文](report-negative-en.html)、[受限中文](report-limited-zh.html)、
   [无效英文](report-invalid-en.html)。合成展示例明确标记无真实素材授权，前两份
   来自既有报告测试形状，后两份为本轮真实public投影。不是新浏览器/设备/素材验收。

本轮没有执行失败。文字歧义由实际metric/paired scorer及原报告主句对照确定，
不为文案修订人为制造计分失败。`reuse-inputs.json`保留原件摘要及仍未改的source
哈希；现有正式全流程、练习失败先重呈完整说明、同组不重曝和同摘要保存重试复用。
其中7份核心源码与原教学记录一致；说明页与更早教学哈希不同，是已存在的“怎样算
完成/保存确认”追加段落，当前字节匹配较新的batch-2 instruction-review原件，未把
这个差异隐去或说成旧哈希一致。
旧native-adapter文档的ResearchReview门禁是历史策略；当前产品0.2策略按源码处理，
不新增科研复核阻断，也不让客户端ResearchReview提供授权。

## 真实未完成项，不混称“已入库”

| 项目 | 当前事实 / 最小下一步 |
| --- | --- |
| 可执行后端与standalone | 已有；本轮已读实际capture/session/scorer及原检查 |
| 真实素材 | 科研184张正式唯一图＋6张独立练习；实用74＋6。仍需真实ID、SHA256、URL、正方形尺寸及来源/权利证据清单。没有下载网络图片或伪造authorized |
| Native宿主 | 主注册中尚无本工具frontend runner；需要沿既有RecognitionContext、耐久prepare/persist/finalize与真实session/epoch映射接线，不能把当前合同当作已接入 |
| 原件归档 | 需要该工具专属CapturedRecord/note/封套与核心的身份校验适配；当前shared native-content archive的其他工具分支不自动覆盖再认 |
| 冻结配置与安装 | 有合法逻辑schema/快照工厂不等于有实际素材配置。暂无已核素材seed/隔离安装或正式发布；应绑定真实素材后由主代理处理 |
| 四入口与生产 | 未激活、未部署；没有扩大public/composite权限 |

中英启动说明已有4个具体例子、练习每轮8次/至少7次/最多3轮、失败先重呈、
正式100/260次数/时序与完成保存说明，本轮未改。报告没有take-home图或下载授权，
`canGenerateTakeHomeImage=false`保持，未擅自新增。

本轮没有denied/uncertain操作；素材池和宿主/归档/安装属于既有pending项，上表已
精确列出。本轮未push、CI、Ready、merge、部署、schema、凭据或安全设置变化，
未修改共享core/主注册/归档、量表及其他设计对话。
