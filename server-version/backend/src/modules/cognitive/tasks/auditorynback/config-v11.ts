import { auditorynbackConfigSchema } from '../../schemas/auditorynback.config'

/** The new fixed-count protocol must be able to supply its unchanged scoring minimum. */
export const auditorynbackConfigV11Schema = auditorynbackConfigSchema.superRefine((config, ctx) => {
  const count = Math.round((config.totalTrials - config.nLevel) * config.targetRatio)
  const nonTargets = config.totalTrials - config.nLevel - count
  if (count < 6 || nonTargets < 1 || count > 2 * (nonTargets + 1)) {
    ctx.addIssue({ code: 'custom', path: ['totalTrials'], message: '固定目标协议需要至少6次匹配、至少1次非匹配，并可避免连续3次匹配' })
  }
})
