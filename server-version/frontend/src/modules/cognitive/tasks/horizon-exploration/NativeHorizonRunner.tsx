import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {HorizonTask} from './HorizonTask'
import {HorizonReport} from './HorizonReport'
import {HORIZON_IDENTITY,horizonPlan,type HorizonRaw} from './generated/protocol'
import {isHorizonReport,type HorizonReport as PublicReport} from './generated/report'
import {horizonEnvelope} from './generated/envelope'
import {digest,validateHorizonContext,horizonManifest,type HorizonContext,type HorizonDraft,type HorizonFinal} from './contracts'

export const NativeHorizonRunner=createNativeContentRunner<HorizonContext,HorizonDraft,HorizonFinal,HorizonRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateHorizonContext({contextKey:key,snapshot:snapshot as HorizonContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(horizonPlan(snapshot.config as HorizonContext['snapshot']['config'],c.randomSeed))})},
 manifest:horizonManifest,envelope:horizonEnvelope,isReport:isHorizonReport,Component:HorizonTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==HORIZON_IDENTITY.testType||snapshot.engineVersion!==HORIZON_IDENTITY.engineVersion||snapshot.scoringVersion!==HORIZON_IDENTITY.scoringVersion||snapshot.configVersion!==HORIZON_IDENTITY.configVersion||!isHorizonReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <HorizonReport report={snapshot.report}/>
}
