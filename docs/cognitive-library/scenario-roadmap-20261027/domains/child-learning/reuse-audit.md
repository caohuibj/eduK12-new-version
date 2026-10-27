# 现有项目去重：先复用，再识别缺口

只读基线：`a0130ea6603d7e37fd4f900d8694b5b7d490c51e`，2026-10-27 重新 `ls-remote` 与 fetch；main 为 `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`。24 个旧项目不含 fake，不按 profile/scoringVersion 重复计数。下列是**实际源码的协议辨识**，不是运行验收、科学效度、材料清权或当前可施测证明；历史 PASS 未作为本轮验收。

## 儿童学习相关能力结构

仅以韦氏/瑞文覆盖的能力结构作选题参照，不复制题库、商标包装、分测验分数或常模，不宣称数字等价版。

|研究问题|首先复用的项目|解释边界|
|---|---|---|
|目标选择、抗干扰、持续注意|Flanker、Go/No-Go、CPT、ANT、MOT、视觉搜索|协议分别解释；不合成“注意力总分”，不作儿童诊断|
|暂时保持、顺序操作、更新|顺背 memory、倒背 digitbackward、Corsi、N-Back、空间精度工作记忆|操作、空间与输入负担不同，不相互等同|
|学习、即时/短延迟回忆|词表、图形位置配对、图片顺序、连续再认|现有学习轮次已覆盖；词表的语言和打字负担不能忽略|
|加工速度|反应速度、图形模式比较|同时阅读准确率及真实用时；不直接采用旧 Product Index|
|规则归纳、空间推理、规划|矩阵、心理旋转、Tower；规则分类、任务转换|图形规则、空间旋转、规划和明示规则切换不是同一过程|

## 24 个旧项目：实际消费者与区别

下表路径相对 `server-version/`。每项均检查了 `backend/src/modules/cognitive/tasks/<id>/task-package.json`、`package.ts` 与执行语义，以及下列前端消费者和后端计分路径的任务结构。这里只核验去重直接必要的刺激/响应/条件，不评审整条运行链。完整路径、Git blob 及文件 SHA-256 见 `review-evidence.json`。

|ID|实际前端任务文件（`frontend/src/modules/cognitive/tasks/`）|实际后端（`backend/src/modules/cognitive/scoring/`）|源码辨识／本领域决定|
|---|---|---|---|
|reaction|reaction/ReactionFrameTask.tsx|reaction.v1.ts＋reaction.v1_1.ts|变绿后首次反应、提前按；复用速度近邻，不当 PVT|
|memory|memory/MemoryTask.tsx|memory.v1.ts＋memory.v1_1.ts|数字顺序回报、跨度推进；复用顺序保持|
|stroop|stroop/StroopTask.tsx|stroop.v1.ts＋stroop.v1_1.ts|颜色/字义一致与冲突；复用干扰控制|
|gonogo|gonogo/GonogoFrameTask.tsx|gonogo.v1.ts|Go/No-Go 反应与抑制；已有，不新增 SART|
|cpt|cpt/CptFrameTask.tsx|cpt.v1.ts|目标检测、区块及命中/误按；已有，AX-CPT 归临床领域|
|nback|nback/NbackTask.tsx|nback.v1.ts|N 条件下目标/非目标、按负荷统计；复用更新|
|corsi|corsi/CorsiTask.tsx|corsi.v1.ts|空间序列点击与跨度；复用空间保持|
|sst|sst/SstTask.tsx|sst.v1.ts|Go/Stop、SSD/SSRT；已有，不重复建儿童抑制版|
|taskswitch|taskswitch/TaskswitchTask.tsx|taskswitch.v1.ts|数字奇偶/大小提示规则，switch/repeat；不是数列补全|
|patterncompare|patterncompare/PatterncompareTask.tsx|patterncompare.v1.ts|图形相同/不同、持续时间内正确量；复用速度|
|flanker|flanker/FlankerTask.tsx|flanker.v1.ts|中心方向与侧翼一致/冲突；复用抗干扰|
|cardsort|cardsort/CardsortTask.tsx|cardsort.v1.ts|明示颜色/形状线索、切换与重复，左右目标为红圆/蓝星；不是传统 DCCS|
|digitbackward|digitbackward/DigitbackwardTask.tsx|digitbackward.v1.ts|数字倒序、每跨度两题；不是一般推理或数列归纳|
|picturesequence|picturesequence/PicturesequenceTask.tsx|picturesequence.v1.ts|学习同组图片顺序、相邻/位置正确与短延迟；已覆盖顺序学习|
|pairedassociate|pairedassociate/PairedassociateTask.tsx|pairedassociate.v1.ts|图形—位置映射、学习轮次及可选短延迟；已有学习过程|
|matrix|matrix/MatrixTask.tsx|matrix.v1.ts|3×3 图形缺格四选一，progression/alternation/combination；已有矩阵，不新增开放矩阵 runner|
|mentalrotation|mentalrotation/MentalrotationTask.tsx|mentalrotation.v1.ts|旋转角度×镜像、same/mirror；已有空间推理|
|tower|tower/TowerTask.tsx|tower.v1.ts|移动序列、最少步解与违规；复用规划，不当一般智力|
|trailmaking|trailmaking/TrailmakingTask.tsx|trailmaking.v1.ts|顺序连接 A/B、步骤用时/错误；复用视觉搜索与转换|
|reversallearning|reversallearning/ReversallearningTask.tsx|reversallearning.v1.ts|习得/反转、概率反馈；已有反馈学习|
|bart|bart/BartTask.tsx|bart.v1.ts（两个 scoring 身份）|充气、兑现与爆破；不是数列推理，也不是气球努力|
|wordlist|wordlist/WordlistTask.tsx|wordlist.v1.ts|中文词表、分轮自由输入、即时/延迟回忆及侵入；已有非临床学习记忆|
|lexicaldecision|lexicaldecision/LexicaldecisionTask.tsx|lexicaldecision.v1.ts|中文真词/伪词判断与词频带；不是言语关系推理|
|emotionrecognition|emotionrecognition/EmotionrecognitionTask.tsx|emotionrecognition.v1.ts|类别辨认；已有，情绪素材由 EI 领域负责|

