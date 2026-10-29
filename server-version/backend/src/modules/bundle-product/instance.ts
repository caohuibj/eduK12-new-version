import {canonicalHash} from '../assessment-runtime/canonical'
import {decryptCognitivePayload} from '../cognitive/cognitive.security'
import {readFrozenBundleProductionDefinition} from './definition-provider'
import {compositeConflict} from '../composite/composite.errors'
import type {EffectiveScaleDisclosureSnapshot} from '../scale/projection/types'

export type BundleBindings = {
  schemaVersion: 1
  slots: Array<{ slotKey: string; itemId: string; unitType: string; scaleDisclosure?: EffectiveScaleDisclosureSnapshot }>
  context: Array<{ contextKey: string; itemId: string; valueType: string }>
}
export function readInstance(row: { definitionEncrypted: string; definitionHash: string; bindingsEncrypted: string; bindingsHash: string }) {
  const frozen = readFrozenBundleProductionDefinition(decryptCognitivePayload(row.definitionEncrypted))
  const bindings = decryptCognitivePayload<BundleBindings>(row.bindingsEncrypted)
  if (frozen.contentHash !== row.definitionHash || canonicalHash(bindings) !== row.bindingsHash || bindings.schemaVersion !== 1) {
    throw compositeConflict('Bundle 冻结定义或绑定校验失败')
  }
  return { frozen, bindings }
}
