/** Read-only statistics, not an admission-policy implementation or policy execution. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root='/workspace/eduK12-new-version',out=__dirname,input=path.join(path.dirname(out),'browser-captured-raw.json')
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const inputHash=sha(input),raw=JSON.parse(fs.readFileSync(input,'utf8'))
const median=v=>{const a=[...v].sort((x,y)=>x-y),k=Math.floor(a.length/2);return a.length%2?a[k]:(a[k-1]+a[k])/2}
const p95=v=>[...v].sort((a,b)=>a-b)[Math.ceil(.95*v.length)-1]
const records=raw.records.map(item=>{
 const r=item.record,t=r.raw.frames.map(f=>f.atPerfMs),d=t.slice(1).map((v,i)=>v-t[i]),P=(t[t.length-1]-t[0])/d.length
 const deviations=d.map(v=>Math.abs(v-P)),windows=[]
 for(let start=0;start+60<=d.length;start+=60)windows.push({firstInterval:start,count:60,P:(t[start+60]-t[start])/60})
 return {phase:r.core.phase,trialIndex:r.core.plan.trialIndex,recordedTimestampCount:t.length,continuousIntervalCount:d.length,
  spanMs:t[t.length-1]-t[0],spanMeanIntervalMs:P,medianIntervalMs:median(d),intervalMinMs:Math.min(...d),intervalMaxMs:Math.max(...d),
  nearestRankP95AbsDeviationFromSpanMeanMs:p95(deviations),maxAbsDeviationFromSpanMeanMs:Math.max(...deviations),
  completeNonoverlapping60IntervalWindows:windows,windowPSpanMs:windows.length?Math.max(...windows.map(w=>w.P))-Math.min(...windows.map(w=>w.P)):null,
  enoughFor30WarmupPlus240Measurement:false,
  stimulusFrameCount:r.core.timingFacts.stimulusFrameCount,stimulusRafSpanMs:r.core.maskOnsetPerfMs-r.core.stimulusOnsetPerfMs,
  hasCallbackEnteredPerfMs:r.raw.frames.some(f=>Object.hasOwn(f,'callbackEnteredPerfMs')),
  hasDrawCommandStartPerfMs:r.raw.frames.some(f=>Object.hasOwn(f,'drawCommandStartedPerfMs')),
  hasDrawCommandReturnPerfMs:r.raw.frames.some(f=>Object.hasOwn(f,'drawCommandReturnedPerfMs'))}
})
if(sha(input)!==inputHash)throw Error('Frozen raw changed during read')
const formal=records.filter(r=>r.phase==='test')
const report={kind:'READ_ONLY_DESCRIPTIVE_STATISTICS_NOT_POLICY_EXECUTION',base:'97883153077a9527b6b5442feec7055f72933ab4',input:path.relative(root,input),inputSha256:inputHash,
 formula:{P:'(r_last-r_first)/interval_count; descriptive per recorded segment, not the uncollected240-interval preflight',median:'ordinary ordered median',p95:'nearest-rank sorted absolute deviations, rank=ceil(.95*n), 1-based; no interpolation',segments:'do not join across response/idle/page/attempt'},
 sample:{records:records.length,formalRecords:formal.length,source:'one cloud headless Chromium run with synthetic host/calibration; not physical-device samples',full270IntervalSegments:records.filter(r=>r.continuousIntervalCount>=270).length,
 formalIntervalCounts:{min:Math.min(...formal.map(r=>r.continuousIntervalCount)),max:Math.max(...formal.map(r=>r.continuousIntervalCount))},
 formalSpanMeanMs:{min:Math.min(...formal.map(r=>r.spanMeanIntervalMs)),max:Math.max(...formal.map(r=>r.spanMeanIntervalMs))},
 formalP95AbsDeviationMs:{min:Math.min(...formal.map(r=>r.nearestRankP95AbsDeviationFromSpanMeanMs)),max:Math.max(...formal.map(r=>r.nearestRankP95AbsDeviationFromSpanMeanMs))},
 formalMaxAbsDeviationMs:Math.max(...formal.map(r=>r.maxAbsDeviationFromSpanMeanMs)),formalWindowPSpanMsMax:Math.max(...formal.map(r=>r.windowPSpanMs)),
 fourStimulusDrawIndices:formal.filter(r=>r.stimulusFrameCount===4).map(r=>r.trialIndex)},records,
 unsupportedInferences:['No complete30+240 preflight segment exists; cannot award a preflight pass.','No performance.now probe/callback-entry/draw-command readings exist; cannot infer zero cost or precision.','No120/VRR/device evidence, no physical scanout/exposure proof.','No admission result, new renderer execution, epsilon or tolerance modification.']}
fs.writeFileSync(path.join(out,'raw-statistics.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report.sample))