矩阵还直接读取共享 `frontend/src/modules/cognitive/tasks/shared/prng.ts` 的 `MatrixRuleFamily`、`MATRIX_BANK`、`matrixSequence`，确认是图形符号规则，不是给数列加名称。卡片分类直接读取其四练习、规则 cue 与正式首次左右响应；配对/图片/词表直接读取学习轮次与 delayed 分支，故不再提出“增加重复学习记忆”作为缺口。旧文件中的总分或质量阈值不作为新方案依据，不修改旧实现。

## 11 个已有内容候选：全部排除新开发计数

每项检查实际 `backend/src/modules/cognitive/content-candidates/<id>/scorer.ts` 与前端任务文件的存在、imports/入口及与既有 README 的协议关系。设计期 README 的“未开发”可能早于后续代码，不能用旧措辞覆盖实际候选文件；同样，文件存在不证明当前验收或接入。

|已有候选目录 ID|实际前端文件|本领域处理|
|---|---|---|
|mot|mot/MotTask.tsx|已有追踪候选；保留暂停 WIP 和原负责人|
|enumeration|enumeration/EnumerationTask.tsx|已有短时数量报告，非数列规则推理|
|continuous-recognition|continuous-recognition/RecognitionTask.tsx|已有连续图像再认；素材及接入状态另核|
|ant|ant/AntTask.tsx|已有注意网络候选；不动暂停 WIP|
|precision-working-memory|precision-working-memory/SpatialMemoryTask.tsx|已有记 1/5 个位置与精度回报；复用记忆覆盖|
|balloon-effort|balloon-effort/BalloonEffortTask.tsx|已有努力/收益选择，非推理或学习记忆缺口|
|gradcpt|gradcpt/GradCptTask.tsx|已有持续注意候选，跨领域引用|
|attentional-blink|attentional-blink/AttentionalBlinkTask.tsx|已有时间选择候选|
|visual-search|visual-search/VisualSearchTask.tsx|已有搜索与定位候选|
|dual-arrow|dual-arrow/DualArrowTask.tsx|已有单双任务候选|
|horizon-exploration|horizon-exploration/HorizonTask.tsx|已有探索决策候选；信心/信息采样归职业领域|

上述为 24＋11 个项目，**不是 35 个独立能力、已验证测验或在线入口**。本轮无集中测试、注册、导入或后台标签接线；不复用历史 PASS 作为当前验收。已有代码/图片/题库/译文许可没有在此全库重新清权，复用建议只表示先检查既有内容，不构成公开分发授权。

## 本轮只保留 1 个缺口

**优先图审：原创数列规则推理。** 当前数值任务中，顺背/倒背是记忆，奇偶/大小是明示分类，点数是短时数量报告；它们均不要求从数列关系推出下一项。新增的是数值规则关系协议，而非第二个矩阵 runner。它与已有矩阵共享推理研究场景，不能加总成更多独立构念。

不另立学习记忆项目；DCCS 仅作低龄协议储备。PhenX 传统版是访员＋实体卡，指导两例、转换前六张＋转换后六张，符合条件后判断转换表现；当前 cardsort 是逐题明示规则的计算机变式。触屏 DCCS 如未来需要，应另提交改造图审，不继承传统判定或年龄适用性，本轮不把它凑作第二个真实缺口。心与花只引用原线程 `01a17ad0-5b23-708e-ae91-fcbb105da090`，不开发。
