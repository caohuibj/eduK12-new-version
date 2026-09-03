/**
 * Strengthen contentLocale validation for Scale packages.
 * Package keys like sdq_teacher_zh_cn / texi_*_zh_cn may retain English source
 * content until signed localization — contentLocale tracks actual item language,
 * independent of the product key name (do not rename keys).
 */
import { getScalePackage } from './scale-package.registry'

/** BCP-47-ish language tags we accept in authorization scopes / contentLocale. */
const CONTENT_LOCALE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

export type ScaleContentLocaleV1 = 'zh-CN' | 'en' | string

/** Known packages whose product key ends in zh_cn but content is still English source. */
export const PACKAGE_CONTENT_LOCALE_BY_KEY: Record<string, ScaleContentLocaleV1> = {
  who5: 'zh-CN',
  sdq_parent_zh_cn: 'zh-CN',
  sdq_teacher_zh_cn: 'en', // English T4-10 locked; key kept per product decision
  texi_parent_zh_cn: 'en',
  texi_teacher_zh_cn: 'en',
  adexi_v1: 'zh-CN',
}

export const isValidContentLocaleTag = (locale: string): boolean => (
  typeof locale === 'string'
  && locale.length >= 2
  && locale.length <= 32
  && CONTENT_LOCALE_RE.test(locale)
)

export const resolvePackageContentLocale = (instrumentKey: string): ScaleContentLocaleV1 | null => (
  PACKAGE_CONTENT_LOCALE_BY_KEY[instrumentKey] ?? null
)

/**
 * Fail closed when a publish/gate locale claims zh-CN content but the package
 * still carries English source identity (e.g. sdq_teacher_zh_cn / texi_*_zh_cn).
 */
export const assertContentLocaleCompatible = (input: {
  instrumentKey: string
  requestedLocale: string
  allowEnglishSourceForZhCnKey?: boolean
}): { ok: boolean; contentLocale: ScaleContentLocaleV1 | null; errors: string[] } => {
  const errors: string[] = []
  if (!isValidContentLocaleTag(input.requestedLocale)) {
    errors.push(`invalid contentLocale/locale tag: ${input.requestedLocale}`)
  }
  const contentLocale = resolvePackageContentLocale(input.instrumentKey)
  if (!contentLocale) {
    // Unknown package — do not invent; caller may still check registration.
    return { ok: errors.length === 0, contentLocale: null, errors }
  }
  if (!isValidContentLocaleTag(contentLocale)) {
    errors.push(`package contentLocale invalid for ${input.instrumentKey}: ${contentLocale}`)
  }
  if (
    input.requestedLocale === 'zh-CN'
    && contentLocale === 'en'
    && !input.allowEnglishSourceForZhCnKey
  ) {
    errors.push(
      `${input.instrumentKey}: contentLocale=en (English source locked); refuse zh-CN publish until signed localization. Product key retained.`,
    )
  }
  // Soft check package exists when key is known.
  const pkg = getScalePackage(input.instrumentKey, '1.0.0')
    ?? getScalePackage(input.instrumentKey, '2.0.0')
  if (!pkg && PACKAGE_CONTENT_LOCALE_BY_KEY[input.instrumentKey]) {
    // Version may differ; absence is not fatal for locale tag validation alone.
  }
  return { ok: errors.length === 0, contentLocale, errors }
}

export const validateAuthorizationScopeLocales = (locales: string[]): string[] => {
  const errors: string[] = []
  if (!Array.isArray(locales) || locales.length === 0) {
    return ['scope.locales must be a non-empty array']
  }
  const seen = new Set<string>()
  for (const locale of locales) {
    if (!isValidContentLocaleTag(locale)) {
      errors.push(`invalid scope locale tag: ${locale}`)
    }
    if (seen.has(locale)) errors.push(`duplicate scope locale: ${locale}`)
    seen.add(locale)
  }
  return errors
}
