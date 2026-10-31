# D：课程页独立补修，2026-10-31

基于实际 main `093d86e842da12d443301fd4a37d5d046ecb9185`，与先前冻结的
QuestionnaireAssessment 三文件候选分开。本候选仅本地开发，未获得新范围的公开
发布确认，没有上传、PR、CI 激活、合并、部署或 Hui 写回。

## 两个真实缺口及最小修改

1. 非 Training 的 TeacherCourseDetail 在同组件内切换 courseId 时保留旧 state。
   A 的迟到详情可覆盖 B 标题，但管理学生链接仍指向 B；A 已显示后 B 读取失败，
   页面也继续显示 A。原 effect 的 active 标记只保护 loading，不保护各 setter。
   本补丁用 courseId 作为详情内容组件的 key，切课时重新挂载局部内容；列表、错误、
   反馈及确认状态属于各自课程。读取、四项一起完成的 loading 规则、问卷人工重试和
   原权限接口不变；旧请求没有被取消，已经发出的服务端操作也没有被撤销。
2. 非 Training 的学员 CourseDetail 使用独立读取链，在 Composite available 及
   任务分页都未传课程范围。后端 #437 已支持这两个参数，本补丁仅补传当前 courseId，
   保留服务端会员交集和前端投放核对。没有新 API、缓存、权限、框架或后台修改。

随后继续检查非 Training 的学员切课，发现其旧 A 详情也能覆盖 B，新增反例实际失败。
另一个“B 练习读取失败后不显示旧练习”的对照原本已通过，不把它说成新修复。
学员详情也用 courseId 区分内容组件；与上述范围参数在同一文件，不修改其他入口。

合成反例中 available 有21个跨课候选，任务201条且当前课仅1条；原先读取3页任务，
修复后限定1页，页面仍仅显示当前课目标。这是指定 DTO 的请求观察，不是生产分布、
数据库 SQL 次数或时延测量。现有两页历史投放消费者仍通过，不以只查第一页替代分页。

本候选不修改待合 #436 的共享 loader，也没有实施“候选核实完后提前停止翻页”。
该机会仍交母 DOT 等 #436 合入后协调，不能将这里的传参优化等同于提前停止分页。

## 对先前跨 PR 摘要的更正

先前 D 的摘要将 CourseDetail 写成 loadCourseAssessments 的消费者，这一调用关系
不准确。App.tsx 按 host 分流：TrainingLearnerCourse 消费共享 loader，非 Training
CourseDetail 自己读取问卷、Composite 及任务页。本记录更正该说明，不覆写最初反例
或失败 reporter。新补修没有修改已冻结问卷候选的源码、测试或说明。

## 验证与边界

使用环境内已有的官方运行时 Node v24.21.0，显式运行现有 Vitest 4.1.11；满足仓库
最低 Node 版本，没有安装依赖。原 Node24.19 的早期观察保留，不冒称本轮新环境结果。

- 产品修改前，仅三个最小反例：0 passed / 3 failed，exit 1，原始 reporter 保留。
- 第一阶段修复后，新红例与直接消费者：12 passed，exit 0。范围仅
  TeacherCourseDetail.navigation.test.tsx、TeacherCourseDetail.test.tsx、
  CourseDetail.scope.test.tsx、CourseDetail.composite.test.tsx。
- 后续学员切课反例：1 failed / 1 passed，exit 1。补修后仅学员页面相关四个测试
  文件12 passed，exit 0，包含 navigation、scope、composite 和 logic。
  前一轮未变化的教师页5例复用，不再执行；当前候选共17个不同案例，而非两轮数量相加。
- 原 composite 两页 mock 的 URI 随实际参数补上 courseId，保留两个页码、当前课程
  匹配、外课排除、失败重试、历史报告及尝试限制断言，没有放宽断言。
- 变化五个源码/测试文件 eslint exit 0，0 error、2 条两页已有的 Hook 依赖 warning。
  git diff --check exit 0。
- 两阶段各自冻结后 app `tsc -p tsconfig.app.json --noEmit` 均 exit 0，各约45秒；
  第二次对应新增学员切课修复后的最终候选，前一次保留其原输入身份。记录的源码/测试、
  配置及锁文件前后摘要一致；原始退出状态及输入绑定保留在本地交接原件。

以上使用合成 mock，无真实身份、答卷、个人数据或 FINAL 提交。预装依赖没有重新
npm ci，不能据版本清单宣称整个安装目录经过洁净重建或密码学绑定。没有重复后台、
数据库、其他页面、共享 loader、Cognitive types、全套测试、构建或服务器验收。
