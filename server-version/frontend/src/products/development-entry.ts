/** Presentation only: this never authorizes a request or trusts a new API origin. */
export function isLoopbackSurveyDevelopment(
  hostname: string,
  development = import.meta.env.DEV,
): boolean {
  return import.meta.env.DEV && development && import.meta.env.VITE_DEV_PRODUCT === 'survey'
    && ['localhost', '127.0.0.1'].includes(hostname.toLowerCase().replace(/\.$/, ''))
}
