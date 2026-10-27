# 延迟选择：已批准设计的独立内容候选

状态：**已实现，未DOT复核、未产品接入、未发布**。用户在本原线程明确“同意设计”，DOT确认继续原任务。设计基线8ff8b2022871d8af3efa2e63313f60bb47e6159e；[原图](../delay-choice-review.png)保留审批时原字节，图内“待图审”为历史设计标记，不覆盖用户后来批准。当前[简短介绍](../delay-choice-brief.md)及[科学／许可附录](../delay-choice-appendix.md)可一起读。

## 实际代码与冻结组合

后端内容目录`server-version/backend/src/modules/cognitive/content-candidates/delay-choice/`：protocol、纯capture、单项本地输入校验schema、权威scorer、白名单report、原生DRAFT package、18维metadata、全部内部指标隐藏的participant-presentation及NOTICE。前端目录`server-version/frontend/src/modules/cognitive/tasks/delay-choice/`：三个逐字节同步的纯generated文件、context/digest/ports契约、session、实际React任务与报告、完整中英教学、CSS及直接检查文件。没有修改共享schema、注册表或平台接口。

engine/scorer/config/profile/metric/quality/protocol/reportDefinition/presentation/parameterExplanation初版均0.1.0。随机化标识为`delay-fnv1a-utf16-xorshift32-block36-side-v1`。原生快照固定实际config与protocol的SHA256；本地prepare再固定语言zh/en、contextKey、seed、完整正式及练习manifest、realm及bindingDigest。练习／理解题／正式原件和FINAL都带language/contextDigest及recordDigest；UI语言、context或ports变更停用原session，用原端口保留原件。未知／混搭冻结配置明确拒绝；不重算旧报告。

72／36正式选择＝9金额倍率×4等待对×2／1重复，金额为整数百分之一点：基准2000，较晚2020/2100/2200/2300/2400/2500/2600/3000/3500。日期从今天起0→14、0→28、14→28、14→42。每个36题块包含全条件；research同条件两次较早卡左右各一次，experience只能整体左18／右18，不能声称单条件个人内均衡。seed计划预先生成，不根据偏好自适应；无真实付款、折扣参数、概率奖励、正确率或优选策略。

单题两卡等样式，日期／金额持续可见，无倒计时或默认值。首次有效完整pointer down/up、键盘Enter/Space down/up或辅助技术激活锁定选择；取消、不匹配释放、多接触、按住重复不会变成跨题答案。可显式跳过或结束。逐条只记有界输入事实与重复聚合，不做帧探测或设备预检。原件保留首答／跳过／选择前中断、软件起止时间及实际输入；不声称物理曝光时间。native scorer按同一冻结计划逐项重放，拒绝换题／换值／换序／伪造状态／负时钟或中断后的补造题。

正式保存本题后进入500ms过渡再显示下一题；科研版第36题之后可休息、手动继续。保存失败保留pending，同一原件／FINAL摘要重试，未匹配回执不能显示成功或报告。实际原件归档须另有真实回执；本候选没有实现DB/API/COS耐久端口，不把合成端口叫接通。

## 教学、练习、生命周期

正式和练习前完整易懂中英说明、金额／日期例子、假想不付款、首选锁定、输入、跳过及退出规则。2题练习为今天10／1周后12、1周后8／2周后10；任一偏好均可，不按高收益、速度或一致性过关。2题理解检查25点第14天及不实际付款。完成操作并理解全对才进入正式；失败或未完成重呈完整说明／例子，最多3组，未完成理解题原件也保留，不补正式记录。

StrictMode effect replay使用lifecycle generation＋microtask延后dispose，真实卸载仍经原context端口保存未完成原件；即时取消未开始的rAF。切后台／失焦／pagehide停止当前题或过渡；旧异步prepare／save／FINAL不对替换context曝光。没有更改已批准刺激、布局、关键时序或输入；初版直接实现已批准规则。

## 权威描述与公开三态

条件j晚选比例Lj/Vj，Vj是真实二选一总数；Vj=0为null，0次晚选／有分母为真实0。早选是合法0类选择，跳过／未答是null，不是答错或0能力。实际呈现、已答、早／晚、跳过、选择前中断、未呈现分开。跳过记录的rt是该跳过操作用时，不进入有效选择分母。

