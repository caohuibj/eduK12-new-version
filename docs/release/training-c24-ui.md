# C24：普通 Training 页面最小可访问性与反馈文案

本轮在已独立复核的 C22+C23 集成 `def1b6581478e599adc8710d97bb9d29cb264a03` 后开始，只处理明确的页面缺口。没有重做主题，没有修改后端、数据库、API、授权或四工具运行时。原生浏览器截图、实际交互、像素/触控/对比度证明集中留待 C25；本轮不能据 mock DOM 检查宣布视觉验收完成。

## 范围与跨产品影响

修改组件 → MyAssessments 的 Training 状态入口及两张普通作业/打卡提交页 → 避免文案暗示反馈已开放、用户无法定位缺答/失败、附件和上传入口只能鼠标操作 → 当前云端受影响 mock DOM/no-emit，复用不变共享内核 → 每批小提交，单 worker、共享 measurement lock、固定 Node 24.21.0、资源预检及有界时限。

- Training 文案与新增错误焦点只使用既有 `isTrainingHost` 展示上下文 opt-in；这个判断不参与 API、权限、课程身份或结果开放决策。
- 两提交页是跨产品共用页面。已明确批准将局部原生 button、关联 label、准确 aria-label 同时用于 School 同页；不复制两套 JSX/handler。共享影响限于这些控件的键盘语义和名称。
- 不改 ProductStatus、PdfViewer、ModalSurface、MediaRenderer、幂等工具或共享 CSS。文档预览使用原授权内容、URL、allowDownload 和 viewer；上传继续原 image/*、单文件、九张条件及 assetId payload。
- 课程设置与分析不并入首批。它们存在源码可证的操作错误无显式焦点问题，但需要自己的确认弹窗/分析状态测试，不能由本轮页面检查代替。

## 第一批：状态/报告入口文案

提交 `0b8117a1027c7794fbc376010ad14dbf47b7ab20`，仅修改：

- `server-version/frontend/src/pages/MyAssessments.tsx`
- `server-version/frontend/src/pages/__tests__/MyAssessments.test.tsx`

Training 页面说明改为查看状态与可用反馈。Training 且 sourceType=COURSE 的服务器 reportTarget 显示“查看测评状态/报告”；`SUBMITTED_NOT_SATISFIED` 继续明确作答已保存并计入次数，改为说明可查看反馈开放情况。非 Training 的原页面说明、School COURSE 及组织/自助任务原报告标签保留。

href、state、pendingCount、完成回执、resultAvailability 及服务器开放判断均未改。没有新增请求、轮询、定时开放计算或隐藏完成状态。结果页仍是权限和反馈开放状态的权威。

新定向检查：6 通过、6 未选；MyAssessments 及测试加实际 Vite/test ambient 的 no-emit 294 sources、0 diagnostics、0 emitted files。包含两种 Training 提交状态、School COURSE 的两种状态、Training 组织/自助任务标签保护；每项确认仅原 inbox/catalog 两次 GET。原始输入和类型闭包前后相同。独立源码与证据复核已关闭，无阻塞。

| 原始证据，路径相对云端工作根 | SHA-256 |
| --- | --- |
| `c24-inbox-validation-01/selected-tests.log` | `4a8e972fa05cb51787d1dc5bf945b240f7034f968dd364e1201c4f865d595486` |
| `c24-inbox-validation-01/affected-types.log` | `a92ce67d43419ca6ac0aae91a3e5d3014f08bfbcbff340c5004a9a8193292cd0` |
| `c24-inbox-validation-01/receipt.json` | `74e75b879ad4bc09886e4dcd2894f2d5f13b502486fd54cf5e5ef1f407d3e877` |

## 第二批：提交页基础可访问性

提交 `f0b242de31acee4a71dfe6274d8119cd0cfa1a9d`，仅修改：

- `server-version/frontend/src/pages/student/AssignmentSubmit.tsx`
- `server-version/frontend/src/pages/student/CheckinSubmit.tsx`
- `server-version/frontend/src/pages/student/__tests__/AssignmentSubmit.review.test.tsx`
- `server-version/frontend/src/pages/student/__tests__/CheckinSubmit.accessibility.test.tsx`（新增）

作业本地缺答提示使用独立错误事件计数和本地 ref 聚焦，重复相同错误也触发。初版打卡对新的 error 对象聚焦，虽限 Training，但独立复核随后发现晚到失败会抢走用户继续输入/预览的焦点；该 P2 及修复详见下节，初版不能作为最终无缺陷声明。成功、首次加载和后台回读不新增焦点移动。作业原生成功/失败 alert 已有模态焦点，本批保留，不重写成功回读或提交幂等协议。

两页文档 click-only div 改为 `type=button`，内部使用 span，保留同一选择/打开处理器和完整预览 props。打卡图片选择改为原生 button 调用独立隐藏 input，保留 image/*、单文件与上传中禁用；按钮在 spinner 状态仍有稳定名称。内容 label 关联 textarea，保留 required 原生验证；移除按钮以图片序号命名，上传说明使用 aria-describedby。只在这些局部元素增加既有 focus utility，没有修改共享 CSS 或主题变量。

此不可变初版的新定向 mock DOM 为 19 通过（作业 7、打卡 12），原作业 5 项未选且断言保留。两条变化的缺答路径由新焦点用例覆盖；旧 index/id 回显与 optional-note 请求分支未改，不把未选项计为本轮通过。新覆盖包括：

- Training 与非 Training 对照；重复相同错误再次定位；初次加载/成功不主动调用 focus。
- Enter/Space 触发文档打开，原 URL/title/allowDownload 不变；键盘激活图片选择一次仅调用一次 input.click；取消不提交。
- 上传中控件禁用、九张不再显示添加、按名称移除后剩余 assetId 完整；正文 label/required 保留。
- 原同步 pending guard 拒绝重复 submit；网络/5xx 后相同内容重试保留 Idempotency-Key、expectedRevision 与 payload；原生 alert 保留。
- 已接受提交仅执行原详情回读，回读失败仍保留成功反馈，不重新提交或额外聚焦。

受影响四文件及实际 ambient 的 no-emit：421 sources、0 diagnostics、0 emitted files。Node 24.21.0 / TypeScript 5.6.3，输入与类型闭包前后相同；最低资源采样 free 9,450,962,944 B、MemAvailable 7,828,443,136 B。没有连续极值或性能比较结论。这两次初始检查通过，但未覆盖等待期间的新用户操作；下节保留后续真实复现失败，不用初始通过掩盖独立发现。此前 C22/C23 原失败记录亦不改。

PDF 组件在这些用例中被 mock，只证明按钮触发与参数传递；input.click 也被 spy。不是实际 PDF 授权请求、浏览器文件选择器、弹窗返回焦点或图片上传服务验收。

| 原始证据，路径相对云端工作根 | SHA-256 |
| --- | --- |
| `c24-submission-validation-01/selected-tests.log` | `d6e9bd81d7b5978025c6223e379b279275e2012cde08904b68934a9a998a98ea` |
| `c24-submission-validation-01/affected-types.log` | `76c6edc44c4d144a56c14dcd8b5b81945ff0569115c3897d00cfa7de281d5456` |
| `c24-submission-validation-01/receipt.json` | `b6559ca1979afc62c6ee9e89ceec616dc28c8bcf5f1e8356ace7b2ce11997baa` |

## 独立复核发现与修复：打卡晚到失败焦点

独立复核在 `f0b242de` 发现 P2：上传/提交等待期间，正文与文档仍可操作，但新的错误对象一律聚焦 alert。新回归在保留原运行时的情况下实际复现 4 failed / 12 skipped，分别为上传/提交 × 原 textarea 继续输入/打开文档预览。4 项实际错误均是预期正文/预览按钮保有焦点，却被错误容器夺走。该次 receipt 保持 FAILED；原始输入前后相同，不覆盖也不将其升级为通过。

修复提交 `4bfb0536d3ff6904140c2b557f67db3c056861e8` 只改 CheckinSubmit 与其测试：

- 每个上传/提交操作单独保存局部焦点 token；两个操作的错误不共用可变 pending token。
- 现有 ProductPage 原样透传的 pointerdown、keydown、input、focus capture 仅递增本地 ref，没有全局监听、额外请求或整页禁用。即使 textarea 焦点没换，继续输入也会使旧 token 失效。
- error effect 只在 Training、无后续交互、原页面与原节点仍连接且归属未变、activeElement 仍是原节点时聚焦。节点移除、切换预览或失焦到 body 等情况保守跳过，原 alert 仍公告。成功状态不保存焦点 token。
- 不改 pending/幂等/retry/payload、正文与预览可操作性。School 不新增错误焦点行为。

只复验受影响 8 项：4 项新延迟失败回归，加 Training/School 两种宿主下的重复上传错误与重复提交错误（保留同 payload 的幂等身份）；结果 8 passed / 8 skipped。原 textarea 继续输入用例明确不点击、不换焦点；预览用例保持合成 viewer 按钮焦点。原先 Assignment 与 Inbox 运行时未变化，未重跑。初版打卡其余 8 项保留为旧 SHA 上的历史分支证据，不称修复后 16 项或原 19 项全部重验通过，也不把复跑用例相加为独立新覆盖。

局部 no-emit 以 CheckinSubmit、其测试及实际 Vite/test ambient 为根：416 sources、0 diagnostics、0 emitted files；Node 24.21.0 / TypeScript 5.6.3。源码输入及类型闭包前后相同；共享锁已释放。最低资源采样 free 9,448,325,120 B、MemAvailable 7,858,352,128 B，仅作有界资源记录。所有焦点证明限 mock DOM；native picker 返回焦点及实际 PDF viewer 仍未验证。独立源码/证据复核已在修复不可变 SHA 关闭 P2；复核未重跑测试。

| 原始证据，路径相对云端工作根 | SHA-256 |
| --- | --- |
| `c24-submission-focus-repro-01/selected-tests.log`（4 failed） | `9c1b227b8fde9f68f1dbb1d2ac0530d49a5353e561ac9d1adebba2d54b2e7622` |
| `c24-submission-focus-repro-01/receipt.json`（FAILED） | `4ac954f038adb41115db14b36a97b00ce7779d4fe7e774e95401402ff83950a8` |
| `c24-submission-focus-fix-01/selected-tests.log`（8 passed） | `d50a8c3ee2fed486f76b73693b8ad57d092c9647de41a5922af7b699e887ee3a` |
| `c24-submission-focus-fix-01/affected-types.log` | `fce1d1a7cc71154f2ad0ed6bea1646ccab7b063b925e1a094eff06cdc9cb6ad0` |
| `c24-submission-focus-fix-01/receipt.json` | `41b4602ae23a4fae507470edd965e617201a9d000e09f85fd6a79d0a65961d58` |

## 明确保留的后续项

- `MediaRenderer.tsx` 的关联图片 tile 仍是 click-only div，影响所有 ImageList 消费者；本批不改该共享组件，不能声称所有附件均已键盘化。Checkin 的他人图片预览已有原生 button/ModalSurface，保持原样。
- `TrainingCourseSettings` 的 API 操作错误通过 useStaffFeedback 公告，但无本地焦点；`TrainingCourseAnalysis` 的 operationError 同样只有 role=alert。后续若处理，只针对用户操作失败，不因后台 sources 加载错误反复抢焦点，保留确认、权限、epoch、质量/导出协议。
- 不根据颜色偏好或 CSS 数字宣称已证明视觉缺陷。实际 44px 触控面积、长文换行、对比度、390/1440（必要时 360/768）截图和键盘浏览器路径均待 C25 同环境验证。
- C22+C23 的联合迁移/恢复与真实反馈 HTTP、native IndexedDB、科学与负载缺项仍按[集成检查点](training-c22-c23-integration.md)的原边界处理。本轮无 DB、emit、安装、CI、PR、合并或生产操作。
