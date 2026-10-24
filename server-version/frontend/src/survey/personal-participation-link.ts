/** Participant-held bearer: fragment only, never query/path, cookies or browser storage. */
export type PersonalParticipationProof={researchCode:string;accessCredential:string}
const code=/^R-[A-Z0-9]{8,32}$/
const secret=/^[A-Za-z0-9_-]{43}$/
export function readPersonalParticipationProof(hash:string):PersonalParticipationProof|null{
  if(hash.length>256)return null
  const params=new URLSearchParams(hash.replace(/^#/,''))
  if([...params.keys()].sort().join(',')!=='code,key,resume'||params.get('resume')!=='1')return null
  const researchCode=params.get('code')??'',accessCredential=params.get('key')??''
  return code.test(researchCode)&&secret.test(accessCredential)?{researchCode,accessCredential}:null
}
export function personalParticipationLink(origin:string,publicId:string,proof:PersonalParticipationProof):string{
  if(!/^[a-f0-9-]{36}$/i.test(publicId)||!code.test(proof.researchCode)||!secret.test(proof.accessCredential))return ''
  const url=new URL('/r/'+publicId,origin)
  if(!['http:','https:'].includes(url.protocol))return ''
  url.hash=new URLSearchParams({resume:'1',code:proof.researchCode,key:proof.accessCredential}).toString()
  return url.href
}
