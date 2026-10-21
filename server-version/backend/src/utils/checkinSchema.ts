import { z } from 'zod'
import { config } from '../config'
import { createAttachmentSchema } from './attachmentSchema'

const attachments = z.array(createAttachmentSchema(config.legacyUploadsEnabled)).max(100)
export const createCheckinSchema = z.object({
  courseId: z.string().min(1, '课程ID不能为空'),
  title: z.string().min(1, '打卡标题不能为空'),
  description: z.string().optional(), content: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional(),
  videos: attachments.optional().nullable().default([]),
  images: attachments.optional().nullable().default([]),
  documents: attachments.optional().nullable().default([]),
  endTime: z.union([z.string(), z.null()]).optional(),
  allowViewOthers: z.boolean().optional().default(false),
})
