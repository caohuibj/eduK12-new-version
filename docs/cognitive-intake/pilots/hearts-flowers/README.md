# 心与花工作流试点（2026-10-29）

原内容候选：PR368，1388d5db6f845b8d907f0e4090e4fd727aea8926。未合并main，不冒称已公开入库。

## 新证据
- 双profile原配置检查：32/57正式、均8练习，旧原件保留，不重跑。
- 隔离PG17草稿安装及续办：实际安装DRAFT/GRANT后保存回执，退出进程并重启PG，新进程先回读再计划/一次刻意幂等apply，均ALREADY_PRESENT，配置1/安装事件1，完整行及更新时间不变。结果JSON在本目录。不是正式目标数据库。
- 说明改为中英四节，四例与规则/时序/输入/练习门槛未改；新增4个组件案例PASS。
- 报告复用既有温暖文案，保留真实统计图，重复条件文本和表格折叠；报告组件2PASS、受影响practice/retry/final/render消费者2PASS/2filtered、选中类型闭包PASS。
- 本批不改backend、scorer、协议、generated、参数或报告数据版本。只是尚未发布候选的阅读界面修订，身份/公开投影仍由现有isHFReport严格校验。

## 不通过或未执行
- 首次续办脚本相对路径错误在服务加载前退出；修正后只续安装，不重跑成功迁移。
- 首次新增报告测试错误假设jsdom会在role查询中隐藏closed details里的table；改为断言实际details.open=false及表在该details内，真实视觉仍单独待验。原FAIL保留。
- 独立SSR预览首轮classic JSX缺React，改为与项目一致的automatic JSX后成功。SSR不是浏览器。
- 新浏览器视觉核验BLOCKED：本地Chromium进程socket权限受限；申请执行后环境包装器read-only错误，未进入测试；云端工具禁止file协议且无法连接本执行环境localhost。未关闭浏览器sandbox或调整系统权限。没有新截图/触屏/真实HTTP旅程PASS。
- 公开库发布、分配、报告持久化、COS归档、main整合与正式CI尚未执行。

## 下一步
在可用的受控浏览器执行同一输入的说明、三态报告和窄屏/放大阅读检查；不重跑计分全组或PG续办。内容候选整合到目标代码后，按真实CI范围及授权做正式安装/发布/公共可见/分配回读。Project工作流已明确这些独立状态，无执行权限时交付包和准确缺项。
