/**
 * ScaleCatalogRegistry — catalog manifest ↔ ScalePackageV2 绑定注册表（SL1-C6）。
 *
 * 绑定键：identity.instrumentKey + identity.instrumentVersion → 现有 scale
 * package registry。catalog 元数据保存在本模块，不写入 ScaleDefinitionV2，
 * 不参与 hashScaleDefinition，不改变任何 scoring / runtime 行为。
 *
 * 绑定诊断（fail-closed）：
 * - DUPLICATE_CATALOG_MANIFEST：同一 key+version 重复注册；
 * - CATALOG_PACKAGE_MISSING：catalog-first entry 尚无 package；CANDIDATE/REVIEWED
 *   允许以 warning 存在并保持不可启动，ACCEPTED 必须绑定 package；
 * - CATALOG_PACKAGE_VERSION_MISMATCH：key 存在但没有该 instrumentVersion 的 package；
 * - PACKAGE_WITHOUT_CATALOG：反向 orphan（package 存在但还没有 catalog，SL3 前为
 *   预期状态，warning 不阻断）。
 *
 * manifest 解析失败（INVALID_CATALOG_MANIFEST）产生 error 诊断而不是抛异常，
 * 让调用方（library read API / publication gate）可以一次性拿到全部问题。
 */
import {
  getScalePackage,
  listScalePackages,
  type ScalePackageV2,
} from '../scale-package.registry'
import { parseScaleCatalogManifest, type ScaleCatalogManifestV1 } from './catalog-manifest'

export type CatalogBindingStatus = 'BOUND' | 'PACKAGE_MISSING' | 'PACKAGE_VERSION_MISMATCH'

export type CatalogRegistryDiagnosticCode =
  | 'INVALID_CATALOG_MANIFEST'
  | 'DUPLICATE_CATALOG_MANIFEST'
  | 'CATALOG_PACKAGE_MISSING'
  | 'CATALOG_PACKAGE_VERSION_MISMATCH'
  | 'PACKAGE_WITHOUT_CATALOG'

export interface CatalogRegistryDiagnostic {
  code: CatalogRegistryDiagnosticCode
  severity: 'error' | 'warning'
  path: string
  message: string
}

export interface ScaleCatalogEntry {
  manifest: ScaleCatalogManifestV1
  pkg?: ScalePackageV2
  bindingStatus: CatalogBindingStatus
}

export interface ScaleCatalogRegistry {
  entries: ScaleCatalogEntry[]
  diagnostics: CatalogRegistryDiagnostic[]
  /** 没有 error 级诊断（warning 不阻断）时为 true。 */
  valid: boolean
  getEntry: (instrumentKey: string, instrumentVersion: string) => ScaleCatalogEntry | undefined
}

const missingPackageSeverity = (manifest: ScaleCatalogManifestV1): 'error' | 'warning' => (
  manifest.catalogStatus === 'ACCEPTED' ? 'error' : 'warning'
)

export const createScaleCatalogRegistry = (manifests: readonly unknown[]): ScaleCatalogRegistry => {
  const diagnostics: CatalogRegistryDiagnostic[] = []
  const entries: ScaleCatalogEntry[] = []
  const entryByKey = new Map<string, ScaleCatalogEntry>()
  const packageKeys = new Set(listScalePackages().map((pkg) => pkg.key))

  manifests.forEach((raw, index) => {
    const path = `manifests.${index}`
    const parsed = parseScaleCatalogManifest(raw)
    if (!parsed.ok) {
      diagnostics.push({
        code: 'INVALID_CATALOG_MANIFEST',
        severity: 'error',
        path,
        message: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      })
      return
    }
    const manifest = parsed.manifest
    const bindingKey = `${manifest.identity.instrumentKey}:${manifest.identity.instrumentVersion}`
    if (entryByKey.has(bindingKey)) {
      diagnostics.push({
        code: 'DUPLICATE_CATALOG_MANIFEST',
        severity: 'error',
        path,
        message: `catalog manifest 重复：${bindingKey}`,
      })
      return
    }
    const pkg = getScalePackage(manifest.identity.instrumentKey, manifest.identity.instrumentVersion)
    let bindingStatus: CatalogBindingStatus
    if (pkg) {
      bindingStatus = 'BOUND'
    } else if (packageKeys.has(manifest.identity.instrumentKey)) {
      bindingStatus = 'PACKAGE_VERSION_MISMATCH'
      diagnostics.push({
        code: 'CATALOG_PACKAGE_VERSION_MISMATCH',
        severity: 'error',
        path,
        message: `catalog ${bindingKey} 版本不匹配：已注册 ${manifest.identity.instrumentKey} 的版本为 ${listScalePackages().filter((candidate) => candidate.key === manifest.identity.instrumentKey).map((candidate) => candidate.instrumentVersion).join(', ')}`,
      })
    } else {
      bindingStatus = 'PACKAGE_MISSING'
      const severity = missingPackageSeverity(manifest)
      diagnostics.push({
        code: 'CATALOG_PACKAGE_MISSING',
        severity,
        path,
        message: severity === 'warning'
          ? `catalog-first entry：${bindingKey} 尚无 scale package；${manifest.catalogStatus} 状态仅可发现，不可启动`
          : `orphan catalog entry：${bindingKey} 已是 ACCEPTED，但没有已注册的 scale package`,
      })
    }
    const entry: ScaleCatalogEntry = { manifest, pkg, bindingStatus }
    entries.push(entry)
    entryByKey.set(bindingKey, entry)
  })

  const catalogedKeys = new Set(entries.filter((entry) => entry.bindingStatus === 'BOUND').map((entry) => `${entry.manifest.identity.instrumentKey}:${entry.manifest.identity.instrumentVersion}`))
  listScalePackages().forEach((pkg) => {
    if (!catalogedKeys.has(`${pkg.key}:${pkg.instrumentVersion}`)) {
      diagnostics.push({
        code: 'PACKAGE_WITHOUT_CATALOG',
        severity: 'warning',
        path: `packages.${pkg.key}:${pkg.instrumentVersion}`,
        message: `package ${pkg.key}:${pkg.instrumentVersion} 尚无 catalog manifest（SL3 前 expected）`,
      })
    }
  })

  return {
    entries,
    diagnostics,
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    getEntry: (instrumentKey: string, instrumentVersion: string) => (
      entryByKey.get(`${instrumentKey}:${instrumentVersion}`)
    ),
  }
}
