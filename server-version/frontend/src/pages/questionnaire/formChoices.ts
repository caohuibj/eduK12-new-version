export type ChoiceDraft = { id: string; value: string; label: string }

export const newChoice = (existing: ChoiceDraft[], prefix: string, label = ''): ChoiceDraft => {
  let number = 1
  const used = new Set(existing.map(choice => choice.value))
  while (used.has(`${prefix}_${number}`)) number++
  return { id: crypto.randomUUID(), value: `${prefix}_${number}`, label }
}

export const emptyChoices = (prefix: string): ChoiceDraft[] => {
  const first = newChoice([], prefix)
  return [first, newChoice([first], prefix)]
}

export const filledChoices = (choices: ChoiceDraft[]) => choices
  .filter(choice => choice.label.trim())
  .map(choice => ({ value: choice.value.trim(), label: choice.label.trim() }))

export function choiceError(choices: ChoiceDraft[], max: number, portableKeys: boolean): string {
  const filled = filledChoices(choices)
  if (choices.length > max) return `最多支持 ${max} 项，请减少后再添加。`
  if (filled.some(choice => !choice.value)) return '选项编码不能为空。'
  if (new Set(filled.map(choice => choice.value)).size !== filled.length) return '选项编码重复，请展开“编辑编码”检查。'
  if (portableKeys && filled.some(choice => !/^[a-z][a-z0-9_-]{0,79}$/.test(choice.value))) {
    return '编码须以小写字母开头，仅含小写字母、数字、下划线或短横线，最多 80 个字符。'
  }
  if (filled.some(choice => choice.label.length > 2000)) return '每项文字最多 2000 个字符。'
  return ''
}

/** Plain text keeps commas and equals signs intact. Codes require explicit two-column mode. */
export function parseChoicePaste(text: string, coded: boolean, existing: ChoiceDraft[], prefix: string): ChoiceDraft[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim())
  const result: ChoiceDraft[] = []
  for (const line of lines) {
    const cells = line.split('\t')
    if (coded ? cells.length !== 2 : cells.length !== 1) {
      throw new Error(coded ? '请粘贴两列：第一列编码，第二列文字。' : '检测到多列内容。请只复制一列文字，或选择“编码 + 文字（两列）”。')
    }
    const label = (coded ? cells[1] : line).trim()
    if (!label) throw new Error('每一项都需要填写文字。')
    const choice = newChoice([...existing, ...result], prefix, label)
    result.push(coded ? { ...choice, value: cells[0].trim() } : choice)
  }
  return result
}
