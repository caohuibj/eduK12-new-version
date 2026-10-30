# Survey 显式使用配置替换

基于 `770790c9b15b25e52a6c55d7c5c5ff243bb47894`，复用既有 Survey 精确发行、immutable grant snapshot、管理审计与普通撤权。没有新表、迁移、权限中心或报告/认知/Bundle 引擎分支。

公共可选接口（旧输入不变）：

```ts
// POST /api/platform/survey/researchers/:id/tool-grants
exact: {
  requestId, configurationName,
  replaces?: { grantId, expectedVersion: 1, reason }
}
// 原请求 GET 返回原完整 request.replaces；新授权与历史可见：
supersedes?: { selectedBinding: originalPointer, reason }
```

Survey 每条精确使用授权有独立 immutable ID，原授权修订是1；这里的 expectedVersion 不代表 config revision、量表 C/P/R 版本或入口授权 revision。新发行仍核当前 Survey 管理资格、接收研究者资格、精确新来源、入口 policy 和完整机械执行条件。替换仅接受本人为同一研究者、同一工具发行的可信原 typed grant；legacy、package technical grant、另一发行者/接收者、替换自身编号、错误修订或注入 pointer 拒绝。原配置以 HISTORY 核 hash，不借当前默认版修复旧身份或复活旧权限。

在原事务先按请求编号、研究者+工具串行，再锁旧 grant；两个相向/竞争替换不会按相反顺序锁两个 use。新 grant 保存新 T1、原指针与原因，旧 grant 只由 ACTIVE 改为 REVOKED，另记替换事件。原 snapshot/digest、T1 事件、draft FK、publication 不覆盖。允许明确沿用原业务名称；查重排除被此事务撤销的原 grant。幂等输入包含 replaces 完整意图，成功重放不会再发行；旧 grant 已撤销后仍能重放原结果，不允许改原因或换接收者。新原因/旧状态的竞争失败不留下多余 grant。

`configurationSupersedes` 仅是 grant 元数据。先验证原 typed 来源及 lineage，再从 source adapter 重核输入剥除该字段；原 adapter/provenance/计分及源定义不改变。原请求读取额外核完整意图 hash；已有不含 replaces 的 typed 请求仍按原字节重建。普通历史快照读取不依赖新 grant 存活。

管理页面从本人已发行历史进入明确替换，保留原研究者、工具与授权 ID，原因必填；原对象选择/类型不可换，取消后恢复普通发行。当前目录仍可手选已批准 C/P/R。未知结果保存完整 replaces，无密码；回读同时核 request 和 supersedes 原 ID/修订/hash/原因，不能将另一原因当作成功。离开 workspace 后晚到成功不清除旧账号未确认记录。撤销提示按实际新 START 政策表述，避免把“历史定义保留”误写成“所有已发布未入场仍可启动”。

实际独立库 `precise_survey_replacement_test_20261029` 从保留 Survey fixture 克隆；原库不写。PG4 PASS：当前精确 use、实际只读 import/measurement/frozen wave 与独立 waiting draft；无效替换0写入；同 C/P 完整 R→none R 的原子替换、旧 snapshot/T1/发布逐字段相等、新旧报告定义和原 scoring 结构固定；旧 import/等待冻结/新 admission 阻止，历史仍可读；竞争仅1成功/1个409，最终8 grants。没有重跑计分或被试作答。

随后实际受保护 HTTP2 PASS：沿原 Cookie/CSRF/origin/当前密码/近期 proof 路由替换，错误密码拒绝、原完整意图 no-store 回读、旧不含 replaces 的 typed 请求 hash 兼容、精确重放，换原因/已撤旧修订/错误 revision/注入拒绝，无额外 grant。独立库最终9 grants/5 publications；合成密码和 JWT proof 是 fixture，不声称真人 MFA。没有改限流或账户安全策略。

前端20 PASS（原 API4/UI10、新 API2/UI4），另只为补 malformed lineage 重新执行受影响 API2，4个原 API过滤保留。验证原因必填、同一接收者、其他 issuer 不能替换、unknown 完整意图、错误原因阻止、退出晚回执隔离。相关 lint、前端类型、后端 HTTP/直接闭包类型通过；首轮后端类型发现 fail() 未明确终止导致 union/null 未缩窄，改 `return fail()` 后通过，运行时仍是同一抛错行为，未重放已通过PG4。后续纯客户端 malformed 防护只补 optional chaining 并单独跑该 API 闭包类型；页面只补提示文字，未变控制逻辑。

这不等于真实被试/浏览器完整链路或正式门禁。不同工具替换的实际 PG fixture、旧进行中 participant 恢复、性能/批量发行、runtime DB role、Training 替换、任意新跨轴组合审批、认知四入口、适用 CI/Draft PR/合并仍待后续。没有生产操作、真实用户授权、全平台 CI 或 fun 自动注册。
