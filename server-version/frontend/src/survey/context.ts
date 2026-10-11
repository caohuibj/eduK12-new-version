export const SURVEY_HOST='survey.eduk12.top'
/** Host selects presentation only. The backend owns all researcher authorization. */
export const isSurveyHost=(hostname=typeof window==='undefined'?'':window.location.hostname):boolean=>{
  const name=hostname.toLowerCase().replace(/\.$/,'')
  return name===SURVEY_HOST || (import.meta.env.DEV&&name==='survey.localhost')
}
