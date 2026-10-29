import {z} from 'zod'

/** Additive identity only. It grants no distribution, collection or report right. */
export const educationNativeBundleSchema=z.object({
  definitionHash:z.string().regex(/^[a-f0-9]{64}$/),
  sourceBindingsHash:z.string().regex(/^[a-f0-9]{64}$/),
  bindingsHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type EducationNativeBundle=z.infer<typeof educationNativeBundleSchema>

export class EducationNativeBundleError extends Error {
  constructor(readonly code:string,readonly statusCode=409){super(code);this.name='EducationNativeBundleError'}
}
