import { compileSjtTemplate, assertSjtReleaseReady } from './template'
import { compileSjtOnlineDocument, assertSjtOnlineReleaseReady } from './online'

/** A protocol is chosen by the stored author's explicit document discriminator.
 * Never reinterpret legacy uploads as an online document. */
export function compileSjtAuthorDocument(input: unknown) {
  return input && typeof input === 'object' && !Array.isArray(input)
    && (input as Record<string, unknown>).templateVersion === 'sjt-online-v1'
    ? compileSjtOnlineDocument(input)
    : compileSjtTemplate(input)
}
export function assertSjtAuthorReleaseReady(compiled: ReturnType<typeof compileSjtAuthorDocument>) {
  if (compiled.template.templateVersion === 'sjt-online-v1') {
    assertSjtOnlineReleaseReady(compiled as ReturnType<typeof compileSjtOnlineDocument>)
  } else {
    assertSjtReleaseReady(compiled as ReturnType<typeof compileSjtTemplate>)
  }
}
