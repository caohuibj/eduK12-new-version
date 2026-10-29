# 单量表系统探针：C1，全流程实际结果

本轮按用户新增授权，只用 `ipip_neo_c1_self_efficacy10_zh_cn_research:1.0.0` 核查共用系统链路，不恢复逐包四入口/显示/幂等验收。本轮**没有四入口全通过**：Training、Survey 实际交卷并回读结果；School 和 Teacher 的具体路径出现运行合同问题，后续作答/报告保留 blocked，未伪造完成。

| 入口 | 已完成的真实链路 | 最终状态 |
|---|---|---|
| Training | 安装、PUBLIC、固定C/P/R批准、入口管理员精确授权、源问卷发布、真实浏览器登录、十题选择、FINAL、报告回读 | 唯一实际父attempt `45ec3127-256d-4f24-b9d7-8377e845274a` COMPLETED；分数30，10/10，report1.0.1。指导语漏显、暗色对比度缺陷 |
| Survey | 真实研究者登录/TOTP绑定、精确版本使用授权、认证HTTP创建项目、导入/测量发布、冻结/开放、真实公共浏览器知情同意/十次点击/FINAL/反馈；另读取保存的研究报告 | actual final `1d405859-4eec-4260-9367-c53fdc90ea7d`；分数30。已有指导语正常显示；反馈用内部指标键作为标签 |
| School | 同一STANDARD源、精确内容/报告分发授权、prepare/register/独立业务review/publish、真实名册登记/班级审批、活动及Run发布、实际学生浏览器登录/任务选择 | 带独立目标R的已发布任务点击开始500；execution保持ASSIGNED、binding=null，未交卷/未展示报告 |
| Teacher | 真实登录、同源精确授权/发布、Run分配；首先独立目标R路径，随后保留原件另建一个使用原固定R的精确任务 | 目标R路径START500。原固定R路径START200，但GET本次作答409，原因SELF被映射为TEACHER；真实父/子IN_PROGRESS、execution STARTED，未交卷/未展示报告 |

源码冻结：backend `4db7fdff3624e4e7d7fbc784d360d013c48d29fe`，实际完整前端来自已有独立PR367 `fccc98c43ba42947052875f5cbbe5caf359e3de6`，Vite代理本次真实API；不是之前的组件合成预览，也不是已部署构建。instrument/instruction/scoring/localization均1.0.0，report1.0.1，参数/reference明确none。来源b92的CANDIDATE/PILOT/PENDING/no scientificReview不变。

运行只在新隔离库 `eduk12_system_b3e9809fe6`，Redis逻辑库9，全部账号/组织/班级/作答均为合成技术数据。STUDENT技术身份不表示真实未成年人；本量表仍限成人工作译稿。既有组织/入口权限是本次隔离夹具预置，源内容/版本、使用分配、资源注册/审核/发布、名册登记审批和实际作答均走现有业务函数/真实路由，没有直接更新包、冻结源或测评完成状态。

管理准备使用真实业务函数及明确标注的合成管理proof，不宣称系统管理员浏览器WebAuthn/MFA或所有管理页面完成验收。普通教育/Training账号登录、研究者TOTP、实际被试作答均是应用真实链路。目标R仅在隔离库中使用现有发布函数机械绑定原批准模板、指标、确切measurement和目标受众，不重写题文/计分/报告、不冒充生产或科研批准；其后暴露的准入/执行不一致原样保留。

## 五项共用系统发现及最小修订边界

完整机器清单和精确文件见 [findings.json](findings.json)。下列共享改动只提出方案，**均未擅自应用**；量表内容分支本轮只有证据文档，不改认知、共享治理、权限或Mac前端工作线。

