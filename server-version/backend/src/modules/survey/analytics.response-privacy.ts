/** Raw free text is sensitive by default, including V2 "Other, please specify".
 * Only explicit consented researcher export with recent MFA may include it.
 * Native original JSON may contain free text and stage event details, so the
 * whole original is always gated even when this particular response has none.
 */
export const isResearchFreeTextType=(responseType:string):boolean=>
  responseType==='SHORT_TEXT'||responseType==='LONG_TEXT'||responseType==='OTHER_TEXT'
    ||responseType==='SJT_NATIVE_FREE_TEXT'||responseType==='SJT_NATIVE_RAW_JSON'
