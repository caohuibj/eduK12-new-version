export interface AttachmentUpdateInput {
  videos: unknown[]
  images: unknown[]
  documents: unknown[]
}

/**
 * Update payloads must preserve empty arrays. An omitted field means
 * "unchanged" to the API, while [] explicitly clears all attachments.
 */
export const buildAttachmentUpdateFields = (input: AttachmentUpdateInput) => ({
  videos: input.videos,
  images: input.images,
  documents: input.documents,
})

export const buildAssignmentAttachmentUpdateFields = (
  input: AttachmentUpdateInput & { questions: unknown[] },
) => ({
  questions: input.questions,
  ...buildAttachmentUpdateFields(input),
})
