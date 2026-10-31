# 固定题数候选与真实前端宿主的最小接线

适用当前八项新身份：wordanalogy/wordmeaning/seriescomplete/readingcomp/proofread/cogest 1.1.0，wordproblem/logicdeduce 2.0.0。各组按实际修订版本接入，不能机械统一版本。

## 实际缺口与最终行为

源#477及只读核对的当前main `6cc6704a51a13fccebeb026d8a6e37efc1ac7938` 中，readiness只列25个旧精确前端身份。任务存在于generated registry并不自动使新版本能通过READY页面。这里给已有registry接口增加可选的任务自有readiness声明，resolver仅投影generated runners里显式声明的精确身份；保留旧表优先、未知版本拒绝和restart-required。没有第二份手工任务资格名单，没有新增授权/审核/发布门禁或数据库。

八项都是固定正式题数，改为新entry的现有manual完成模式。末题保存后，索引达到totalTrials，显示正式题已保存并由CognitiveRunner既有“完成测评”按钮确认。公共CognitiveRunner、controller.complete和FINAL重试机制不修改；新任务在说明页面之前处理已完成索引，所以COMPLETING卸载和失败重新挂载不会重练或重新交末题。旧entry保持原行为。

此前组件局部“onTaskComplete抛错后重试”的办法不能覆盖真实宿主：真实complete在常见失败路径正常resolve并更新状态，而且COMPLETING会卸载任务。该辅助办法已删除，以原有宿主完成动作解决真实问题，不保留失效的局部恢复流程。

首次试次保存false/throw的恢复仍留在任务内，保持同一首次响应/RT，只有显式保存重试。完成提交与单题保存是不同动作；这里没有把创建DRAFT或内容契约通过等同数据库施测验收。

## 最小验证与证据范围

- 真实CognitiveRunner与runnerReducer消费端测试共11个不同用例得到通过结果（原7例、数列1例、G4两例、认知估算1例，按受影响范围分别执行）：精确readiness、未声明注册不自动获得readiness、READY页面准备，以及八项末题推进→COMPLETING卸载→COMPLETE_FAILED正常返回→再次完成→结果页。断言末题只append一次。controller/API为合成替身，没有真实HTTP、存储或用户。
- 首轮6例为5通过/1失败，失败因应用题合成练习键误写。只修该fixture并复验该1例，同时增加READY页1例；两例均通过，其他5例不重跑，不改写原失败。
- 共享readiness原有3例通过，证明原25个静态身份、未知版本、全局键盘和restart-required行为保留。
- 受manual接线影响，仅复验G1两项第二题/宿主接管用例及G2两项36题正常用例。第一次G1两例与readiness三例通过，G2两例仍断言组件自动完成而失败；更新新版测试为宿主接管，另有上面的真实宿主测试承担结束保证，受影响两例复验通过。旧版测试断言不改。
- 最终前端定向类型36 roots/521 closure为0诊断，包含新宿主测试；第一次缺jest-dom matcher声明，补既有matcher import后通过，未削弱断言。后端36 roots/360 closure结果沿用，后续改动仅前端接线。
- 原浏览器短流程仍证明题面/练习/选择、首次原件重试和第二题；其“组件自动完成”的结尾不代表最终manual宿主。最终完成恢复由上述真实页面DOM状态测试证明，未冒称已重跑真实HTTP或浏览器全流程。原截图/日志保留私有环境。

所有本地检查仍处于Node24.19.0环境，低于仓库24.21.0运行时下限，不是正式CI资格。当前四项以源码候选交接，未安装、发布、迁移或部署。

## 母线后续需核的独立范围

#477原20项新engine在该冻结基础和上述main读取时也没有精确readiness声明。本轮仅为八项题库新增的显式声明机制接线，未改写原20项任务文件或把它们自动放行；该范围交母线另行收口。实际目标库与生产状态未查询。

数列接入后的最终五项闭包为后端47 roots/375 closure、前端45 roots/628 closure零诊断；具体数列源版本、fixture补齐与视觉证据见g3-series-integration-review.md。

G4取入后当前七项闭包为后端73 roots/412 closure、前端65 roots/648 closure零诊断；后续数据/推荐标志小修按其受影响范围核验，不重复全套。

认知估算接入后的最终八项闭包为后端84 roots/427 closure、前端74 roots/659 closure零诊断；仅新增认知估算相关检查，未复跑其他七项。
