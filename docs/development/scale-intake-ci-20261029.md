# 量表内容专用 CI 接线（2026-10-29）

基线 main 9801107019d51a4af7ddb651789b674867539d24。独立CI控制变更，不含量表内容、数据库、账号、生产部署或分支保护修改。正式生效须控制PR合并，不把Project指令当实际接线。

## 路线

1. 控制PR复用release-tooling，执行原控制检查及新增scope/checker测试，Ready保留CodeQL和原根门禁。仅两个明确的backend CI脚本从应用组件指纹分开；工具证据绑定仍覆盖完整backend传递输入。未知backend文件不豁免。
2. 以后纯Scale内容继续走主content job，复用scale-onboarding-boundary.yml中的scale-intake子job，无PG/Redis/浏览器/Docker。混合Cognitive/SJT/Bundle维持旧boundary。源码/控制混改不走纯内容。
3. 根Merge Gate要求content和实际所选CodeQL真实成功；不消费独立focused绿灯，不更改保护规则。

## 内容检查

- 精确base→实际checkout（含merge候选）完整Git diff/mode；拒绝删除/重命名/软链/执行文件/控制或共享代码混入。source.json关联真实instrument.ts包装。
- 一次锁定依赖准备、一次生成索引check、只校验变更来源。支持当前inline声明及JSON包装；runtime helper/custom scorer等明确不在轻量子集，不伪称全格式支持。
- 复用AST/schema/validator，关闭validator重复golden计算，真实buildScaleResult/parse计分一次后缓存相同答案结果。逐score缺失策略与边界验证，不仅一个complete_required canonical总分。
- 无常模none合法，CATALOG_ONLY不当可施测；来源状态不自动提升PUBLIC。C测量不可同version重写，P/R仅显式版本修订；完整source/axis冲突复用当前安装合同。目录版本更新不强制改C/P/R，外置README不影响科学轴。
- 只静态检查选中身份的generated/builtin Bundle反向依赖，不运行其他工具计分、全bundle fixtures或DB生命周期。未知静态slot明确报告范围不足。
- 科研成熟度/版权联系不变成新自动门禁；来源附注不授予复制发布权。

## 最小验证与真实首错

原四legacy控制文件65例中8失败；修YAML换行/缩进、动态名称、精确needs身份，保留hostile payload与拒绝约束。初修65PASS，needs增强仅复验受影响两文件42PASS。

新scope/旧scope首轮35例34PASS/1FAIL：新增gate fixture漏原有拓扑字段；定向补齐后1PASS，不删除门禁。集成控制118例117PASS/1FAIL：本机缺锁定release-tools TypeScript，官方源准备同lock依赖后仅失败case1PASS。npm首次缓存路径错误保留，工作区cache修复，lock不变。首个文档写入命令路径重复、未创建文档；更正实际cwd后写入，不影响应用。

checker专用测试原夹具失败与定向修复保留；已有PUBLISHED样本及383的两个CATALOG_ONLY+一个DRAFT已做函数级验证。函数PASS不代表完整CLI、正式CI或数据库安装。最终精确候选与实际run另记。

## 用户明确的三步

1. 独立控制PR：修八个断言、接主content路线，适用正式检查和Merge Gate。与R控制修改交界在合并前核对，不改R分支。
2. 本控制正式接线后，383移出独立CI文件，保留三来源、索引与附注；先回读他人新提交，不强推不覆盖。
3. 对最终base/head回读路由、必需结果与Merge Gate。旧失败保留，不用独立focused代替资格。内容合并仍需环境加载与授权安装/发布/readback才是实际公共库。

Project每批必须输出base/head、真实选中路线、工具清单、run链接及安装/公开状态；纯内容预检不符合先列超范围文件并拆分，不默默触发全平台或砍掉安全检查。
