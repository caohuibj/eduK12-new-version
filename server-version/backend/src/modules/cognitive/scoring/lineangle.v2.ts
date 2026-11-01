import { scoreLineangleV1 } from './lineangle.v1'
/** Same natural metrics and missing-value rules; unoriented angles are equivalent modulo 180. */
export const scoreLineangleV2 = (input: Parameters<typeof scoreLineangleV1>[0]) => scoreLineangleV1({
  ...input,
  trials: input.trials.map(trial => ({ ...trial, payload: {
    ...trial.payload,
    targetAngle: trial.payload.targetAngle % 180,
    optionAngles: trial.payload.optionAngles.map(angle => angle % 180),
    responseAngle: trial.payload.responseAngle === null ? null : trial.payload.responseAngle % 180,
  } })),
})
