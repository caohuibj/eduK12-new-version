/** Raw free text is sensitive by default, including V2 "Other, please specify".
 * Only explicit consented researcher export with recent MFA may include it.
 */
export const isResearchFreeTextType=(responseType:string):boolean=>
  responseType==='SHORT_TEXT'||responseType==='LONG_TEXT'||responseType==='OTHER_TEXT'
