# 四入口公开模块说明页

事实基线：main `4588d8894d18b83565b4129283799065a7cdde94`。未合并的管理员、认知、标签及 Bundle 候选不作为新增能力宣传依据。本次只改公开介绍、卡片链接和必要样式，不改业务 API、数据库、依赖、计分、权限或科学刺激。

## 卡片与页面映射

以下路径均位于各自入口域名下，不能跨入口混用。原页面状态是基线盘点结果；本批全部提供适用角色、已有能力、3–4 步流程、实际产出、边界与操作／返回入口。

| 入口 | 首页卡片 | 路径 | 原状态 | 本批处理 |
|---|---|---|---|---|
| Survey | 研究项目 | `/features/research-projects` | 独立页及主要内容已完整 | 补适用角色、产出和正确工作台入口说明 |
| Survey | 研究工具 | `/features/research-tools` | 独立页及主要内容已完整 | 补编制／共享产出及适用对象 |
| Survey | 发布与参与 | `/features/research-participation` | 独立页及主要内容已完整 | 区分研究者操作与研究邀请参与入口 |
| Survey | 数据与分析 | `/features/research-data` | 独立页及主要内容已完整 | 补数据包产出和数据使用流程 |
| Training | 课程与学习 | `/features/courses` | 独立页存在，内容概括 | 补练习／打卡／测评、角色与产出 |
| Training | 测评与工具 | `/features/assessment` | 独立页存在，内容概括 | 补普通组合／固定打包组合区别和边界 |
| Training | 素材与资源 | `/features/resources` | 独立页存在，内容概括 | 补授权范围、素材引用与产出 |
| Training | 进度与反馈 | `/features/feedback` | 独立页存在，内容概括 | 补群体历史／纵向对照、历史课程来源限制 |
| School | 心理健康支持 | `/features/mental-health` | 链接可达，仅隐藏标题，正文空白 | 完整建立校园活动与专业反馈介绍 |
| School | 学习适应提升 | `/features/learning-adaptation` | 链接可达，正文空白 | 完整建立学习适应场景介绍，不承诺训练疗效 |
| School | 家校协同共育 | `/features/family-school` | 链接可达，正文空白 | 完整建立关系、观察授权及独立报告披露介绍 |
| School | 更有活力的校园 | `/features/positive-campus` | 链接可达，正文空白 | 完整建立组织、活动及群体报告介绍 |
| Teacher | 教师成长 | `/features/teacher-growth` | 卡片仅弹简短 dialog，无独立页 | 改真实链接并建立个人任务／自主测评介绍 |
| Teacher | 学校改进 | `/features/school-improvement` | 卡片仅弹简短 dialog，无独立页 | 建立学校 Teacher 管理与评价活动介绍 |
| Teacher | 实践观察 | `/features/practice-observation` | 卡片仅弹简短 dialog，无独立页 | 建立受邀观察、正式意见与私人反思介绍 |
| Teacher | 持续改进 | `/features/continuous-improvement` | 卡片仅弹简短 dialog，无独立页 | 建立目标／行动／复评介绍，明确需开通 |

## 功能依据

路径均相对 `server-version/frontend/src/`，以实现和消费者为准。

| 内容 | 主要依据 |
|---|---|
| Survey 项目、工具、发布、数据 | `survey/SurveyApp.tsx`、`SurveyBuilder.tsx`、`SurveyWaveStudio.tsx`、`SurveyAnalyticsWorkspace.tsx`；原有 `survey-features.ts` 中的版本、授权及私有报告边界保留 |
| Training 课程及任务 | `training/TrainingTrainerHome.tsx`、`TrainingTrainerCourse.tsx`、`TrainingLearnerCourse.tsx` |
| Training 工具、素材与反馈 | `training/TrainingLibrary.tsx`、`TrainingCourseAssessments.tsx`、`TrainingGroupReports.tsx`、`courseNavigation.ts` |
| School 角色、活动和观察 | `school/school-navigation.ts`、`SchoolActivityManager.tsx`、`SchoolStudentTasks.tsx`、`SchoolTeacherTasks.tsx`、`SchoolParentTasks.tsx` |
| School 关系及报告 | `school/SchoolRelationships.tsx`、`SchoolPeerConsent.tsx`、`SchoolParentPortal.tsx`、`SchoolReports.tsx`、`SchoolGroupReports.tsx`、`SchoolGroupLongitudinal.tsx`、`SchoolIndividualLongitudinalStudio.tsx` |
| Teacher 教师与学校活动 | `huiteacher/HuiteacherApp.tsx`、`HuiteacherPersonalSelf.tsx`、`HuiteacherEvaluationStudio.tsx`、`HuiteacherFormStudio.tsx`、`HuiteacherMyStudentFeedback.tsx` |
| Teacher 实践及持续改进 | `huiteacher/HuiteacherFieldWorkspace.tsx`、`HuiteacherConsensus.tsx`、`HuiteacherMyGrowth.tsx`、`HuiteacherImprovementPanel.tsx`、`HuiteacherGrowthManager.tsx` |

Teacher 的持续改进和学生反馈分别受既有环境开关控制；Training 群体报告已有历史与纵向对照，旧课程多波次数值分析仍关闭。静态说明不改变开关或许可。School 的主题卡片不是额外开通的诊疗／训练服务。

## 页面与验证范围

- Survey 首页改善文字／画面分区、标题层级、宽卡网格和窄屏阅读，沿用原蓝色 tokens、品牌和图片；其他三入口首页不改整体布局。
- Survey、Training 复用原页面与路由。School、Teacher 共用一个只读内容结构，分别继承本入口 tokens；School 保留校园圆角面板，Teacher 使用手记分隔线。没有新增 CMS 或依赖。
- School、Teacher 的精确说明页路径先返回公开页面，不挂载业务工作区，不发起会话／学校／参与者／报告请求。操作仍跳原 `/login`；Training 保留已有角色及 `returnTo`，Survey 保留 `/login`、`/workspace` 与具体研究邀请的区别。
- 主要检查位置：本地 app TypeScript、变化 TS lint、原入口／静态导航定向测试；浏览器仅检查 16 页在 1440px／390px、浅／深色下可读、锚点有效、无横向溢出及没有受保护数据请求。使用未登录合成 API 响应，不宣称已验证真实学校角色、正式报告或生产环境。
- 不运行后端、数据库、量表全量、平台全量 CI 或部署。正式 CI 和 CUA 独立视觉复核由合并队列接入；本地检查不冒称正式门禁成功。

本地预览：在 `server-version/frontend` 运行现有 `npm run dev -- --port 5193`，访问 `http://survey.localhost:5193/`、`training.localhost`、`school.localhost`、`teacher.localhost` 对应页面。域名只选展示入口，不改变任何服务端权限。
