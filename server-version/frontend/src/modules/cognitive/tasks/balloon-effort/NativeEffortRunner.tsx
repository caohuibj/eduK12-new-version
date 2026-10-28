import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {BalloonEffortTask} from './BalloonEffortTask'
import {EffortReport} from './EffortReport'
import {EFFORT_IDENTITY,effortPlan,type EffortRaw} from './generated/protocol'
import {isEffortReport,type EffortReport as PublicReport} from './generated/report'
import {effortEnvelope} from './generated/envelope'
import {digest,validateEffortContext,effortManifest,type EffortContext,type EffortDraft,type EffortFinal} from './contracts'

export const NativeEffortRunner=createNativeContentRunner<EffortContext,EffortDraft,EffortFinal,EffortRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateEffortContext({contextKey:key,snapshot:snapshot as EffortContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(effortPlan(snapshot.config as EffortContext['snapshot']['config'],c.randomSeed))})},
 manifest:effortManifest,envelope:effortEnvelope,isReport:isEffortReport,Component:BalloonEffortTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==EFFORT_IDENTITY.testType||snapshot.engineVersion!==EFFORT_IDENTITY.engineVersion||snapshot.scoringVersion!==EFFORT_IDENTITY.scoringVersion||snapshot.configVersion!==EFFORT_IDENTITY.configVersion||!isEffortReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <EffortReport report={snapshot.report}/>
}
