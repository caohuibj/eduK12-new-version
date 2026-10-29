# 点数判断原生前端候选

本阶段接新tuple `enumeration/engine0.2.0/scoring0.2.0/config0.3.0`，仍用原opaque protocol key `enumeration/0.1.0/0.1.0`。仅登录后的独立/课程直达；读取主线`nativeEnumerationDraftKey(sessionId,epoch)`及实际META，不创建/猜测submission，不扩public/Survey/Training composite。

META原子freeze只新增created回执，旧值不改；每次reserve/record用现有expectedIdentity CAS。首次预约created才允许曝光，重复/换realm/结束不重曝。原件/record v1与原JSON插入顺序摘要不变，无B/F或额外校准摘要。source/id/校准/realm/点位/frames仅在原件，core/FINAL无新header。

5cm实体尺＋明确自报距离／复选确认沿用已批准交互，按enum5°计算fit，不自动缩小、不套MOT100–2000范围，不默认已校准。当前实际入口default zh；candidate English不等于产品英文已接通。未证明真机/实体测量或物理时序。

完整raw只封存`{schemaVersion:1,artifact,formal:[{record,recordHash}],practice:[...]}`，先于末次core本地ACK；core真实成功后由外层读取已冻结报告，不让candidate渲染无result占位，也不把complete.confirmed当COS成功。原件保留到既有真实匹配归档确认。部分/中断仅保留原记录、明确未完成，不自动补trial或提交partial。readiness为restart-required，跨realm不续曝；全部formal本地ACK后可走既有原包提交分支。

修复一个直接丢原件窗口：EnumerationPersistence.save原先微任务才调用port.retain，capture已结束又立即卸载时可能先alive失败。现在在save同步入口交原件给host，之后异步确认；dispose仍阻止旧core/FINAL继续。新病例证明同turn dispose后原件仍可读，不继续旧core callback。

新增9项合同PASS（首7＋pending未耐久不confirm1＋立即dispose保留1），各次实际类型闭包0诊断；仅定向执行增量，旧MOT/18/27与完整枚举browser未重跑。Memory端口在测试中明确替换耐久guard，不能充当真实IndexedDB证明。实际HTTP/完整25browser/新截图由主线统一后续验收。原件与当前9源码hash见evidence.json；persistence最后仅jsdoc释义修订，不改变运行时或类型。
