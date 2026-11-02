# CPJ-SJT 原生登记发布清单

最终安装路线为**代码登记**，复用#537使用的原生格式与现有轻量内容CI。本文件取代先前上传包入库步骤。编制源仍完整保留供审查；禁止另行上传同一key，使代码题包与上传题包重复。

## 冻结范围与证据复用

- Base：`adad907a4b68606ce71bb1a4f2d7c511c872c715`。48个有效身份：CJ01-SD 0.4.3，其他47个0.4.2，详见 `inventory.json`。
- 运行权威：每个 `server-version/backend/src/modules/situational/instruments/<key>/<version>/` 的 instrument/publication/scientific.json，及既有生成登记表。
- 原生数据是从前轮已验证的隔离库冻结包**只读导出**，没有重新编写选项、分支或计分，也没有重做5088路径本地测试。逐包重算原sjt-upload-v1编译信封摘要、核对原编制源、definitionHash及projectSituationPackage完全相等。新publicationContentDigest属于登记容器，不能混作旧上传contentDigest。
- 48个运行包与现有schema解析对应；每个instrument.json小于1MiB，最大239377字节。没有#537大对象Git读取容量问题。
- 官方原生内容门禁 → GitHub主要执行：现有situational:contracts、publication/scientific/review authority与历史不可变检查。既有门禁包含所需golden检查，不删样例、不skip、不再另外新增一轮本地全量检查。
- 锁依赖、真实API/UI、缺失、权限、旧历史 → 复用本地精确原定义证据。Node24.21.0、Prisma5.22.0；后端445/前端395个实际已安装包与锁版本一致。之前上传权限401/403证明仅适用于上传入口，**不冒充新的static-sjt管理员HTTP/MFA证明**。
- 新变化故障 → 本地只查原生登记格式/生成表、运行定义与原包相等、分类正负样例、Git差异/哈希。未改业务/schema/依赖/CI，未启动应用全量编译或浏览器重跑。
- 轻CI约5分钟为定位阈值；超过只报告实际等待作业，不扩展检查。

相关证据在 `evidence/registry-parity.json`、`evidence/browser-summary.json`、`evidence/published-readback.json` 和 `evidence/locked-dependencies-final.json`。官方run状态以PR当前head为准，不把本地证据冒充官方artifact。

## 已通过的实际短流程与限制

此前相同定义在隔离库完成48工具创建/发布服务闭环和54个FINAL报告回读。本轮补CJ01-SD真实浏览器三轮、交卷和叙事报告，漏答被阻止，U退出是null。CJ01独立反思三个字段全空可提交，最终COMPLETED/SATISFIED，恢复报告显示三项“已显示未填写”，没有零分或能力等级；另有三个测试恢复时打开但未交卷的合成记录，无回答或得分。中间页曾短暂显示“任务未达成”，最终状态正常，此呈现问题未改引擎。

48旧上传发布哈希/measurement指针/状态未改，一份历史报告深相等。此为隔离开发历史，不代表已检查生产记录；新代码登记在该旧上传DB中不得同时启用同key。生产先核对是否已有同key所有者。

39张表单中仅CJ01反思表完成开发接入；其余38张只通过解析。全部`.csv.txt`保留CSV单元格，可恢复扩展名用于将来授权导入；本次不自动登记或投放这38张表单。匿名反思仍与SJT独立，无自动身份关联。

## 最低正式发布步骤——主线在唯一生产目标协调

1. 对选定的精确48身份和 `evidence/registry-parity.json` 中各registryPublicationContentDigest取得真实、不同于PR作者、具有write/maintain/admin权限的人类APPROVED review。一般发布授权、机器检查、合成审阅不能代替这一条。PILOT和暂定编码保持，不要求伪造学术校准。
2. 仅将已审定工具的publication.json改为PUBLISHED，并写入原生 `review:{kind:"github-review",reviewUrl:<真实pullrequestreview链接>,contentDigest:<该工具registryPublicationContentDigest>}`。源码有实质变化则重新审阅/冻结，不覆盖已发布版本。所有未审定工具仍DRAFT。
3. 由有权主线按既有合并及内容发布流程安装批准源码。当前任务只创建Draft PR，未合并或部署。若生产已有上传所有者同key，先停止重复登记并明确迁移策略，不偷偷换key或删除历史。
4. 在目标环境使用真实SYSTEM_ADMIN会话和最近300秒管理员MFA，调用 `POST /api/admin/permissions/static-sjt/prepare`，body为准确 `{instrumentKey,instrumentVersion}`。回读mappingId与登记contentDigest；prepare只创建不可变来源映射，不等于发布或授权。
5. 用既有 `POST /api/admin/permissions/content-grants` 配置精确发布能力：product=TRAINING、scopeKind=PLATFORM、scopeId=situational-registry、resourceKind=measurement、resourceKeys=[mappingId]、capabilities=[measurement.publish]，限定实际操作人及有效期。再调用 `POST /api/admin/permissions/static-sjt/publish`，body为 `{mappingId,grantId,deployment:{locale:<实际语言>,territory:<实际地域>}}`。没有长期凭据或伪造MFA随包交付。
6. 按选定入口原有material.use/分发与工具发布机制入库；测量发布不等于四入口自动分发。回读真实库卡片、适用标签、来源、PILOT、definitionHash、scoringVersion=author-key-sum-v1、reportVersion=sjt-narrative-v1及报告绑定；一名真实授权教师短流程即可，不重跑全部题库。
7. 回退按已有operational hold/精确授权撤销暂停本版本新准入，保留冻结版本、mapping和历史FINAL，不删除或改写旧结果。

上述人类review、管理员HTTP/MFA、正式发布、生产库回读尚未执行；均由主线协调。没有独立生产写入或另取凭据。

## 既有命令

```sh
# server-version/backend；已提交原生三JSON和生成表，无需新导入器
npm run situational:manifest:generate
# 下两项由现有GitHub内容/发布门禁执行，相同产物不再在生产重复
npm run situational:contracts
npm run situational:onboarding-check -- --all --verify-reviews --base <完整基线SHA>
```

不能用sjt-authoring上传接口重复安装本次已登记key。原JSON编制源是审查附件；运行权威为登记instrument.json。C计分/测量投影、无P参考常模、题包冻结R的解释仍见bindings.json；不伪造独立P或REPORT release。

## 四入口与科学边界

- **Teacher**：教师SELF形成性试用，teacher_self_report相符；必须取得该组织的固定版本使用授权并发布工具。
- **Survey**：教师参与者可使用原生staged SJT协议；代表性adapter已核对，真实分发/项目投放与参与端未在本轮执行。
- **Training**：教师独立SJT入口适用；普通学员组合过滤teacher_self_report，不为显示改成学生标签。
- **School**：学生SELF或他评不适用教师包，应保持不可用，学校内教师走教师适用入口。

24个构念标签为狭义动作描述，未建立心理因素模型、适切性分、常模、诊断切点或培训效果。计数不是越多越好，路径机会不可比；原R1研究探针保留，POST_FINAL反思不能合并为原始动机证据。未知许可/restricted保持；用户只授权本轮候选进入指定仓库和项目工具库，不虚构第三方再分发许可。

Notion CI历史页已用可访问账户读取；适用的依赖、精确身份/证据、权限和恢复协议条目已核对。无CI源码改动或新门禁。
