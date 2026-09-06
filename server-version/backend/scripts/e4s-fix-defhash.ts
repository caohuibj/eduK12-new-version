/**
 * Fix the seeded form-section definitionHash so it matches what the runtime
 * admission computes: canonicalHash(mapQuestionnaireSection(section)).
 * The gate47 seeder hashed `listQuestionnaireFormSections` output instead, which
 * canonicalizes differently -> every form submit failed with DEFINITION_MISMATCH.
 * Patching the fixture bodies (in place on the combined pool) is sufficient:
 * the admission is built from the live DB section via mapQuestionnaireSection,
 * and the frozen active slot set is NOT cross-validated on this path.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { mapQuestionnaireSection } from '../src/modules/assessment-runtime/form-section-definition'
import { canonicalHash } from '../src/modules/assessment-runtime/canonical'

const SRC = process.env.FIX_SRC || '/workspace/eduk12-pr49-cloud-results/e4s/final-submit-fixtures.json'
const OUT = process.env.FIX_OUT_DST || SRC
const FORM_GROUPS = ['formNormal', 'formLarge', 'sameParent', 'formSection']

const prisma = new PrismaClient()
const orderBy: any = [{ sectionPosition: 'asc' }, { position: 'asc' }]

async function main() {
  const data = JSON.parse(readFileSync(SRC, 'utf8'))
  // Collect every form-section fixture needing a hash.
  const fixes: { group: string; idx: number; sectionId: string }[] = []
  for (const group of FORM_GROUPS) {
    const arr = data[group]
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i += 1) {
      const fi = arr[i]
      if (fi && fi.instrument === 'form' && fi.sectionId && fi.body && fi.body.definitionHash) {
        fixes.push({ group, idx: i, sectionId: fi.sectionId })
      }
    }
  }
  console.log(`fixing ${fixes.length} fixtures across ${FORM_GROUPS.join(',')}`)

  // Batch-load unique sections.
  const uniq = [...new Set(fixes.map((f) => f.sectionId))]
  const correct = new Map<string, string>()
  const CH = 500
  for (let s = 0; s < uniq.length; s += CH) {
    const chunk = uniq.slice(s, s + CH)
    const rows = await prisma.questionnaireFormSection.findMany({
      where: { id: { in: chunk } },
      include: { items: { orderBy } },
    })
    for (const row of rows) correct.set(row.id, canonicalHash(mapQuestionnaireSection(row)))
    console.log(`  sections ${s + rows.length}/${uniq.length}`)
  }

  let patched = 0
  let missing = 0
  for (const f of fixes) {
    const h = correct.get(f.sectionId)
    if (!h) { missing += 1; continue }
    data[f.group][f.idx].body.definitionHash = h
    patched += 1
  }
  writeFileSync(OUT, JSON.stringify(data))
  console.log(JSON.stringify({ patched, missing, uniq: uniq.length, out: OUT }))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })