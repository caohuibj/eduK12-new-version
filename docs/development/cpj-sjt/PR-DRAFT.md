## 问题与结果

加入课堂观察CPJ-SJT的48个原生登记工具，供教师按专题、情境和SD/WD条件独立选择。逐项题面、分支、描述性动作编码、报告与训练建议完整可审查；同时保留编制输入、六册研究题本和39个可选表单文本。保持DRAFT/PILOT，没有能力总分、常模、诊断或伪造专家评审。

本轮将前一已推送上传候选改为#537相同的现有代码登记协议，解决内容CI分类问题。48个运行包只读导出自此前已验证的冻结包，definitionHash、题目、选项、分支、计分、报告及goldenCases均相等；只有登记容器的publicationContentDigest不同。**无需任何CI、schema或引擎修改。**

## 范围与发布路线

- Base：adad907a4b68606ce71bb1a4f2d7c511c872c715。
- 48套instrument/publication/scientific.json与生成登记表；审查文档及原始编制输入在docs/development/cpj-sjt。
- 有效版本：CJ01-SD 0.4.3（仅报告时点澄清），其余47个0.4.2。代码登记只有48个有效身份；旧编制文件不重复安装。不得另外上传同key。
- 现有分类器：content=true，domains=[situational]，frontend=false；官方assessment content和Situational publication integrity执行真实schema、golden、历史不可变及审阅契约。无平台全量编译/浏览器构建，无新门禁或skip。
- 所有原生instrument.json最大239377字节，不受默认1MiB Git对象缓冲限制影响。

## 验证与证据

- 主要本地新增检查：48个运行定义/样例与旧包逐字段相等，原编制信封摘要重算、schema解析、生成表、分类正负样例与文件完整性。没有重跑5088条本地路径。
- 复用原定义的48工具/54次服务交卷报告、锁依赖及代表性真实浏览器结果。Node24.21.0、Prisma5.22.0，445/395个实际依赖与锁文件一致。
- 代表性SJT漏答阻止；U退出返回null；独立可选反思3题全部留空交卷，恢复报告显示未填、不补零。动作次数不作能力/适切性分或排名，训练按现实条件和证据选择。
- 48旧上传版本哈希与measurement指针未改，旧报告一致。该证明限隔离开发库，不能替代生产历史核对。
- 39表单仅CJ01反思已开发接入，其余38表单未接入、不自动入库。反思是交卷看反馈后的回顾，不与保留的原R1探针合并。
- Teacher教师SELF和Training教师独立参与适用；Survey需原生协议与精确分发；普通Training学员组合和School学生SELF不适用。未声称四入口均已发布。
- 先前上传401/403权限证据不冒充static-sjt管理员HTTP/MFA证明。正式权限/生产回读待主线协调。

## 发布与回退

主线在唯一生产目标协调。需要不同于PR作者且有仓库写权限的真实人类APPROVED review，随后准确publicationContentDigest对应PUBLISHED源，再以真实SYSTEM_ADMIN近期MFA和精确measurement.publish能力使用既有static-sjt prepare/publish及产品material.use/分发流程。保留PILOT和unknown/restricted，科学研究未校准不伪称已完成。

回退暂停选定版本的新准入/授权，保留mapping、旧冻结版及历史FINAL。未合并、未部署、未生产写入。详见README、RELEASE-CHECKLIST及evidence/registry-parity.json。