1. **Teacher本人自评身份误判**。`assessment-run/startAdmission.ts:49` 的 `respondentTypeFor` 先把TEACHER角色映为教师他评，再判断SELF。实际同一subject/respondent被冻结为TEACHER，C1只允许SELF，因此进入409。`consent.ts` 已有正确区分的同人SELF先例。最小修订应识别验证过的同人SELF关系并保留非对称教师/家长观察者；不扩大C1 applicability或改历史身份。
2. **目标报告发布合同与标准运行合同不一致**。教育注册/发布接受精确授权的目标R；START时 `training-report-selection.ts` 优先进入固定组合派生R校验，报 `CONTENT_STANDARD_DERIVED_RELEASE_IDENTITY_MISMATCH`，页面500。原固定组合R硬编码teacher受众，而School要求student。优先让发布前与执行端使用一致合同，拒绝时应有可定位409；若支持精确教育目标R，须由root明确机械派生与目标绑定合同。不能删身份校验或冒用PLATFORM绕过。
3. **逐单元播放器漏指导语**。Training真实首题页面没有量表指导语；数据库实际冻结文本与源逐字一致，`CompositeScale.instruction` 已是现有公开字段。`FinalCompositeAssessment.tsx` 的SCALE分支未渲染它；Whole播放器及Survey已有对应呈现。建议仅在该分支显示现有冻结字段，无字段时不编造，无API/引擎改动。
4. **Training暗色报告对比度不对**。390/820实际报告无横向溢出，但结果30为 `rgb(229,233,223)`，背景 `rgb(251,253,255)`，实测对比度约1.208；范围文字约2.156。`report-ui.css` 的浅色卡片与Training暗色文字覆盖冲突。需同主题配对文字/表面色，优先Scale消费者内收口；不改数值、范围或图表坐标。此前中性组件截图不能证明真实入口主题正确。
5. **Survey反馈技术标签直接暴露**。实际提交200，30分正确，但参与者看到 `ipip_neo_c1_self_efficacy10:30(OK)` 和 `interpretable`。`participant-feedback.ts:67` 直接构造 `label:key`；应使用已经授权、保存/冻结的中文指标名，并在既有UI翻译显示状态，保持指标白名单、值、缺失状态与披露边界，不读实时科研定义。

## 原失败与未执行项

- 初始教育夹具错误给RESPONDENT和SUBJECT同时配置个人反馈，被现有“仅本人”合同400拒绝。修正为仅RESPONDENT，保留原失败；不计应用缺陷。
- School最初缺 `CAMPUS_ELIGIBILITY_HMAC_KEY`，名册步骤503。只为这套新库生成独立测试key并重启自己的API，从名册继续；原失败保留，非生产配置变更。
- 浏览器脚本先后误判Teacher隐藏密码框、漏匹配提交按钮、提交后错误等待已不需要的“查看个人报告”按钮。这些命令退出1；Training第二次命令内部实际已交卷成功，后续只读报告/数据库确认，没有把外层1改为通过。
- 首次Survey自动化 `check()` 与自动翻题交互后定位下一题失败，页面显示10/10；未完成逐事件归因，不计为已证实应用缺陷。原匿名凭据只在易失会话中，脚本未保留，故该合成attempt保持STARTED，无final。修正为实际 `click()` 后，用另一个合成参与者观察十次选择并完成唯一final；没有手填旧attempt完成状态或从hash伪造凭据。
- 首次只读回读脚本错误按Assessment不存在的createdAt排序，原退出1保留；修正查询后只读完成。最后追加Teacher精确原R新状态的只读回读，没有重跑Training/Survey。
- `completed=true` 在部分旧工具只表示循环处理结束；以每项实际结果、外层退出和原件为准。完整命令/退出及缺项见 [execution-index.json](execution-index.json)。没有SAST/CI/全量测试/tsc/build，不把这些写成通过。

## 证据与后续

机器索引 [index.json](index.json)，原报告/日志/脚本及输入hash见 [evidence](evidence)。大原件gzip无损保存，原路径/摘要见 [transport.json](transport.json)。未记录的历史完整依赖字节、浏览器前后清单与执行签名如实缺失；没有补造。浏览器使用既有云端容器配置（Chromium内部sandbox=false，外层托管环境未变），390/820为CSS视口而非真实手机硬件；截图浏览器时区UTC。报告中原UTC时间不改写；用户侧日期按Asia/Tokyo理解。

[Training实际报告](evidence/training-final-report-390.png)、[820报告](evidence/common-report-820.png)、[Survey实际反馈](evidence/survey-final-feedback-390.png)、[对比度实测](evidence/training-contrast.json)、[Teacher精确状态](evidence/teacher-final-readback.json)。

本次自己的API/前端/浏览器已停止，隔离库与原件保留；不删除历史、不清空共享Redis。未写生产库、授予真实人员权限、启动CI、Ready、合并或部署。共享身份/报告合同及共用前端最小修订先交root协调独审；后续只补相应失败点，不再整轮重跑，不新增逐包系统准入要求。
