import {z} from 'zod'
import {educationLibraryUseInput} from './education-use'

/** Internal caller context, never an HTTP-body schema or a permission receipt.
 * The authenticated route/parent activity supplies product, school and actor.
 * MUTATION describes the caller's intent only: it does not prove transaction
 * locks, current membership, a use grant, or publication authority.
 */
export const educationLibraryRuntimeContextSchema=educationLibraryUseInput.extend({
  operation:z.enum(['READ','MUTATION']),
}).strict()
export type EducationLibraryRuntimeContext=z.infer<typeof educationLibraryRuntimeContextSchema>
const serverScope=educationLibraryUseInput.pick({product:true,organizationId:true,actorId:true}).strict()
const exactContent=educationLibraryUseInput.pick({entryId:true,releaseId:true,contentHash:true}).strict()

export function educationLibraryRuntimeContext(
  authenticatedScope:z.input<typeof serverScope>,
  reference:z.input<typeof exactContent>,
  operation:EducationLibraryRuntimeContext['operation'],
):EducationLibraryRuntimeContext{
  // Parse separately before merging: a client reference cannot overwrite the
  // authenticated context, even if it arrives with unexpected extra fields.
  return educationLibraryRuntimeContextSchema.parse({
    ...serverScope.parse(authenticatedScope),...exactContent.parse(reference),operation,
  })
}
