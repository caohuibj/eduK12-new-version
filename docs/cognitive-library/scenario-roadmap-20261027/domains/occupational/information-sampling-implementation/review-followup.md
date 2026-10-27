# DOT定向复核收尾：教学语言与报告文字

基线：f0944d630751f68186a0ea14d45fbf1f3135e349。只修DOT实读后提出的语言/报告两项及随后追加的StrictMode缺口；仍未DOT放行、未接入，不动共享分支/PR360。

## 1. 准备时固定真实语言，原件与FINAL沿同一身份追溯

IstContext必填language=zh/en；缺失或未知直接拒绝，不猜中文。IstTask默认取冻结context.language；显式UI语言不一致或准备后切换语言会阻止曝光，不用当前浏览器语言替代教学事实。prepareLocalAttempt收到完整语言/context、计划与realm，其原有bindingDigest覆盖语言。

Session克隆准备快照并保存contextDigest。practice/test/quiz各条原件及FINAL声明均携language/contextDigest，参与recordDigest/finalPayloadDigest；之后可以从同一contextKey+contextDigest追到实际准备内容。调用方更改原context不会改写session克隆；错误语言的准备回执不能通过。语言不塞入共享原生trial/schema，不加服务器字段、COS机制、设备探测或逐帧日志；真实耐久端口仍待平台接入。

新增断言只走两易练习/理解题后的一局正式判断即中断，检查语言覆盖prepare、四条原件、FINAL及摘要，不重跑10轮完整旅程。另检查英语context默认英语UI、初始及后续显式语言不匹配时不曝光。现有content.test.tsx仅补language:zh以符合必填类型，本轮未执行其旧旅程。

## 2. 首屏从本次真实公开事实生成普通中英描述

新呈现版在三态白名单公开数据上生成一两句话。例如新增合成断言中的均值9格/7格，生成：

> 这次，在递减奖励下，你作出判断前平均比固定奖励少揭了2格。
>
> In this session, you opened an average of 2 fewer tiles before deciding under the decreasing rule than under the fixed rule.

随后用普通句子交代两边实际判断数和平均揭格。多、少、相同与真实0都按数据写，不评价优劣；缺另一规则记录只说明暂不比较，不补0能力。首屏计数改为“你已作出几局判断/其中选对几局”；“有符号/条件覆盖/差值”的专业解释移入折叠详情。正文、小图、JSON下载都沿isIstReport及三态，invalid没有新表现叙述/图/下载。

## 3. StrictMode replay与真正卸载分开

IstTask挂载effect用lifecycle generation标记本次setup；cleanup立即停止UI回调并取消尚未开始的rAF，将session dispose放入microtask。StrictMode立刻重放setup时generation已更新，原cleanup不会永久dispose仍挂载的session；真实卸载没有后续setup，microtask会停止capture并经构造时绑定的原context端口保留未完成原件。context/ports/language变更仍即时走既有失效路径，不能切用新context端口。

只新增1个必要目标：StrictMode下prepare一次、成功进入实际25格棋盘、真正卸载保存1条interrupted/null判断原件、不产生正式报告；随后以另一个合成fixture核context替换只调用原端口，真正卸载不重复保存。没有改HF/SART/共享文件，也没重跑旧全组；采用同类generation+microtask思路独立适配本session，不声称重新读取外节点SART源码。

## 版本与历史

engine/scorer/protocol/metric/quality/参数解释/reportDefinition保持0.1.0；当前config与presentation明确递增0.1.1，configHash重新冻结。只接受精确组合：旧0.1.0/0.1.0可只读保留原布局，不生成新叙述；新0.1.1/0.1.1才使用新叙述，混搭拒绝。Session最终回执必须匹配本次冻结configVersion/presentationVersion，不能把带当前hash的旧呈现冒充新版本。没有用当前scorer重算旧报告；旧科研示例原件与所有f094检查文件保持原字节。

## 本轮证据

- review-followup-first.json：第一次使用了错误工作目录，测试文件未写入；0用例执行、命令失败，不计通过。
- review-followup-executed.json：新增3目标实际执行，语言两项PASS，报告目标FAIL；失败在旧报告夹具经jsdom转为非file URL后交给fs读取，保留原失败。
- review-followup-continuation.json：改用明确本地夹具路径，只续验报告目标，1PASS/2filtered。
- review-followup-version-final.json：补强当前回执不得接纳旧呈现后，仅续验受影响的语言FINAL和报告目标，2PASS/1filtered。英语UI一致性目标未变，不重复执行。
- review-followup-types-current.json保留版本收尾时后端3入口/48源码及前端3入口/54源码零诊断；StrictMode后的必要前端4入口/55源码见review-followup-types-final.json，仍零诊断；旧fixture只做必要类型检查，不跑旧测试。
- review-followup-lint.json：8个变化/新增前端文件；追加StrictMode后只定向核Task和新增case，见strictmode-lifecycle-lint.json首次有1条cleanup ref警告，原件保留；回调组织后仅核Task，strictmode-lifecycle-lint-final.json为0error/0warning；protocol/report纯副本仍逐字节一致。
- strictmode-lifecycle-first.json：追加的1个StrictMode生命周期目标首轮PASS；整理cleanup回调以消除lint警告后，仅该目标复核PASS（strictmode-lifecycle-final.json），不累加目标数。

新目标总计4（语言/报告3＋StrictMode1），不能把各轮次数累加成新用例数。都是本云节点Node24.21.0、软件时钟、jsdom和合成端口；不是正式CI、真实设备/耐久存储/API/DB/COS或产品接入资格。完整来源hash、命令/退出及旧原件保留检查见review-followup-validation.json；本轮不重复应用构建、旧任务或全部旅程。
