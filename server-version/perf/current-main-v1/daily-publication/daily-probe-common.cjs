const {createHash}=require('node:crypto')
function blank(){return {total:0,read:0,write:0,transaction:0,other:0,durationMs:0,queryTextUtf8Bytes:0,gateTags:{publisherQualification:0,toolAuthority:0,copyright:0,versionOrFrozenIdentity:0,currentParticipant:0},statements:{}}}
function query(out,event){
 const q=event.query.replace(/\s+/g,' ').trim(),dml=/^(INSERT|UPDATE|DELETE)\b/i.test(q)||/^WITH\b/i.test(q)&&/\b(?:UPDATE\s+\S+\s+SET|INSERT\s+INTO|DELETE\s+FROM)\b/i.test(q),kind=dml?'write':/^(SELECT|WITH|SHOW)\b/i.test(q)?'read':/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|SET TRANSACTION)\b/i.test(q)?'transaction':'other'
 out.total++;out[kind]++;out.durationMs+=event.duration;out.queryTextUtf8Bytes+=Buffer.byteLength(event.query)
 const tags={publisherQualification:/survey_researcher_grants|survey_mfa_credentials/i,toolAuthority:/survey_tool_grants|survey_tool_policies|scale_library_use_grants|content_capability_grants/i,copyright:/instrument_authorizations|assessment_authorizations|authorization_records|authorization_approvals/i,versionOrFrozenIdentity:/survey_publications|measurement_content_releases|survey_instrument_drafts|scale_library_emergency_stops/i,currentParticipant:/survey_participants|survey_consents/i}
 for(const [name,re] of Object.entries(tags))if(re.test(q))out.gateTags[name]++
 // Fingerprints contain neither parameter values nor authored text. Tags may
 // overlap; they must never be added together as a SQL total.
 const fingerprint=createHash('sha256').update(q).digest('hex')
 out.statements[fingerprint]=(out.statements[fingerprint]||0)+1
}
module.exports={blank,query}
