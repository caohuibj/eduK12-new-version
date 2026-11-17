import { prisma } from '../../config/database'
import { mapCompositeSection, type CompositeSection } from '../assessment-runtime/form-section-definition'
import { formSectionIdentityHash } from '../assessment-runtime/attempt-runtime'

/** A Whole education delivery may render any required frozen Scale/Form slot.
 * Do not relax the current-unit restriction for stepped or training routes. */
type EducationWholeMediaState = {
  status?: string
  executionMode?: string
  assessmentId?: string
  units?: Array<{ id: string; type: string; itemId?: string; formSectionId?: string }>
  formSections?: Array<{ id: string; definitionHash: string }>
}

export const isEducationWholeMediaUnit = (
  state: EducationWholeMediaState,
  kind: 'SCALE' | 'FORM_SECTION',
  id: string,
): boolean => (
  state.status === 'IN_PROGRESS'
  && state.executionMode === 'WHOLE_LOCAL'
  && Boolean(state.units?.some(unit => unit.type === kind
    && (kind === 'SCALE' ? (unit.itemId ?? unit.id) : (unit.formSectionId ?? unit.id)) === id))
)

/** Later Form sections have no stored admission yet. Read their published
 * definition without creating an attempt/activation, and verify it against
 * the frozen slot identity already checked by getAttemptState. */
export const loadEducationWholeFormMediaDefinition = async (
  state: EducationWholeMediaState,
  sectionId: string,
): Promise<CompositeSection | null> => {
  if (!isEducationWholeMediaUnit(state, 'FORM_SECTION', sectionId)) return null
  const frozen = state.formSections?.find(section => section.id === sectionId)
  if (!frozen?.definitionHash || !state.assessmentId) return null
  const row = await prisma.compositeFormSection.findUnique({
    where: { id: sectionId },
    include: { items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }] } },
  })
  if (!row || row.compositeAssessmentId !== state.assessmentId) return null
  const definition = mapCompositeSection(row)
  return formSectionIdentityHash(definition) === frozen.definitionHash ? definition : null
}
