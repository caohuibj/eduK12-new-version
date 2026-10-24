import {createParticipationLinkCodec} from '../components/participation/participation-link'
/** Participant-held bearer: fragment only, never query/path, cookies or browser storage. */
export type PersonalParticipationProof={researchCode:string;accessCredential:string}
const codec=createParticipationLinkCodec({route:'/r/',namespace:'1',proofFields:{code:/^R-[A-Z0-9]{8,32}$/,key:/^[A-Za-z0-9_-]{43}$/}})
export function readPersonalParticipationProof(hash:string):PersonalParticipationProof|null{
  if(hash.length>256)return null
  const proof=codec.read(hash)
  return proof?{researchCode:proof.code,accessCredential:proof.key}:null
}
export function personalParticipationLink(origin:string,publicId:string,proof:PersonalParticipationProof):string{
  return codec.link(origin,publicId,{code:proof.researchCode,key:proof.accessCredential})
}
