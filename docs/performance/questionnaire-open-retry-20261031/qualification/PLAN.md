# PR442 最小合并资格准备

当前 main：7a69762e898d1b1fe1c1aab2b51d2ce9db0d0d03（PR439 已合并）。
本地合入后，442 的两个业务文件与原 5-pass 执行时逐字一致；439 的
School 登录/后端变化不在这个问卷定向测试的真实加载模块中（FinalQuestionnaireAssessment
仍由该测试 mock）。保留原合成测试和失败原件，不为报告格式重跑应用 cases。

原 frontend types 清单包含 School 输入，故不得宣称其完整类型树未变化。
此次实际仅补一次整合后的 app types，原 argv/开始结束/exit/logSHA 和完整
frontend componentTree 由执行程序即时写入 qualification/frontend-types.json，
exit 0，静默日志原样保留。没有后端业务修改，不运行后端编译或任何完整 suite。

控制改动只登记既有 onboarding：固定 base、两个业务文件及本证据目录、
source 全量 blob/mode、component tree、控制 checkpoint。文本 reader 接纳原 5-pass
汇总，不把未输出的逐 case 身份或旧 Vitest 数字退出码编造成 JSON reporter。
旧首读失败 1 failed/3 passed、缺依赖 types 失败、真实 types terminal 摘录均保留并验 hash。
reader 新增定向负例覆盖原件/摘要/源码漂移，保留 PR439 既有规则。

准备后交父任务独立核固定候选；与 PR437 共享控制登记，CI 冻结前协调顺序。
拟运行：scope、原件 admission、变化源码/控制的 security-extended CodeQL、原稳定 merge gate。
不运行 build/image/数据库/browser/旧完整 suite，不 APPROVE、不部署。Draft 直到独审定稿。
