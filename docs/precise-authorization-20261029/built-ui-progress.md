# 四入口编译页面与固定配置布局

基线 `5a0ea9f1c0136afde277f2246006aca5197a1091`。开始时 frontend tree
`04a04b582cf060feca509226f64c85ef1dfe31d2` 与 `c21bccf7` 完全一致；先复用原类型/
组件证据并构建该输入。浏览器截图发现 Training 用空状态类渲染真实配置，造成
过量留白、按钮层级不足。现改成紧凑卡片、分栏 C/P/R、明确操作按钮及分页，
共用 ApprovedScaleAxes 加上响应式控件布局。最后视觉复核再把 Training 弹窗字段
排成纵向表单。没有修改选择/授权/替换/恢复状态机、API、权限或运行时。

最终 frontend tree：`160d68b013570acdd1dbcb1ba5461df025a96635`。

验证范围与真实结果：

- Vite 先后按三个实际不同的输入各构建一次（基线、共用布局/卡片、Training 弹窗）；
  27.03 / 30.43 / 28.74 秒，均退出 0。生成的大 chunk 提示保留，不借此重构分包。
- 共用布局产物在 Chromium 151.0.7922.173 / Playwright 1.62.1 上，四入口
  `1280×900` 与 `390×844` 共 8 项通过：加载对应管理员页面，按 C/P/R 查找，明确
  确认精确来源，并选择当前夹具接收者及填写业务配置名。文档宽度未超出视窗。
- 最后一处只影响 Training 弹窗的修改后，再构建一次并只复验 Training 桌面/手机
  两项，均通过。其余六项使用上一产物结果，未改写为在最终产物执行。
- 最终 app TypeScript 检查退出 0；变更 TSX lint 退出 0，但保留原异步 epoch ref
  清理处的一条 `react-hooks/exhaustive-deps` warning。该状态机未在本次布局工作中
  修改或抑制警告；不能称 lint 零警告。
- Training 实际浅/深主题随夹具偏好记录；Survey 桌面记录仍为 dark。因此本矩阵
  是屏宽/交互证据，不声称每个产品浅深模式均分别完成。

测试严格区分页面呈现和权限实证：静态产物直接由本地文件供应，所有浏览器 URL
在导航前截获，canonical 外观地址不连接生产；未知 API 直接失败，WebSocket 被
截断，service worker 不启用。最终成功记录为未知 API 0、外部资源请求 0、授权
写请求 0。显示的工具、管理员、接收者与学校全部为明确合成夹具，不证明素材已
装载、正式 MFA/登录或真实接收者可获授权。后端权限仍以各阶段 PostgreSQL/HTTP
证据判断。

原失败完整保留：初版夹具遗漏 capabilities 且选取嵌套 label 的 exact 匹配不当；
下一轮误把 Survey 的完整 sourceKey 当作普通 UUID；再下一轮漏了教育接收者接口
中的组合 ID 路径。分别补夹具/选择器后，只继续失败或未执行入口；不修改页面来
迁就测试，不吞掉未映射请求。四入口桌面基线分别通过后才实施已观察到的样式改动。

命令、时间、失败和各产物结果在 [raw](built-ui-raw.json)，文件/大小/hash 在
[artifact manifests](built-ui-artifacts.json)，最终源码/范围在
[verification](built-ui-verification.json)。清单是执行后补录的本地证据，不是签名
依赖证明或正式 Actions 资格。没有前端/后端全套重放、CI 激活、PR、合并或部署。

代表截图均为合成页面：

- [Training 桌面弹窗](built-ui-screenshots/training-desktop-light.png)
- [Training 手机弹窗](built-ui-screenshots/training-mobile-dark.png)
- [Teacher 手机固定配置](built-ui-screenshots/teacher-mobile-dark.png)

剩余：与实际后端连通的完整浏览器授权/MFA、runtime DB 角色、同环境性能分位数
与查询预算、正式有界 CI/PR，以及认知精确 profile 四入口仍未完成。趣味 R 尚未
自动注册；此 UI 使用已批准组合选择语义，不新增任何未批准内容或生产使用权。
