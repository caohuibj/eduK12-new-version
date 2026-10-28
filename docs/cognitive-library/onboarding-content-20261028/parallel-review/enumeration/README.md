# Enumeration recipe native 0.2.0独立审查

起点 `a67f425269283d8281379fdf8234f9fd6b0acebc`，分支 `review/cog-enumeration-20261028`。实际tuple为engine0.2.0/scorer0.2.0/config0.3.0；旧engine0.1.0/scorer0.2.0/config0.2.0保持。已读既有component/capture、artifact/recipe生成、exposure reservation/persistence/native port、scorer/schema/public report/native runner、epoch关联及旧产品/数据库/加密原件证据。未改共享core、registry、archive或schema。

## 曝光前核对冻结内容及摘要

原 `nativeEnumerationConfig` 只比较客户端声称的configHash与definitionHash、protocol.key，没有重算内容摘要，也不检查协议其他内容。错config摘要被外层重复、错protocol摘要、同key改phases（包括重算摘要）都能通过该专属入口，直到后端拒绝FINAL。

修复复用已有 `nativeContentSnapshot` 核真实配置/protocol摘要与epoch身份，并检查协议内容等于同源常量。已冻结的ENUMERATION_PROTOCOL原值从scorer移至本工具pure protocol，由已有专属generator下发；scorer原名重导出保留调用合同。不复制一份新协议，不改变任何JSON值、旧opaque key或版本。

协议签名仍为 `2270d03dda92065ee3f408fd420d65151c25c59812df8d6d1e74a95de589f6b2`。探针对照旧 `legacy-descriptors-and-snapshots.json`，协议JSON完全一致，旧research/experience configHash均不变。配方、mask、点位算法、时序和100/25正式/3练习数量未改。

全部新命令使用 `/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`，不安装依赖或修改lock。前端cwd下：

```
node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/enumeration/native-frozen-config.test.ts --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/enumeration/frozen-config-before.json
```

原退出1，1正常通过/4反例失败；修复后同输入改outputFile为 `frozen-config-after.json`，退出0、5通过。原JSON/合并stdout-stderr/exit分别保存在 `frozen-config-{before,after}.*`。

旧native-port测试用'a'/'b'重复64次作为可接受的正常摘要，不能继续表示正常冻结输入。只将该唯一identity fixture换成真实canonical摘要；定向运行同文件 `-t 'native identity'`，退出0、1通过/8过滤，原件 `old-identity-fixture.*`。未重跑其他native port和3+25流程。

根目录生成命令 `server-version/scripts/cognitive/enumeration-content.cjs`（指定Node）退出0；`projection-generate.*`保留实际摘要。报告投影正文未改，scorer计分正文不变，只转移/重导出协议常量。

## 六条capture代表原件

根目录指定Node运行：

```
--import ./server-version/backend/node_modules/tsx/dist/loader.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/enumeration/representative-records.ts
```

首轮退出1：历史fixture相对路径多一个`../`，未写结果JSON；原错误/退出保存在 `representative-records-original.*`。修正路径后退出0，完整artifact/固定mask/校准来源、原record、core envelope、score和public report在 `representative-records.json`。这仅是6条合成软件时钟前缀，**没有完成25正式或真实测量**。

| 点数 | observed／expected | correct／included | 有符号平均偏差 | 操作时长中位数 |
| --- | --- | --- | --- | --- |
| 5 | 2/5 | 0/1 | −1 | 100ms |
| 6 | 1/5 | 0/1 | +2 | 200ms |
| 7 | 1/5 | 1/1 | 0 | 300ms |
| 8 | 1/5 | 0/0 | null | null |
| 9 | 1/5 | 1/1 | 0 | 0ms |

预先指定的6条target为9/5/6/5/8/7：第0条正确且操作0ms；第1条少报1；第2条多报2；第3条mask中断；第4条延迟回调只进入stimulus后中断，没有补造mask/response；第5条实际曝光67ms照实保留并正常纳入，不加50ms或一帧偏差门禁。重复confirm/change均不能覆盖首次确认的原record，摘要保持。原始responseValue=null不补0或slider初值。

总体received6/included4/excluded2/correct2，accuracy=.5、signedMeanError=.25、meanAbsoluteError=.75、操作中位150ms。每个点数的分母、偏差、真0及null逐项独立断言；公开投影limited，headline2/4，空记录invalid且summary=null。操作时间含滑杆/确认，不称为感知速度。保留1–15整数范围，没有response=0的伪作答、常模或能力分。

## 复用与范围

既有3+25实际组件、真实IndexedDB、HTTP/唯一FINAL/报告、归档503保留/200才清理、PostgreSQL加密原JSON顺序读回证据按原身份复用。旧目录中的历史“内部关闭报告”说明以随后已有0.2描述性政策为准，本节点不新增科学门禁。

首响应、mask/实际客户端呈现、数字确认、epoch/context及完整原件消费者已独立读过；capture/display/persistence/native-port原件格式和哈希方案未变。报告只走既有白名单public projector，三态保持，未新增图表/下载或直接展示research map。

无CI/Ready/push/merge/deploy、数据库或安全设置动作。正式库状态/运行资格/最终独立审核由root处理；无本地denied/pending/uncertain阻塞。
