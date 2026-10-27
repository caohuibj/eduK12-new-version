# 实际代码去重：24旧项目＋11既有候选

读取快照 `a0130ea6603d7e37fd4f900d8694b5b7d490c51e`；main 远端重核 `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`。下表检查任务实际指导／配置／回应分支与计分关键路径，限定用途为范式去重，**不是完整代码审计、实际施测、科学有效性或当前验收**。逐文件 blob 与 SHA-256 见 [read-basis.json](read-basis.json)。

旧项目路径约定：F=`server-version/frontend/src/modules/cognitive/tasks/<ID>/`，B=`server-version/backend/src/modules/cognitive/scoring/<ID>.v1.ts`。查阅 F 的 `*Task.tsx`／registry 与 B；registry 自动生成 25 个家族中排除 fake 工具项，保留24个真实旧项目。不同engine历史版本、frame实现和profile不另计项目。

| 旧项目 ID | 本轮实际代码观察／去重处理 |
| --- | --- |
| reaction | 等待后圆点变绿才按；默认等待700–1500 ms，按试次预算。不能直接改名PVT或把短游戏当10分钟警觉协议 |
| memory | 数字按原顺序输入；每长度两题、至少一题正确升级。已覆盖数字顺背，不新增近义短时记忆任务 |
| stroop | 忽略字义报字体颜色，一致／冲突；与SART的频繁单按钮/罕见不按不同 |
| gonogo | 默认120、No-Go比例0.25；按完整seed核各类，分Go遗漏与No-Go误按；已有抑制近邻，不照搬其总分或缺失填0行为 |
| cpt | 字母X为回应目标，其他不按；默认180、目标比例0.2；已有目标遗漏／非目标误按、RT波动／块斜率，与SART回应频率相反；非AX上下文协议 |
| nback | 与N个之前相同时按，按nLevel升难度；覆盖更新和匹配，不能把AX线索保持等同N-back |
| corsi | 方块按出现顺序重现；跨度进阶，已覆盖空间广度 |
| sst | 箭头先准备方向回应，迟发红色停止信号；SSD阶梯重建、SSRT积分法，与预先知道3不按不同；不重写停止任务 |
| taskswitch | 按“奇偶／大小”线索在数字规则间切换；已有执行转换近邻 |
| patterncompare | 两图形判断相同／不同；固定约60秒，视觉细节辨认，不新增速度配对近义任务 |
| flanker | 五箭头中只答中央方向；一致／冲突及RT差，与ANT近邻但有独立任务包 |
| cardsort | 明示颜色或形状规则匹配左右目标；已有规则分类，不能改名临床WCST或另归DCCS本领域 |
| digitbackward | 数字逆序输入、跨度进阶；已覆盖倒背，不新增另一“工作记忆广度”实现 |
| picturesequence | 自制日常场景顺序学习、多轮及可配延迟；与一般儿童学习记忆归属交叉，先复用 |
| pairedassociate | 抽象图形与位置配对、多轮学习及可配延迟；临床相关配对问题可先研究此任务，不复制受限临床题库 |
| matrix | 内部规则生成矩阵，选缺失图；不是整体智商或临床记忆任务 |
| mentalrotation | 图形旋转同一／镜像判断；已覆盖旋转比较 |
| tower | 圆盘移到目标状态，合法移动／步数；规划近邻不在本领域新增 |
| trailmaking | A按数字、B数字字母交替，逐步时限；已有搜索与转换，不新增纸笔TMT电子副本 |
| reversallearning | 左右符号概率奖励，中途反转；已有反馈学习，不能把自由偏好按奖励高低判对错 |
| bart | 继续泵压或现金化，爆破阈值；风险取舍，与努力气球不同，不在本领域新建 |
| wordlist | 中文词表逐词学习、自由输入，多轮及可配延迟；精确词项匹配、不做同义纠错；一般学习记忆先归儿童领域，临床研究仅交叉引用 |
| lexicaldecision | 中文真词／伪词分类；语言负担与记忆测量分开，不把识词困难解释成记忆障碍 |
| emotionrecognition | 版本化合成面孔六类分类，不推共情／人格；不作为本领域临床替代任务 |

## 11项既有候选

候选路径 C=`server-version/backend/src/modules/cognitive/content-candidates/<目录>/protocol.ts, scorer.ts`，F 同上。以下读取实际源文件，研究／体验计数只用于识别既有项目，**不作新批准或验收**。

| 候选目录／稳定ID | 已有代码辨识与本轮处理 |
| --- | --- |
| mot／attention-mot-flower | 固定目标追踪，45／9；原生内容候选存在；保留原负责人，暂停WIP不动 |
| enumeration／attention-enumeration-flower | 掩蔽点数，100／25；recipe变式属于同项目，不作为第二新增项目 |
| continuous-recognition | 连续图像新旧，重复命中／首次误认与有符号命中减误认；旧／guided版本同项目；优先复用记忆问题 |
| ant／attention-ant-pebl | 4线索×2位置×2方向×3侧翼，288／48；guided练习8与旧24并存；不能按旧文档认定还没开发；暂停WIP不动 |
| precision-working-memory | 空间位置延迟估计，400／40，圆周有符号误差；已有精度记忆候选 |
| balloon-effort | 高低努力选择与按压执行，72／18；不把偏好或收益当正确标准，不与BART混同 |
| gradcpt／attention-gradcpt-tmb | 城市按、山不按，300／100，800ms连续渐变；科研268/32、体验90/10；已有持续注意近邻，不重新开发 |
| attentional-blink／attention-blink-holcombe | 快速字母流双目标，200／50；T2以T1正确作条件分母，不另造“注意缺陷筛查” |
| visual-search／attention-visual-search-pebl | 搜索后定位，180／36；已有实际候选，不能把历史暂停说明当当前未开发事实 |
| dual-arrow／attention-dual-task-pebl | 蓝单／红单／双通道，300／60；独立首答与有符号dual−single差，非新ADHD任务 |
| horizon-exploration | 4指定后自由1/6次，320／40；探索/利用不判标准偏好，不另起奖励学习记忆近义任务 |

原生 definitions 当前明确列 MOT、enumeration及recipe、recognition及guided、ANT及guided；不以存在协议／scorer推断其他候选已经注册、四入口接通或上线。MOT、ANT、gradCPT等已有实现与历史开发证据均保留原身份；本轮未跑它们的测试，也没有新当前PASS。

结论：只优先补SART图审；PVT与AX-CPT保留为本领域后续候选。新临床记忆任务先核唯一归属与现有任务差异，不增加一个泛称“记忆障碍检测”。
