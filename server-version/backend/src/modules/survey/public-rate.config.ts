/** A single NAT-friendly public Research IP budget; no per-identity layering.
 * Security, FINAL idempotency, rate-limit Redis fail-closed are unchanged.
 */
export function surveyPublicRateLimits(env:Record<string,string|undefined>=process.env){
  const positive=(name:string,fallback:number,max:number)=>{
    const raw=env[name]
    if(raw===undefined||raw==='')return fallback
    const value=Number(raw)
    if(!Number.isSafeInteger(value)||value<1||value>max)
      throw new Error(name+' must be a positive integer <= '+max)
    return value
  }
  return {
    limit:positive('SURVEY_PUBLIC_IP_LIMIT',5000,100000),
    windowSeconds:positive('SURVEY_PUBLIC_WINDOW_SECONDS',900,3600),
  }
}
