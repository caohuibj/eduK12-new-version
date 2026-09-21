/** Generic locale syntax and authorization-scope validation. Instrument content locale lives in ScaleInstrumentSource. */
const CONTENT_LOCALE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

export type ScaleContentLocaleV1 = string

export const isValidContentLocaleTag = (locale: string): boolean => (
  typeof locale === 'string'
  && locale.length >= 2
  && locale.length <= 32
  && CONTENT_LOCALE_RE.test(locale)
)

export const validateAuthorizationScopeLocales = (locales: string[]): string[] => {
  if (!Array.isArray(locales) || locales.length === 0) return ['scope.locales must be a non-empty array']
  const errors: string[] = []
  const seen = new Set<string>()
  for (const locale of locales) {
    if (!isValidContentLocaleTag(locale)) errors.push(`invalid scope locale tag: ${locale}`)
    if (seen.has(locale)) errors.push(`duplicate scope locale: ${locale}`)
    seen.add(locale)
  }
  return errors
}