有符号差为：今天起第28天的晚选比例减第14天；从第14天起第42天减第28天。每一侧全部9个金额条件的计划选择完成后才给该比较，单位转为百分点；不裁负值、不混分母。全早或全晚仍是合法记录。

报告首屏是本次真实早晚次数的普通中英描述、实际分母、完整条件覆盖、建议和短限制；专业条件表与差值折叠。interpretable只表示冻结记录完整可核，非效度；limited只描述实际覆盖、抑制缺条件比较；invalid无表现正文／小图／下载。公开JSON逐字段白名单，内部observations、输入聚合、时钟、质量原因不外露。小图只有一张，可显示／收起，不自动弹出。没有耐心／自控／岗位分、0–100能力、常模、IQ、诊断或排名。

## 可直接读的真实原件与算例

- `research-synthetic-originals.json`、`experience-synthetic-originals.json`：实际纯capture→原生envelope→权威scorer→公开投影，完整72／36合成记录，非参与者数据。对应`*-public-report.json`和`*-public-summary.svg`。
- 合成完整体验版为18早／18晚，科研版为36早／36晚；预定两项差均约−22.22个百分点，保留原始双精度数。正负不表示优劣。
- `react-synthetic-originals.json`：实际React/jsdom完成误解理解题→完整重呈→再练→正确理解→一次正式键盘选择→一次跳过→结束，保留4练习＋2理解题＋2正式及同一FINAL。无伪API、真人或耐久存储声明。
- `replay-react-example.ts`从上述实际保留原件调用当前native scorer，生成`react-replayed-report.json`／`limited-public-summary.svg`；只重放2条记录制作待审报告，不重跑旅程。空记录三态投影见`invalid-public-projection.json`，正文／图片／下载均无表现内容。

重放命令（仓库根目录，使用已安装工具）：`/workspace/eduk12-cloud/tools/node_modules/node/bin/node server-version/backend/node_modules/tsx/dist/cli.mjs docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/delay-choice-implementation/replay-react-example.ts`。

## 定向检查原件与限制

仅本云节点Node24.21.0，软件时钟、jsdom及合成端口。独立目标共10项：backend5＋frontend5；不能将续验次数累加为新增用例数。

| 原件 | 实际结果／范围 |
| --- | --- |
| backend-first.json | 新候选5PASS：36条件／真实金额／输入重放／null与0／伪造拒绝／公开白名单 |
| frontend-first.json | 新候选首4目标PASS：StrictMode与原端口卸载、实际React教学／输入、保存重试、三态与异步替换 |
| backend-continuation.json | 仅补强练习round及非有限理解题时钟，1PASS／4filtered；不重跑完整72／36 |
| frontend-continuation.json | 仅受影响UI报告／prepare身份及新增三轮练习上限，3PASS／2filtered |
| types-first.json | 真实失败：backend测试跨rootDir导入前端capture；前端manifest参数遮蔽、matcher类型与Promise泛型问题 |
| types-final.json | 首次修复后backend3入口／49源码、frontend2入口／54源码零诊断；后续源码变动不把本文件冒称当前证据 |
| types-current.json | 最新必要类型，backend3入口／49源码、frontend2入口／54源码零诊断，源码hash绑定 |
| lint-first.json | 本项10个前端TS/TSX文件，0error／0warning |
| lint-continuation.json | 最后3个变化文件，0error／0warning，其余未变不重复 |

跨rootDir问题改为候选后端纯capture＋前端逐字节副本，没有放宽rootDir、tsconfig或断言；其余直接修类型。一次补强脚本误以frontend为cwd，FileNotFoundError、没有改文件，之后按仓库根目录执行；那次命令后独立lint成功不等于补强脚本成功。原失败类型、filtered结果均保留。初始静态设计的Chromium启动失败与后续渲染证据仍在设计包，不改写为运行器验收。

没有执行旧认知全组、应用构建、CI、真实设备、DB/API/COS、集中测试、发布或部署。信息采样31ace660候选及全部其他WIP保持原样。最终共享集成、PR360及产品入口由DOT在独立复核后统一协调。
