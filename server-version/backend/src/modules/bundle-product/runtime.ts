import type { Prisma } from '@prisma/client'
import { compileBundleRuntimeFromFrozenRead } from '../assessment-bundle/compile'
import { readFrozenBundleProductionDefinition } from './definition-provider'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
export function compiledHashFromInstance(row: { definitionEncrypted: string; definitionHash: string }) {
  const frozen = readFrozenBundleProductionDefinition(decryptCognitivePayload(row.definitionEncrypted))
  if (frozen.contentHash !== row.definitionHash) throw new Error('BUNDLE_DEFINITION_HASH_MISMATCH')
  return compileBundleRuntimeFromFrozenRead({ family: 'ASSESSMENT_BUNDLE', snapshotVersion: 3, snapshot: frozen.bundleSnapshot }).compiledRuntimeHash
}
export async function compiledHashForInstance(db: Prisma.TransactionClient, compositeId: string) {
  const row = await db.bundleInstance.findUnique({ where: { compositeId } })
  if (!row) throw new Error('BUNDLE_INSTANCE_MISSING')
  return compiledHashFromInstance(row)
}
