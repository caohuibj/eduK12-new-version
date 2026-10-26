# 首条真实原生旅程交接：MOT

本候选已开发、提交并推送到 cognitive-next-three-core-20261026；独立审计由外部根 dot 在原对话完成。未启用 CI、合并、部署或正式发布。本页描述候选代码和隔离合成验证，不代表生产可投放，也不把研究 metadata 当后台标签检索。

## 可亲读的固定提交

|提交|用途|原件目录（本页同级）|
|---|---|---|
|6a78d55d168afddb874feb4f518a13d11a1a4cc9|真实 MOT DRAFT seed、配置发布/课程分配/profile/source冻结、START、权威FINAL与冻结描述报告|native-journey/、native-journey/core-receipt/|
|d52e1a80c39fc935a99f9414926fc4daadd06110|PRIVATE COS现有资产设施薄接入，业务身份幂等、短锁、完整原件加密包|raw-archive/service/|
|7ce982865093f08e1b4a93eb0f0769ba522882c1|认证归档HTTP路由及3项真实HTTP合同|raw-archive/http/|
|8bf872a573239fd43a388de3bb196fa523350728|真实NativeMotRunner/产品入口、IndexedDB原件保留、FINAL与归档分离、回执核对与在途上传复用|raw-archive/client/|
|af7abfe7212f51537de3cc72ddd335c6b409a0d7|报告四均值最多一位小数、历史1.1.0 bundle及旧assignment新START兼容|raw-archive/report-format-followup/|

每步push后已读回远端ref、tree和目标blob；以上5个SHA实际Actions查询均0。最后固定head af7abfe7212f51537de3cc72ddd335c6b409a0d7、tree 39e9fa368d2270e6d91965ccd10e1d7a374f5b13。后续宿主generation收口见下方追加，不能用本页旧head冒称该项已修。

## 实际合同与验证边界

一条真实业务旅程：已授权管理员发布配置→老师课程分配与冻结→成员学生START→保存原生Envelope→一次权威FINAL→冻结报告。只准入登录课程独立MOT，保留既有身份/权限/成员/attempt/epoch/幂等规则。真实research45/experience9，原两次练习；没有standard别名、RegistryEntry假score或客户端报告权威。数据库schema和锁定依赖不变。

core保存与原件归档分开。DB保存生成报告和业务所需冻结内容，完整原件包包含服务器权威core/config/result及既有formal/practice逐帧原件。显式COS/PRIVATE，复用StoredAsset/AssetReference；上传网络不占业务长事务；同rawSubmission只确认一份，冲突拒绝。浏览器本地耐久原件仅在匹配身份/rawSha的完整回执后清通用FINAL草稿。临时失败保留同包重试，报告照常可看；不从COS回算或修正报告，不承诺关闭浏览器自动上传。原MOT专用草稿store保留，不称本轮已清它。

实际云端浏览器跑2练习+9正式键盘输入、真实API/PG与一次FINAL；fake COS首次503后原件仍在真实IndexedDB，同身份重试200后通用草稿清除。390/820和200%截图保留。该次报告limited，1条速度8被既有门控排除；不放宽门槛、不把9条收到说成9条有效，不对该一帧讨论做额外分析。另有真实PG正常/all-invalid FINAL合同，不能把两种记录混为一次完整浏览器成功。

COS上传/删除是明确测试替身，不是实际外部服务证据。完整App/Auth shell/CSRF未覆盖，csrf404保留；未验证生产入口、真实手机平板/Safari/触控整程、并发容量或物理曝光。真实入口当前默认中文；组件English props不等于双语产品交付。报告1.1.1新增冻结才采用短小数，截图和旧结果1.1.0不改写。

## 环境与收尾

操作系统Debian13.6、Linux6.18.55；工作目录/workspace/eduK12-new-version。可调度逻辑CPU5个，cgroup CPU额度4核；内存上限16GiB。代码、官方锁定依赖、隔离PG/Redis和Chromium均在云端，不使用Mac文件、终端或浏览器。真实HTTP18855已停止，独占HTTP合成fixtures读回为0；本轮两个自建隔离容器已停止并自动移除。未操作生产或读取生产凭据。

PR356最新读取392b8128b9f4b9d9d4b6375279ea5e0e559e0554，仍open/draft；main为ff8471e529e7b3c56e1e20f17d1e2581040fc896。相对先前实际核过的a57b6c8d，仅新增5个CI/docs提交、27路径，无server-version业务变化，见pr356-refresh-after-native-journey.json。未合入或编辑其分支/CI控制。

## 尚需推进

1. 当前新增nativeHost一代绑定修复仍在实施；目标为旧回调不写新epoch草稿、不推进新UI、保留原Mot端口记录，结果随后独立提交。
2. 实际COS、完整App/CSRF及生产构建/门禁尚未验证。当前无生产新数据；未来已有1.1.1冻结实例后，回退必须保留该版本读取能力，不能简单移除bundle。
3. 其余三项的真实seed/授权宿主/前端native/逐项原件schema尚未接通；再认正式素材需真实清权，ANT物理geometry未冻结。resolver存在不代表入库。
4. 四入口全消费者、公开/综合/Survey固定模板、高级library、完整标签持久/搜索、英文真实入口、真机设备待续。没有年龄或常模结论；内容标签不代表诊断或招聘效度。

已有三项及MOT批准保持；新测验先人工审图再实现。最新用户体验原则已执行，严格计时提案superseded且历史原件保留；未做时序重研究、COS回算或报告修正。Notion母页第18节已写入并读回，保留原第9节批准图片。

## 追加：宿主归属收口已推送（2026-10-26）

上文第1项待办已完成候选开发，独立提交6518f9eb82b8b95c97adea6a4b7c3fda2cc5b765，tree19b5065ed5b247703c33a9c85bf93d52db5a73ab。push后远端ref/tree/useCognitiveSession blob已读回一致；该SHA Actions0。

nativeHost捕获原session/epoch/definition/protocol/版本/seed及生命周期代数，load/restart/卸载使旧代失效；await后不推进新UI，也不让旧FINAL/replay回包写新meta。Store的putTrial/sealForSubmission/setStatus/delete以可选expected身份在现有事务内核对，legacy调用不传仍按原规则。raw seal及core finish逐步带原身份；already-issued FINAL可按原server事务落账，不宣称取消，也不丢原Mot绑定端口原件。当前同key新epoch遇旧meta仍明确冲突并保留原件，不声称能无条件覆盖续答。

新增8个不同host合同，首轮7通过、续验2通过（其中active因fixture合法PHONE枚举更正重复一次，不计作第9项）；真实frontend tsconfig四入口闭包0诊断。主线另在真实云端Chromium/IndexedDB验证当前身份正常写/封存/完成/清理，以及旧epoch四种操作与旧submission清理均拒绝且新数据不变，2个合同首次通过。原2+9完整browser、旧scorer/时序及其原件不重跑、不覆盖。

原件为raw-archive/client/host-generation-followup/；真实IDB子目录parent-indexeddb/。本次没有改协议、刺激、输入、试次数、raw/core字段语义、版本或后台schema。开发验证不是外部根dot的独立审计批准。

下一项已批准点数判断的7步实际消费者差异见enumeration-next-native-slice.md，首个直接阻碍是stimulusRecipe:null与INTERNAL_REVIEW_ONLY不能当真实冻结artifact。先固定已批设计对应recipe/calibration合同，再接产品；其它未验证与未放行事项仍按上文保留。Notion母页随后追加此精确候选与已回读事实。
