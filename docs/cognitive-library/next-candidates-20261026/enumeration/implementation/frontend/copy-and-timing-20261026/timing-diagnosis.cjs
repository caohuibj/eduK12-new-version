/** Read-only developer analysis of frozen observations. No exposure, scorer replay or strategy change. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root='/workspace/eduK12-new-version',out=__dirname,parent=path.dirname(out)
const rawPath=path.join(parent,'browser-captured-raw.json')
const capturePath=path.join(root,'server-version/frontend/src/modules/cognitive/tasks/enumeration/capture.ts')
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const beforeHash=hash(rawPath),raw=JSON.parse(fs.readFileSync(rawPath,'utf8'))
const artifact=raw.artifacts[0],nominalMs=artifact.context.recipe.formalExposureMs
const source=fs.readFileSync(capturePath,'utf8'),lines=source.split('\n')
const sourceEvidence=lines.flatMap((line,index)=>/stimulusOnsetPerfMs = now|this\.stage === 'stimulus'.*now - t\.stimulusOnsetPerfMs|t\.maskOnsetPerfMs = now|this\.frames\.push/.test(line)?[{line:index+1,text:line.trim()}]:[])
const rows=raw.records.filter(value=>value.record.core.phase==='test').map(value=>{
 const r=value.record,c=r.core,stim=r.raw.frames.filter(f=>f.stage==='stimulus'),mask=r.raw.frames.filter(f=>f.stage==='mask')
 const last=stim[stim.length-1].atPerfMs,onset=c.stimulusOnsetPerfMs,firstMask=mask[0].atPerfMs
 const elapsed=last-onset,maskElapsed=firstMask-onset
 return {trialIndex:c.plan.trialIndex,nominalMs,stimulusOnsetPerfMs:onset,firstStimulusFramePerfMs:stim[0].atPerfMs,
  firstDrawRecordEqualsOnset:stim[0].atPerfMs===onset,stimulusFrameCount:stim.length,stimulusFrameTimesMs:stim.map(f=>f.atPerfMs),
  stimulusFrameElapsedMs:stim.map(f=>f.atPerfMs-onset),lastStimulusPerfMs:last,
  lastStimulusElapsedMs:elapsed,lastStimulusElapsedPrecision17:elapsed.toPrecision(17),
  remainingToNominalAtLastStimulusMs:nominalMs-elapsed,
  conditionAtLastStimulus:elapsed>=nominalMs,firstMaskPerfMs:firstMask,coreMaskOnsetPerfMs:c.maskOnsetPerfMs,
  firstMaskEqualsCoreMaskOnset:firstMask===c.maskOnsetPerfMs,
  firstMaskElapsedMs:maskElapsed,conditionAtFirstMask:maskElapsed>=nominalMs,
  lastStimulusToFirstMaskMs:firstMask-last,
  stimulusAndBoundaryGapsMs:[...stim.slice(1).map((f,i)=>f.atPerfMs-stim[i].atPerfMs),firstMask-last],
  rawTimingIncomplete:c.timingFacts.incomplete,rawTimingOverflow:c.timingFacts.overflow}
})
const seven=rows.filter(row=>row.stimulusFrameCount===4)
if(rows.length!==25||seven.length!==7||hash(rawPath)!==beforeHash)throw Error('Frozen diagnostic input mismatch')
const report={analysisKind:'DEVELOPER_READ_ONLY_DIAGNOSIS_NOT_INDEPENDENT_SCIENTIFIC_CONCLUSION',sourceBase:'94152032885d5cbaf149a15ec03d5a0c72ea2c67',
 raw:{file:path.relative(root,rawPath),sha256:beforeHash,unchangedAfterRead:hash(rawPath)===beforeHash},
 captureSource:{file:path.relative(root,capturePath),sha256:hash(capturePath),relevantLines:sourceEvidence},
 recipe:{id:artifact.context.recipe.id,source:artifact.context.recipe.source,nominalFormalExposureMs:nominalMs},
 onsetSemantics:'First stimulus rAF callback sets onset and records its stage using the same passed timestamp; EnumerationTask then issues canvas draw commands in that callback. These are callback/draw-command records, not measured physical pixel onset.',
 sevenFourDrawRecords:seven,all25FormalRecords:rows,
 provedBySavedNumbersAndSource:[
  'All seven final stimulus callbacks have elapsed about49.9ms, about0.1ms below the nominal50ms comparison, so the existing >= comparison is false there.',
  'Their next saved callback is about16.7ms later, about66.6ms from onset; the >= comparison is true and this callback is the first mask record.',
  'In all seven, first stimulus record exactly equals core stimulus onset, and first mask record exactly equals core mask onset; the extra draw is not an onset/count labelling offset in these saved records.',
  'The saved stimulus/boundary gaps are about16.6–16.7ms with no reported overflow/incomplete flag; these records do not contain a long missing-callback gap explaining the extra draw.',
  'The difference to the threshold is about0.1ms, not only machine rounding of an otherwise exactly50.0ms subtraction. The stored callback timestamps themselves are below the threshold.'
 ],
 notEstablished:[
  'Why these callback timestamps land at49.9 rather than50.0/50.1: compositor scheduling, timer precision/privacy quantization, timestamp generation and phase alignment were not independently measured.',
  'Actual pixels displayed, scanout duration, monitor refresh rate/stability or physical stimulus onset/offset.',
  'Whether a three-refresh-frame policy or another quantization/tolerance policy matches the cited protocol on real target devices; needs independent source review and any necessary user approval.',
  'Scientific acceptability of66.6ms or individual interpretation; no acceptance threshold was approved.'
 ],policy:'No epsilon, tolerance, frame-count policy, capture source, frozen raw, scorer or individual report gate changed. Formal administration remains prohibited.'}
fs.writeFileSync(path.join(out,'timing-diagnosis.json'),JSON.stringify(report,null,2)+'\n')
const table=seven.map(r=>`| ${r.trialIndex} | ${r.stimulusFrameTimesMs.join(', ')} | ${r.lastStimulusElapsedMs.toFixed(4)} | ${r.firstMaskPerfMs} | ${r.lastStimulusToFirstMaskMs.toFixed(4)} | ${r.firstMaskElapsedMs.toFixed(4)} |`).join('\n')
fs.writeFileSync(path.join(out,'timing-diagnosis.md'),`# 冻结7例逐帧开发诊断\n\n这是开发者对已有观测和源码的只读分析，不是独立审计或科学准入结论。原raw SHA256：${beforeHash}，读取后不变。未运行新曝光/计分，也未修改算法或容差。\n\n25条中7条记录4次stimulus绘制回调；其余18条为3次。下表为0-based trialIndex，所有时间ms：\n\n| index | stimulus回调时间 | 最后stimulus距onset | 首mask回调 | 最后stimulus→首mask | 首mask距onset |\n| --- | --- | --- | --- | --- | --- |\n${table}\n\n这7例在最后一次stimulus回调时均约49.9ms，距名义50ms尚差约0.1ms，源码的elapsed>=50判定因此为false；下一保存回调约16.7ms后到来，elapsed约66.6ms，为true，转入mask。最后0.1ms差距不是仅把‘精确50.0ms减法的二进制尾数’当成49.9ms；已有API时间戳本身落在阈值以下。不能据此把浮点/时钟分辨率或浏览器机制认定为独立根因。\n\n首次stimulus记录与core onset一致；首次mask记录与core maskOnset一致。capture在首次stimulus rAF设置onset、按同一传入timestamp记帧，Task随后在同回调发出canvas绘制命令。由此可核当前记录计数并无一帧的onset标签偏移；尚不能证明这些命令对应的实际屏幕像素onset/offset。\n\n七例保存间隔约16.6–16.7ms，没有overflow/incomplete标记，保存序列没有一个异常长间隔可以解释为丢失回调。没有额外独立测量计时精度、浏览器量化、compositor调度、真实刷新或物理曝光，因此不能把具体浏览器机制/系统负载/设备差异当成已归因结论。\n\n独立审核仍需决定原协议与目标设备的帧量化/容差策略及必要用户确认。这里不提出epsilon，不放宽准入，不静默换成三帧；正式施测继续禁止。完整数值、IEEE754 precision17、25例对照和源码行号见timing-diagnosis.json。\n`)
console.log(JSON.stringify({rawSha256:beforeHash,formalRecords:rows.length,sevenIndices:seven.map(r=>r.trialIndex),lastElapsedMs:seven.map(r=>r.lastStimulusElapsedMs),nextGapMs:seven.map(r=>r.lastStimulusToFirstMaskMs),sourceSha256:hash(capturePath)}))
