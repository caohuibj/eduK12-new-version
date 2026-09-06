/**
 * Fix seeded questionnaireAssessment.frozenActiveSlotSet so its per-section
 * identity hash equals canonicalHash(mapQuestionnaireSection(section)), matching
 * what the runtime admission computes. The gate47 seeder hashed a different
 * canonical shape, so every form submit failed with DEFINITION_MISMATCH.
 * Rebuilds + re-encrypts the slot set for every assessment referenced by the
 * combined fixture pool (formNormal/formLarge/sameParent).
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { mapQuestionnaireSection } from '../src/modules/assessment-runtime/form-section-definition'
import { canonicalHash } from '../src/modules/assessment-runtime/canonical'
import { freezeQuestionnaireActiveSlotSet } from '../src/modules/assessment-runtime/attempt-runtime'
import { encryptFrozenActiveSlotSet } from '../src/modules/assessment-runtime/slot-set'

const SRC = process.env.FIX_SRC || '/workspace/eduk12-pr49-cloud-results/e4s/final-submit-fixtures.json'
const prisma = new PrismaClient()
const orderBy: any = [{ sectionPosition: 'asc' }, { position: 'asc' }]

async function main() {
  const data = JSON.parse(readFileSync(SRC, 'utf8'))
  const groups = ['formNormal', 'formLarge', 'sameParent', 'formSection']
  const byParent = new Map<string, Set<string>>()
  for (const g of groups) {
    const arr = data[g]
    if (!Array.isArray(arr)) continue
    for (const fi of arr) {
      if (fi && fi.instrument === 'form' && fi.parentId && fi.sectionId) {
        if (!byParent.has(fi.parentId)) byParent.set(fi.parentId, new Set())
        byParent.get(fi.parentId)!.add(fi.sectionId)
      }
    }
  }
  const parents = [...byParent.keys()]
  console.log(`rebuilding slot sets for ${parents.length} assessments`)

  let done = 0
  const CH = 400
  for (let s = 0; s < parents.length; s += CH) {
    const chunk = parents.slice(s, s + CH)
    const assessments = await prisma.questionnaireAssessment.findMany({
      where: { id: { in: chunk } },
      select: { id: true, attemptEpoch: true },
    })
    for (const a of assessments) {
      const sectionIds = [...(byParent.get(a.id) || [])]
      const sections = await prisma.questionnaireFormSection.findMany({
        where: { id: { in: sectionIds } },
        include: { items: { orderBy } },
      })
      const hashBy = new Map(sections.map((se) => [se.id, canonicalHash(mapQuestionnaireSection(se))]))
      const slotSet = freezeQuestionnaireActiveSlotSet({
        attemptEpoch: a.attemptEpoch ?? 1,
        scales: [],
        formSections: sectionIds.map((sid) => ({
          sectionId: sid,
          definitionHash: hashBy.get(sid)!,
        })),
      })
      await prisma.questionnaireAssessment.update({
        where: { id: a.id },
        data: {
          frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
          frozenActiveSlotSetHash: slotSet.snapshotHash,
        },
      })
      done += 1
    }
    console.log(`  assessments ${s + chunk.length}/${parents.length}`)
  }
  console.log(`DONE rebuilt ${done}/${parents.length} slot sets`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })