# 计分与参数

- online_academic_self_efficacy：1–4，4题原分均分，范围1–7。
- online_intrinsic_motivation：5–9，5题原分均分，范围1–7。
- online_extrinsic_motivation：10–12，3题原分均分，范围1–7。
- online_negative_achievement_emotion：13–17，5题原分均分，范围1–7。
- planning_time_management：18–22，5题原分均分，范围1–7。
- metacognition：23–27，5题原分均分，范围1–7。
- study_environment：28–30，3题原分均分，范围1–7。
- online_effort_regulation：31–34，4题原分均分，范围1–7。
- online_social_support：35–39，5题原分均分，范围1–7。
- online_task_strategies：40–44，5题原分均分，范围1–7。

无反向；各题1–7原分，不将负性情绪反向。负性情绪更多=更多难受/焦虑/无助，外在动机更多不统一表示好坏。无44题总分；论文两个上位潜在因子不等于已提供可执行加总规则。

作者QSF十个实际反馈公式sum/n，分母4/5/3/5/5/5/3/4/5/5，仅静态读取，不执行或导入。一个未被反馈引用的元认知评分category不作第十一维。ForceResponse与IgnoreNullValues不等于作者允许改变分母；本包complete_required为平台保守政策，各维缺失则该维null，其他完整维可保留原分，但整体invalid时不生成报告解释，不补零、不插补。

作者Table8/QSF有4分经验建议，非中国常模/临床阈值。勘误09323-w明确Extrinsic→Intrinsic反馈纠错。作者跨维共用under4标题不可套到负性情绪；本包均score_only、none、无bands/百分位或评级。参数计划独立1.0.0，但引擎尚无none独立runtime版本字段，不能冒称完整参数轴已接入。
