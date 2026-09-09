import { z } from 'zod'

export const SCALE_DEVICE_PROVENANCE_SCHEMA_VERSION = 1 as const

export const scaleDeviceClassSchema = z.enum(['DESKTOP', 'TABLET', 'MOBILE', 'UNKNOWN'])
export const scaleOsFamilySchema = z.enum(['Windows', 'macOS', 'iOS', 'Android', 'Linux', 'Other', 'Unknown'])
export const scaleBrowserFamilySchema = z.enum(['Chrome', 'Safari', 'Firefox', 'Edge', 'Other', 'Unknown'])
export const scalePrimaryPointerSchema = z.enum(['COARSE', 'FINE', 'UNKNOWN'])

const nonNegativeDimension = z.number().int().nonnegative().max(100_000)
const positiveRatio = z.number().finite().positive().max(100)

/**
 * Coarse technical provenance only. This contract deliberately has no raw
 * user-agent, hardware identifier, IP address, stable device id, or
 * fingerprint field.
 */
export const deviceInputProvenanceV1Schema = z.object({
  schemaVersion: z.literal(SCALE_DEVICE_PROVENANCE_SCHEMA_VERSION),
  deviceClass: scaleDeviceClassSchema,
  osFamily: scaleOsFamilySchema.optional(),
  browserFamily: scaleBrowserFamilySchema.optional(),
  viewportWidth: nonNegativeDimension.optional(),
  viewportHeight: nonNegativeDimension.optional(),
  screenWidth: nonNegativeDimension.optional(),
  screenHeight: nonNegativeDimension.optional(),
  devicePixelRatio: positiveRatio.optional(),
  maxTouchPoints: z.number().int().nonnegative().max(256).optional(),
  primaryPointer: scalePrimaryPointerSchema,
  capturedAt: z.string().datetime({ offset: true }),
}).strict()

export type DeviceInputProvenanceV1 = z.infer<typeof deviceInputProvenanceV1Schema>

export const parseDeviceInputProvenanceV1 = (value: unknown): DeviceInputProvenanceV1 | null => {
  const parsed = deviceInputProvenanceV1Schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const isDeviceInputProvenanceV1 = (value: unknown): value is DeviceInputProvenanceV1 => (
  deviceInputProvenanceV1Schema.safeParse(value).success
)
