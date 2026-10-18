export type TrainingVariantUnit = { type: 'FORM_SECTION' | 'ITEM'; id: string }
export type TrainingVariantGroup = {
  variantKey: string
  label: string
  weight: number
  units: TrainingVariantUnit[]
}
export type TrainingVariantConfig = { schemaVersion: 1; groups: TrainingVariantGroup[] }
export type TrainingAuthoringUnit = {
  id: string
  type: string
  label: string
  contextSection?: boolean
}

export function variantUnit(unit: TrainingAuthoringUnit): TrainingVariantUnit {
  return { type: unit.type === 'FORM_SECTION' ? 'FORM_SECTION' : 'ITEM', id: unit.id }
}

export function variantUnitKey(unit: TrainingVariantUnit): string {
  return `${unit.type}:${unit.id}`
}

export function newTrainingVariantGroup(
  groups: TrainingVariantGroup[],
  units: TrainingAuthoringUnit[],
): TrainingVariantGroup {
  let number = 1
  while (groups.some(group => group.variantKey === `group_${number}`)) number++
  return { variantKey: `group_${number}`, label: `分组 ${number}`, weight: 1, units: units.map(variantUnit) }
}

export function createTrainingVariants(units: TrainingAuthoringUnit[]): TrainingVariantConfig {
  const first = newTrainingVariantGroup([], units)
  return { schemaVersion: 1, groups: [first, newTrainingVariantGroup([first], units)] }
}

/** Select whole units in composition order; shared context is never optional. */
export function toggleTrainingVariantUnit(
  group: TrainingVariantGroup,
  target: TrainingVariantUnit,
  checked: boolean,
  units: TrainingAuthoringUnit[],
): TrainingVariantGroup {
  const selected = new Set(group.units.map(variantUnitKey))
  if (checked) selected.add(variantUnitKey(target))
  else selected.delete(variantUnitKey(target))
  return {
    ...group,
    units: units.filter(unit => unit.contextSection || selected.has(variantUnitKey(variantUnit(unit)))).map(variantUnit),
  }
}

export function validateTrainingVariants(
  config: TrainingVariantConfig | null,
  maxAttempts: number,
  units: TrainingAuthoringUnit[],
): string | null {
  if (!config) return null
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) return '最多作答次数须为 1–100 的整数。'
  if (config.groups.length < 2 || config.groups.length > 8) return '请设置 2–8 个分组。'
  if (!units.length) return '请先添加内容单元，再启用按权重随机分组。'
  const orderedKeys = units.map(unit => variantUnitKey(variantUnit(unit)))
  const covered = new Set<string>()
  const contextKeys = units.filter(unit => unit.contextSection).map(unit => variantUnitKey(variantUnit(unit)))
  if (contextKeys.length && orderedKeys[0] !== contextKeys[0]) return '请先将共享背景区段置顶，再配置分组。'
  const groupKeys = new Set<string>()
  for (const group of config.groups) {
    if (groupKeys.has(group.variantKey)) return '分组标识重复，请重新配置分组。'
    groupKeys.add(group.variantKey)
    if (!group.label.trim() || group.label.length > 200) return '每个分组名称须为 1–200 字。'
    if (!Number.isInteger(group.weight) || group.weight < 1 || group.weight > 100) return '每个分组的权重须为 1–100 的整数。'
    if (!group.units.length) return `“${group.label}”至少需要一个完整内容单元。`
    const selectedKeys = group.units.map(variantUnitKey)
    const expectedKeys = orderedKeys.filter(key => selectedKeys.includes(key))
    if (JSON.stringify(selectedKeys) !== JSON.stringify(expectedKeys)) return `“${group.label}”的内容已变化，请按当前内容顺序重新选择。`
    if (contextKeys.some((key, index) => selectedKeys[index] !== key)) return `“${group.label}”必须以完整共享背景区段开头。`
    selectedKeys.forEach(key => covered.add(key))
  }
  const uncovered = units.filter(unit => !covered.has(variantUnitKey(variantUnit(unit))))
  if (uncovered.length) return `所有内容单元须至少在一个分组中出现。尚未选择：${uncovered.map(unit => unit.label).join('、')}。`
  return null
}
