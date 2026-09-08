import { z } from 'zod'

export const cognitiveDeviceClassSchema = z.enum([
  'PHONE',
  'TABLET',
  'DESKTOP_LAPTOP',
  'UNKNOWN',
])

export const cognitiveAdministrationModeSchema = z.enum([
  'TOUCH',
  'KEYBOARD_MOUSE',
  'MIXED',
  'UNKNOWN',
])

export const administrationProvenanceV1Schema = z.object({
  schemaVersion: z.literal(1),
  deviceClass: cognitiveDeviceClassSchema,
  administrationMode: cognitiveAdministrationModeSchema,
}).strict()

export type AdministrationProvenanceV1 = z.infer<typeof administrationProvenanceV1Schema>
