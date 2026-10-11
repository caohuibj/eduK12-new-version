/** Production Survey cannot be enabled without its own valid MFA encryption key.
 * Defaults stay OFF. Validation never logs raw secrets.
 */
export function validateSurveyStartupConfig(env:NodeJS.ProcessEnv=process.env):void{
  if(env.NODE_ENV!=='production')return
  const workspace=env.SURVEY_WORKSPACE_ENABLED==='true'
  const publication=env.SURVEY_PUBLICATION_ENABLED==='true'
  const analytics=env.SURVEY_ANALYTICS_ENABLED==='true'
  if((publication||analytics)&&!workspace)
    throw new Error('Survey publication or analytics requires SURVEY_WORKSPACE_ENABLED=true')
  if(workspace&&!/^[0-9a-fA-F]{64}$/.test(env.SURVEY_MFA_ENCRYPTION_KEY||''))
    throw new Error('SURVEY_MFA_ENCRYPTION_KEY must be 32 bytes of hex when Survey is enabled')
}
