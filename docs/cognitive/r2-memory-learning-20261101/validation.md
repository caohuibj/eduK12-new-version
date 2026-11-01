# R2 定向验证记录

执行环境 Node **v24.21.0**，Vitest **4.1.11**，锁定依赖复用，无安装/数据库/生产连接。基线与输入范围见README；公共generated未修改。合成fixture仅用作工程记录，不能推出测验信效度或真实用户时长。

1. `vitest run src/__tests__/cognitive/r2-memory-report-reading.test.ts --reporter=verbose`：**3 PASS / 0 FAIL**。第一场景用11项各1份现有scorer fixture走真实三层投影；其余检查null/0、混淆差值隐藏、受限n-back机会数以及实际报告冻结。
2. 后续改动仅是指标标签/说明、声音n-back示例与图解、质量提示措辞，因此只补第一渲染场景：**1 PASS / 2 FILTERED / 0 FAIL**，未重跑未变冻结/质量逻辑。最终命名改为`participant-presentation-r2.ts`，符合现有任务文件名允许字符，仍用同一R2版本。
3. 11份新R2文件的严格局部TypeScript检查通过：`tsc --noEmit --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --strict <11 task-local participant-presentation-r2.ts>`。这是局部类型检查，不称全应用BE/FE类型资格。
4. 使用现有`manifests.cjs`的只读`discover()`和内存`projections()`：11份manifest均可解析/导出新的报告文件；未调用`generate()`写共享文件。最终公共绑定仍由集成负责人生成。
5. 实际前端组件与CSS的隔离浏览器预览：桌面1280px查看11项介绍和11项报告，代表手机390px查看词表介绍、运行广度/声音n-back报告与视觉记忆方法报告；页面异常0。最终标签/示例修改后仅复查受影响报告及代表手机。图表来自源码合成fixture，不是端到端用户施测或真实听觉时序测量。源码runner经预览bundle编译，不称完整前端build。

保留的失败/限制：最初一次命令cwd误配，未创建测试；之后新测试第一轮3 FAIL均为Vite动态import缺`.ts`扩展，修正导入后上述3场景通过。最初预览未引入产品实际使用的Tailwind preflight，词表介绍出现32px溢出；补入既有preflight后同390px页面不溢出，产品布局代码未改。没有靠改产品CSS掩盖预览缺样式问题。

截图/浏览器诊断原件只保留本地，未上传环境原件。没有完整CI、安装、公开发布、真实被试计时、设备音频校准、常模或信效度实测；不能据此给11项全部科学GO。sentencecheck条件混淆、visualwm练习首题泄漏、短音n-back目标不足与旧治理书目边界见README。

核心组合增量：仅将sentencecheck/visualwm/auditorynback三份R2适配临时放入独立core工作树，与三个新1.1.0身份正常生成后，6个新E/R冻结/报告组合及3个旧R2身份边界通过；R2旧缺陷措辞不套用于修复后的新身份。公共generated及临时侧文件已还原，未重复其余8项报告。
