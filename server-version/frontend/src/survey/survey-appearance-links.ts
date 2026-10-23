export type SurveyAppearanceMode = 'auto' | 'light' | 'dark'

/** Presentation preference only; never forwards credentials or authorization. */
export function surveyAppearanceFromSearch(search: string): SurveyAppearanceMode | undefined {
  const value = new URLSearchParams(search).get('appearance')
  return value === 'auto' || value === 'light' || value === 'dark' ? value : undefined
}

export function surveyAppearanceHref(href: string, mode: SurveyAppearanceMode): string {
  const url = new URL(href, 'http://localhost')
  url.searchParams.set('appearance', mode)
  return href.startsWith('/') ? url.pathname + url.search + url.hash : url.href
}
