import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {DualArrowTask} from './DualArrowTask'
import {DualReport} from './DualReport'
import {DUAL_IDENTITY,dualPlan,type DualRaw} from './generated/protocol'
import {isDualReport,type DualReport as PublicReport} from './generated/report'
import {dualEnvelope} from './generated/envelope'
import {digest,validateDualContext,dualManifest,type DualContext,type DualDraft,type DualFinal} from './contracts'

export const NativeDualRunner=createNativeContentRunner<DualContext,DualDraft,DualFinal,DualRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateDualContext({contextKey:key,snapshot:snapshot as DualContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(dualPlan(snapshot.config as DualContext['snapshot']['config'],c.randomSeed))})},
 manifest:dualManifest,envelope:dualEnvelope,isReport:isDualReport,Component:DualArrowTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==DUAL_IDENTITY.testType||snapshot.engineVersion!==DUAL_IDENTITY.engineVersion||snapshot.scoringVersion!==DUAL_IDENTITY.scoringVersion||snapshot.configVersion!==DUAL_IDENTITY.configVersion||!isDualReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <DualReport report={snapshot.report}/>
}
