import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {SpatialMemoryTask} from './SpatialMemoryTask'
import {SpatialReport} from './SpatialReport'
import {SPATIAL_IDENTITY,spatialPlan,type SpatialRaw} from './generated/protocol'
import {isSpatialReport,type SpatialReport as PublicReport} from './generated/report'
import {spatialEnvelope} from './generated/envelope'
import {digest,validateSpatialContext,type SpatialContext,type SpatialDraft,type SpatialFinal} from './contracts'

export const NativeSpatialRunner=createNativeContentRunner<SpatialContext,SpatialDraft,SpatialFinal,SpatialRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateSpatialContext({contextKey:key,snapshot:snapshot as SpatialContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(spatialPlan(snapshot.config as SpatialContext['snapshot']['config'],c.randomSeed))})},
 manifest:c=>[...spatialPlan(c.snapshot.config,c.randomSeed),...[0,1,2].flatMap(round=>spatialPlan(c.snapshot.config,c.randomSeed,'practice',round))],envelope:spatialEnvelope,isReport:isSpatialReport,Component:SpatialMemoryTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==SPATIAL_IDENTITY.testType||snapshot.engineVersion!==SPATIAL_IDENTITY.engineVersion||snapshot.scoringVersion!==SPATIAL_IDENTITY.scoringVersion||snapshot.configVersion!==SPATIAL_IDENTITY.configVersion||!isSpatialReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <SpatialReport report={snapshot.report}/>
}
