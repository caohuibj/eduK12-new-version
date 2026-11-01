/** Additive vocabulary for #484's shared displayFor; no scoring or package-key
 * dispatch. Parent and teacher means always retain their own exact construct. */
export const CHILD_BUNDLE_DISPLAYS = {
  'gonogo.commission_errors': { label: 'Go/No-Go · No-Go 误按次数', sourceKind: 'COGNITIVE_METRIC', note: '不应按键的试次中实际误按次数。' },
  'gonogo.go_trial_count': { label: 'Go/No-Go · Go 试次数', sourceKind: 'COGNITIVE_METRIC', note: 'Go 遗漏率的真实分母。' },
  'gonogo.nogo_trial_count': { label: 'Go/No-Go · No-Go 试次数', sourceKind: 'COGNITIVE_METRIC', note: 'No-Go 误按率的真实分母。' },
  'flanker.flanker_effect_ms': { label: 'Flanker · 干扰效应（毫秒）', sourceKind: 'COGNITIVE_METRIC', note: '不一致条件减去一致条件的反应时；保留负差值，不推断同龄等级。' },
  'flanker.congruent_accuracy': { label: 'Flanker · 一致条件正确率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, note: '原始事件比例。' },
  'flanker.incongruent_accuracy': { label: 'Flanker · 不一致条件正确率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, note: '原始事件比例，分别保留两个条件。' },
  'flanker.omission_rate': { label: 'Flanker · 遗漏率', sourceKind: 'COGNITIVE_METRIC', range: { min: 0, max: 1 }, ratio: true, note: '需要作答时未作答的原始比例。' },
  'flanker.rt_median': { label: 'Flanker · 中位反应时（毫秒）', sourceKind: 'COGNITIVE_METRIC', note: '本次反应时，不能换算为能力等级。' },
  'chexi.parent.working_memory_mean': { label: 'CHEXI · 家长观察：工作记忆相关困难', sourceKind: 'SCALE_SCORE', range: { min: 1, max: 5 }, note: '13题直接均分，包含计划；高分表示家长观察到更多困难。' },
  'chexi.parent.inhibition_mean': { label: 'CHEXI · 家长观察：抑制相关困难', sourceKind: 'SCALE_SCORE', range: { min: 1, max: 5 }, note: '11题直接均分，包含调节；保留家庭及日常生活情境。' },
  'chexi.teacher.working_memory_mean': { label: 'CHEXI · 教师观察：工作记忆相关困难', sourceKind: 'SCALE_SCORE', range: { min: 1, max: 5 }, note: '13题直接均分，包含计划；高分表示教师观察到更多困难。' },
  'chexi.teacher.inhibition_mean': { label: 'CHEXI · 教师观察：抑制相关困难', sourceKind: 'SCALE_SCORE', range: { min: 1, max: 5 }, note: '11题直接均分，包含调节；保留课堂及学校活动情境。' },
}
