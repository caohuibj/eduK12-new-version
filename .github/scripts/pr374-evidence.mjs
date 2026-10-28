import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base='docs/performance/four-entry-scale-probe-20261028/';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** PR374 only: retain original failed invocations and admit their individually
 * reviewed successful phases. Never rewrite a helper failure as whole-run PASS. */
export function verifyPr374Observations(review){
 const indexBytes=readFileSync(base+'cloud-evidence-index.json');assert.equal(hash(indexBytes),review.indexSHA256);
 const index=JSON.parse(indexBytes),files=new Map(index.files.map(f=>[f.path,f]));
 for(const f of index.files){assert(!f.path.startsWith('/')&&!f.path.split('/').includes('..'));const b=readFileSync(base+f.path);assert.equal(hash(b),f.sha256);assert.equal(b.length,f.bytes);}
 const read=name=>{const path='evidence/'+name+'.json';assert(files.has(path));return JSON.parse(readFileSync(base+path));};
 const one=(name,n)=>read(name).cases[n];
 const passed=c=>assert.equal(c.status,'PASS');
 const journey=c=>{for(const k of ['frozenInstructionExact','resume','sameSubmissionReplay','changedReplayDenied','reopenedCompleted'])assert.equal(c[k],true);assert.equal(c.final.completed,true);};
 const schoolOriginal=one('cloud-http-r1',0),school=one('cloud-http-r2',0);
 assert.equal(schoolOriginal.status,'FAIL');journey(schoolOriginal);passed(school);assert.equal(school.score,30);assert.equal(school.feedbackState,'READY');
 const teacher=one('cloud-http-r3',0);passed(teacher);journey(teacher);assert.equal(teacher.persistedRespondentType,'SELF');assert.equal(teacher.score,30);assert.equal(teacher.feedbackState,'READY');
 const student=one('cloud-more-r2',0),anonymous=one('cloud-more-r2',1);
 for(const c of [student,anonymous]){passed(c);journey(c);assert.equal(c.score,30);}assert.equal(anonymous.wrongCredentialDenied,true);
 const survey=read('cloud-more-r3').cases;assert.equal(survey.length,2);assert.deepEqual(survey.map(c=>c.waves.length),[1,2]);
 for(const c of survey){passed(c);assert.match(c.timingProvenance,/without-clock/);for(const w of c.waves){assert.equal(w.replay,true);assert.equal(w.changedReplayDenied,true);if(w.release==='AFTER_COLLECTION'){assert.equal(w.feedback.pending,true);assert(!w.feedback.measurements?.length);}else{assert.equal(w.feedback.measurements[0].metrics[0].value,30);assert.equal(w.feedback.measurements[0].metrics[0].label,'一般任务自我效能感');}}}
 assert.equal(survey[1].revocationDenied,true);
 const currentSurvey=read('cloud-more-r3'),firstFinals=currentSurvey.requests.filter(r=>r.path.endsWith('/final')&&r.status===200&&r.body?.data?.idempotent===false);
 assert.equal(firstFinals.length,3);
 for(const final of firstFinals){const general=currentSurvey.requests.find(r=>r.path===final.path.slice(0,-6)+'/general'&&r.status===200);assert(general);assert.deepEqual(final.body.data.participantFeedbackReceipt,general.body.data,'Current first-feedback projection differs from independent authorized read');}
 assert.equal(new Set(survey.flatMap(c=>c.waves.map(w=>w.finalId))).size,3);
 assert.equal(new Set([schoolOriginal.attemptId,teacher.attemptId,student.attemptId,anonymous.attemptId]).size,4);

 assert.equal(one('cloud-guards-r1',0).foreignOrganizationDenied,true);assert.equal(one('cloud-guards-r1',0).status,'FAIL');
 const guard=one('cloud-guards-r2',0);passed(guard);assert.equal(guard.currentReportReadDenied,true);
 const scores=one('cloud-guards-r2',1);passed(scores);assert.equal(scores.savedScores.length,7);assert(scores.savedScores.every(v=>v===30));
 const axis=one('cloud-axis-r2',0);passed(axis);assert.equal(axis.reportAxis.version,'1.0.1');assert.equal(axis.reportAxis.sourceVersion,'1.0.0');assert.equal(axis.releases.length,7);
 for(const r of axis.releases)assert.equal(r.templateHash,scores.reportTemplateHash);
 const candidate=JSON.parse(readFileSync(base+'cloud-candidate.json'));
 for(const [component,tree]of Object.entries(candidate.components))assert.equal(execFileSync('git',['rev-parse',`HEAD:server-version/${component}`],{encoding:'utf8'}).trim(),tree);
 return {kind:'reviewed-http-database-phases',supportedModes:6,canonicalFinals:7,score:30,currentFirstFeedbackReadEquality:3,ciExecuted:false,originalExecutionSigned:false,originalFailedInvocationsRetained:true,scope:'HTTP/DB with synthetic management bootstrap; no browser or production claim',indexSHA256:review.indexSHA256};
}
