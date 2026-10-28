# MOT 原生前端与原件归档客户端：第一增量

本页仅记录云端候选开发，未合并、未部署。后台路由/授权/对象幂等由主线及 archive service 负责。软件单测使用合成数据，hook 单测显式替换耐久检查以隔离生命周期；它们不证明真实 IndexedDB 或 HTTP/COS 保存。

MOT 运行复用既有校准、2 次练习与 9/45 次正式流程，未修改刺激、速度、采集或 scorer。独立 native registry 只映射 `mot/1.1.1/1.1.0`；teacher 配置选择按实际 profiles 选体验/研究，保留 legacy standard。真实冻结 `sessionSnapshot`、`attemptEpoch`、`definitionHash` 由服务器提供，不从 CSS/onset/本地随机值派生。每条 Envelope 保留原采集开始/结束、flags 与中断，绕过 legacy 在提交时推算 onset 的 wrapper。运行中任务使用统一中性环境，四入口配色不进入刺激区域。

`prepareFinalArchive` 仅把既有全部 formal/practice `{core,raw}` 封存到现有 FinalDraft META 对象，不增加 IndexedDB 版本/store/index，也不代表 COS 成功。原件 hash 使用既有 noble SHA256 与相同有限 JSON canonical 排序规则。原始 MOT 专用耐久 store 也继续保留既有记录，本增量不承诺清理它。

FINAL 成功必须有真实 COMPLETED、session/epoch/submission/definition 与 payloadHash 回执，或同身份已完成服务器读回；void resolve、本地 ACK、客户端声明都不足。当前末次本地保存与 FINAL 分开重试；全部 formal 已 local ACK 后刷新只允许提交原记录，不挂任务、不再次曝光。部分进度仍按既有 restart-required 保守处理。

服务器 core 成功即展示冻结报告；完整原件独立自动尝试上传，也可按钮重试。POST 复用 apiClient，UTF8 JSON Blob / `application/octet-stream`，不走全局 2MiB JSON parser、不做 base64。GET 使用同 identity。只有返回完整 `confirmed` 回执且 session/epoch/submission/definition/rawSha256 与本地封存一致，才清通用 FINAL 草稿。失败或 pending 保留原件；通用 delete/Training TTL 也不能删除未归档原件。旧无 sidecar legacy 保持原清理路径。无 IndexedDB 时 native 阻止开始，不把 Memory fallback 当耐久；不承诺关闭浏览器后自动归档。

本阶段新增 24 项、直接旧消费者 18 项各有实际通过；先前 1 项 runtime 失败与 4 条 fixture 类型失败保留，均仅定向修复/复验。原件见 unit-evidence.json 与 types 文件。主线后续统一验证实际 UI 类型，并做隔离真实 HTTP/浏览器旅程；外部 COS、真实设备时序、许可/年龄/人群效度未在本阶段验证。


## 实际 HTTP/浏览器增量

`native-mot-client-review.cjs` 已退出 0，真实 domain 前端通过 Vite 代理访问隔离后端/PG：真实登录 cookie、START、2 次练习＋9 次正式原始键盘输入、一次 FINAL、冻结报告，以及原件 POST 503 → 保留真实 IndexedDB → 同身份重试 200 → generic FINAL draft 清除。API 回执和计分没有浏览器替身；只有 COS uploader 为明确的 fake。软件 clock 和合成校准不证明真实设备时序。实际报告为 limited（既有 scorer 排除一条速度8记录），未把收到9条写成9条有效，也未改变质量门控。

390/820/200%报告截图已实际查看，横向宽度为820/820，未溢出。截图黄条明确合成 clock/fake COS。原件见 browser/review.json、4张PNG与 http-browser-evidence.json。该 slice 不包括完整 App Auth shell/CSRF；现有 apiClient 的 /api/auth/csrf 404 保留在轨迹，不声称已验证生产CSRF。轨迹还因原 filter 包含 source 模块 /src/api/client.ts，不能当成API路径。外部 COS、完整发布/部署、手机原生Safari/真实平板硬件均未验。

观察到既有通用报告直接呈现长小数 `2.6666666666666665`；建议后续只调整呈现精度，不改 raw/scorer。当前增量未新增上游代码、素材、字体或依赖，不含 OMI/NC-SA 图片。后续1项本地归档状态写失败用例已PASS，故累计新增25项（18 archive、5 hook、2 API）＋直接旧消费者18项已PASS；详见保留的分阶段证据，不重新执行已通过内容。


## 语言接线边界与并发增量

当前 `NativeMotRunner` 没有向 `MotTask` 传入 language，真实运行入口默认中文。candidate 组件已有 English props，不等于产品双语链路已接通或已验证；本轮不从浏览器 UA 推断语言，也不修改已冻结协议。后续最小方案需先确认服务器已有且可信的本次施测语言元数据，再由 TaskContext/NativeMotRunner 原样透传已有 language prop；若不存在此字段，应先明确冻结和报告兼容含义，不能临时加入未核实的客户端权威。

页面交接时归档 Notice 可能重叠。新增 `single-flight-followup/` 仅为同 store/draftKey 复用在途上传 promise，成功/失败后释放；身份、hash、receipt gate不变，不把草稿缺失当成功。新增2项定向PASS，原25项和旧18项及真实2+9原件不重跑、不覆盖；不同阶段源码哈希分别保留。
