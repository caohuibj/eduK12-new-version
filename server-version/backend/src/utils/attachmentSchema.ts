import { z } from 'zod'

const MAX_ATTACHMENT_URL_LENGTH = 2048

export const isLegacyUploadReference = (value: string): boolean => {
  if (!/^\/?uploads\/[A-Za-z0-9._~!$&'()*+,;=@%/_-]+$/.test(value)) return false

  // Validate the decoded path as well. Otherwise `%2e%2e` or an encoded
  // backslash can bypass the raw-string traversal check and be interpreted
  // differently by a proxy, object store, or filesystem adapter later on.
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return false
  }
  if (!/^\/?uploads\/[A-Za-z0-9._~!$&'()*+,;=@/_-]+$/.test(decoded)) return false
  if (decoded.includes('\\') || /[\u0000-\u001f\u007f]/.test(decoded)) return false
  return !decoded.split('/').some((segment) => segment === '.' || segment === '..')
}

export const isSafeExternalMediaUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname)
  } catch {
    return false
  }
}

const urlSchema = z.string().min(1).max(MAX_ATTACHMENT_URL_LENGTH)
const safeExternalUrlSchema = urlSchema.refine(isSafeExternalMediaUrl, '仅支持 HTTPS 外部媒体链接')

const attachmentMetadata = {
  id: z.string().min(1).max(100).optional(),
  title: z.string().max(500).optional(),
  name: z.string().max(500).optional(),
  filename: z.string().max(255).optional(),
  fileName: z.string().max(255).optional(),
  thumbnail: urlSchema.optional(),
  source: z.string().max(100).optional(),
  allowDownload: z.boolean().optional(),
}

const assetReferenceSchema = z.object({
  ...attachmentMetadata,
  assetId: z.string().min(1).max(100),
  type: z.enum(['library', 'upload', 'external']).optional(),
  // The URL is treated as display metadata only. Server hydration replaces it
  // with a short-lived signed capability after the asset scope is checked.
  url: urlSchema.optional(),
}).strict()

const externalObjectSchema = z.object({
  ...attachmentMetadata,
  type: z.literal('external'),
  url: safeExternalUrlSchema,
}).strict()

const legacyObjectSchema = z.object({
  ...attachmentMetadata,
  // Older clients omitted `type` for document/library references. Preserve
  // that wire shape while still requiring a constrained local/HTTPS URL.
  type: z.enum(['library', 'upload']).optional(),
  url: urlSchema,
}).strict().refine((value) => isSafeExternalMediaUrl(value.url) || isLegacyUploadReference(value.url), {
  message: '媒体引用无效',
})

/**
 * Attachment inputs are either a server-issued asset capability or an HTTPS
 * external URL. Local `/uploads/...` references are accepted only while the
 * explicit asset migration has not been completed.
 */
export const createAttachmentSchema = (allowLegacyUploads: boolean) => z.union([
  assetReferenceSchema,
  externalObjectSchema,
  safeExternalUrlSchema,
  ...(allowLegacyUploads ? [legacyObjectSchema, z.string().min(1).max(MAX_ATTACHMENT_URL_LENGTH).refine(isLegacyUploadReference, '媒体引用无效')] : []),
] as [z.ZodTypeAny, z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
