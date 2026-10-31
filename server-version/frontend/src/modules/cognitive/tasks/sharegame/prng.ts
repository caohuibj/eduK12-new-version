import type { SharegameTrialPayload } from '../../types'

/** 本任务为偏好描述任务：无随机序列，禀赋序列随 config 冻结。 */
export const SHAREGAME_PRACTICE_ENDOWMENT = 20

/** 预设档位（占禀赋比例）与标签。 */
export const SHAREGAME_OPTIONS: Array<{ fraction: number; label: string }> = [
  { fraction: 0, label: '全部自留' },
  { fraction: 0.25, label: '给 1/4' },
  { fraction: 0.5, label: '给一半' },
  { fraction: 0.75, label: '给 3/4' },
  { fraction: 1, label: '全部给出' },
]

export const givenForFraction = (endowment: number, fraction: number): number =>
  Math.round(endowment * fraction)
