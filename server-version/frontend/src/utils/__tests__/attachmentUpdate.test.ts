import { describe, expect, it } from 'vitest'
import { buildAssignmentAttachmentUpdateFields, buildAttachmentUpdateFields } from '../attachmentUpdate'

describe('attachment update payloads', () => {
  it('preserves empty arrays so an edit can clear every check-in attachment', () => {
    expect(buildAttachmentUpdateFields({ videos: [], images: [], documents: [] })).toEqual({
      videos: [],
      images: [],
      documents: [],
    })
  })

  it('preserves an empty questions array for assignment edits', () => {
    expect(buildAssignmentAttachmentUpdateFields({
      questions: [],
      videos: [],
      images: [],
      documents: [],
    })).toEqual({
      questions: [],
      videos: [],
      images: [],
      documents: [],
    })
  })
})
