# GradCPT 合法结构大小专项

基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`；分支
`review/cog-grad-transport-20261028`。新执行使用独立Node24.21.0。

## 已确认的工程缺口

原FINAL把完整GradRaw放入唯一trial payload。真实归一化后canonical预算
1,572,864字节；全局JSON body上限2,097,152字节。research有300图及两张boundary，
每slot 800ms；高刷新率合法frame对象会超出这两个独立上限。

下表为结构合成记录的真实JSON字节，含一次城市按下/释放及正常provenance。
不是刷新率实测、物理时序或完整施测/计分：

| profile / Hz | frames | FINAL canonical | 超canonical限额 | HTTP JSON | 超HTTP限额 |
| --- | ---: | ---: | ---: | ---: | ---: |
| experience 60 | 4,897 | 331,155 | 未超 | 331,393 | 未超 |
| experience 120 | 9,793 | 626,362 | 未超 | 626,600 | 未超 |
| experience 144 | 11,833 | 760,242 | 未超 | 760,480 | 未超 |
| experience 240 | 19,585 | 1,218,867 | 未超 | 1,219,105 | 未超 |
| research 60 | 14,499 | 995,066 | 未超 | 995,304 | 未超 |
| research 120 | 28,994 | 1,887,830 | 314,966 | 1,888,068 | 未超 |
| research 144 | 35,033 | 2,287,088 | 714,224 | 2,287,326 | 190,174 |
| research 240 | 57,987 | 3,667,529 | 2,094,665 | 3,667,767 | 1,570,615 |

实际调用既有`assertCanonicalSubmissionPayloadSize`，三个超限research记录均产生
`SUBMISSION_PAYLOAD_TOO_LARGE`/413；无需运行scorer即可证明当前链路无法接收。
HTTP一栏是按实际POST字段序列化并与已读2MiB parser限制比较，没有发送HTTP请求。

## 原件与归档边界

[sizes.json](sizes.json)保存全部字节、差值、SHA256、配置和消费者源哈希；
[sizes.log](sizes.log)为原始stdout；[size-records.cjs](size-records.cjs)可重现。
`raw/`中保留八份完整合成archive的gzip文件与八份真实Capture短prefix。
gzip只是仓库证据封装，不冒充当前应用已支持该传输codec；解压后canonical JSON
字节、所有时间数值和frame条数均保持，SHA已核对。

真实GradCapture仅运行到第二次转场（约1.6秒），逐frame与独立合成的对应prefix
严格相等。全长只由冻结plan/现有转场与opacity公式构造，并通过gradRawSchema；
没有调用scoreGrad/reviewGrad、渲染300/100图片、走完整产品流程、HTTP/DB/COS或物理时序研究。
现有opacity本来按六位小数记录；本轮没有另外舍入任何时间或删帧。

归档detail包含原始完整frames、8次练习和formal/practice manifest。
research240Hz detail为4,122,593字节，低于8MiB；archive POST为octet-stream、独立
12MiB上限，不受全局application/json的2MiB parser处理。
server full package的authority.rawSubmission.payload还重复保存同一完整core，
故其严格下界为7,790,265字节。这里省略其他authority/result元数据，**不是完整
server package通过证明**；当前范围未见该普通刷新率下界超12MiB。

额外schema边界原件为120,000 frames＋8,192 events，GradRaw JSON为8,596,833字节，
单raw已超过8MiB归档detail预算208,225字节；两份raw之和已超过12MiB完整package
预算4,610,754字节，尚未加元数据。它是schema接纳的结构边界，非真实设备/完整
计分通过声明。后续decoded上限仍按原8MiB拒绝这一边界，不扩大限制或丢数据。

## 最小无损方案与复用能力

仅把frame对象改成`[atMs,slotIndex,opacity]`虽不改数值，但research240的canonical
仍为1,985,906字节，超过1.5MiB，因此tuple不够。仅HTTP gzip也不够：解析后的
原canonical仍会被业务预算拒绝。

现有`compact-field-codec.ts`的gzip/AES-GCM用于服务端存储，执行在FINAL大小校验
之后；`control-reference-codec.ts`只支持非答案控制引用。它们不能直接作为Grad
浏览器wire入口，也不能把服务端密钥带到客户端。

已向root给出并获准实施**Grad专属**新wire：exact kind/version/codec，canonical raw
UTF-8 gzip/base64，decodedLength与SHA256；只在本工具接受旧raw/newwire联合，
core保留wire参与原canonical预算，scorer wrapper有界解压后调用原scoreGrad公式。
压缩阈值1MiB，解压最多原8MiB；不支持压缩时小raw仍走旧路径，大raw保留待保存，
不丢帧、不重测。root负责generic port异步envelope及冻结同wire、registry/归档对比hook。

此规则合成corpus下research240的gzip＋base64提案为445,480字节，字节级回读一致；
这不是对所有可能时间戳/输入内容压缩率的保证。仍须检查编码后大小、decoded限额、
严格base64/gzip/JSON/schema/hash、同件重试与原件归档对齐。没有先改共享codec、
全局body限制、安全设置、schema或历史报告。本页后续追加实施证据，不把当前尺寸
结论冒称完整wire接线已经完成。

运行命令（实际退出0）：

```sh
/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node docs/cognitive-library/onboarding-content-20261028/parallel-review/grad-transport/size-records.cjs
```

无push、CI、Ready、合并、部署或新agent；HF提交仍保留于原分支。
