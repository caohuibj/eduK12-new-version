import packages from '../generated/packages.json'
import { parseDeclarativePackage, type DeclarativePackage } from './contract'
import { parseBundleContextDefinition } from '../context'
import type { BundleDefinitionEntry } from '../../bundle-product/definition-provider'
export function packageEntry(raw: unknown): BundleDefinitionEntry {
  const pack = parseDeclarativePackage(raw)
  return { definition:pack.manifest.definition, contextDefinition:pack.context?parseBundleContextDefinition(pack.context):null,ruleSet:null,declarativePackage:pack,
    reportDefinition:{key:pack.report.key,version:pack.report.version,title:pack.manifest.definition.name,sections:{summary:'综合结果',quality:'结果质量',evidence:'单项依据',limitations:'解释范围'}} }
}
export function generatedPackageEntries(): BundleDefinitionEntry[] { return (packages as unknown[]).map(packageEntry) }
export function generatedPackages(): DeclarativePackage[] { return (packages as unknown[]).map(parseDeclarativePackage) }
