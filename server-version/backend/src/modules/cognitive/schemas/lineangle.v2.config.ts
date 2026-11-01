import { lineangleConfigSchema } from './lineangle.config'
/** Reject impossible candidate counts rather than silently emitting fewer options. */
export const lineangleV2ConfigSchema = lineangleConfigSchema.refine(config => {
  const pool: number[] = []
  for (let angle = 0; angle < 180; angle += config.angleStepDeg) pool.push(angle)
  return pool.every(target => pool.filter(angle => {
    const difference = Math.abs(angle - target)
    return angle !== target && Math.min(difference, 180 - difference) >= config.angleStepDeg * config.minAngleSepSteps
  }).length >= config.optionCount - 1)
}, { message: '角度步长、最小间隔和选项数不能组成完整的无向线段选项' })
