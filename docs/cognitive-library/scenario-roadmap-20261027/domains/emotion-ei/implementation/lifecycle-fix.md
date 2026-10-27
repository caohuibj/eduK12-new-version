# 宿主销毁与在途回执边界修订

基于原候选 `ea430728fed7e68a6723ca9059d69560ea9ad4ec`。本修订只改前端 `voice-emotion-cues/session.ts`，新增独立生命周期断言和本目录证据；不改原提交、协议、次数、已批图、素材、scorer、报告文案或共享平台。仍未DOT复核、未接入。

DOT实读指出：原dispose先调用用户stop，导致正在等待的本机保存返回后继续进入finalize；已发FINAL的迟到结果也可能把旧session恢复为report/retry。本轮用四个独立边界断言实际复现为0PASS/4FAIL，原JSON、命令/exit/stdout/stderr完整保留在 `lifecycle-reproduction.*`。

修订后的dispose先永久关闭本次呈现与FINAL权限，独立于用户主动结束。若仍有活动capture，将其封成disposed中断原件，只经构造时绑定的原本机raw端口尝试一次保存；若本机写入已在途，不重复调用。晚到的有效本机ACK可以保留原件，但不推进试次、恢复界面或新发FINAL。保存失败不冒称成功，也不在销毁后自动重试。

finalize入口和await之后均检查disposed；已经发出的FINAL没有被撤销或伪称取消，远端实际结果仍取决于原调用，但其迟到成功/失败不写旧receipt、恢复旧界面或触发changed回调。prepare的迟到回执也不能把已销毁session恢复为ready/blocked。用户主动stop保留原有收尾语义。React StrictMode的现有microtask销毁区分保持原样，未修改React组件。

必要断言仅在新 `lifecycle.test.tsx`：

1. 活动正式capture销毁：原端口收到一次中断原件；重入dispose/stop/begin/retry不重复保存；替换后的端口零调用；原ACK回来不新发FINAL；同步界面观察回调触发销毁时，端口调用前也再次拒绝新FINAL。
2. 实际React候选在正式raw保存pending时卸载：已有原端口写入只一次，迟到ACK保留raw但finalize零调用；StrictMode包装保留。
3. 用户主动结束已发FINAL后销毁，迟到成功不恢复receipt/view/callback，原FINAL恰一次，不伪撤销。
4. 同上，迟到失败不恢复retry/view/callback，也不再发FINAL。

修复后 `lifecycle-fixed.json` 为4PASS/0FAIL。类型入口只选新增生命周期文件及其实际import闭包，结果见 `lifecycle-types-final.stdout.txt`；不是整应用类型检查。新增测试初次类型检查因四处Testing Library选择器多传`exact`选项而失败；去掉不支持的冗余选项后，仅复验同一React卸载用例（其余3项filtered）和类型入口，原失败类型诊断与4项原PASS保留。同步observer销毁分支仅续验第1项（1PASS/3filtered），见`lifecycle-observer-guard.json`。没有重复102素材核对、96次完整序列、原3项完整前端流程、候选编译或浏览器整组。实际原件保留于本目录，均为合成内存端口、合成媒体事件与未签名开发证据；不冒充产品API/DB/COS、耐久落盘、真实设备或科学效度验收。
