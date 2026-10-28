import React from 'react'
import {createNativeContentRunner,nativeContentSnapshot} from '../../core/NativeContentRunner'
import {isNativePublicReportSnapshot} from '../../core/native-public-report'
import type {NativePublicReportSnapshot} from '../../types'
import {VisualSearchTask} from './VisualSearchTask'
import {SearchReport} from './SearchReport'
import {SEARCH_IDENTITY,searchPlan,type SearchRaw} from './generated/protocol'
import {isSearchReport,type SearchReport as PublicReport} from './generated/report'
import {searchEnvelope} from './generated/envelope'
import {digest,validateSearchContext,searchManifest,type SearchContext,type SearchDraft,type SearchFinal} from './contracts'

export const NativeSearchRunner=createNativeContentRunner<SearchContext,SearchDraft,SearchFinal,SearchRaw,PublicReport>({
 createContext:(c,key)=>{const snapshot=nativeContentSnapshot(c);return validateSearchContext({contextKey:key,snapshot:snapshot as SearchContext['snapshot'],randomSeed:c.randomSeed,manifestHash:digest(searchPlan(snapshot.config as SearchContext['snapshot']['config'],c.randomSeed))})},
 manifest:searchManifest,envelope:searchEnvelope,isReport:isSearchReport,Component:VisualSearchTask,
})
export function NativeContentReport({snapshot}:{snapshot:NativePublicReportSnapshot}){
 if(!isNativePublicReportSnapshot(snapshot)||snapshot.testType!==SEARCH_IDENTITY.testType||snapshot.engineVersion!==SEARCH_IDENTITY.engineVersion||snapshot.scoringVersion!==SEARCH_IDENTITY.scoringVersion||snapshot.configVersion!==SEARCH_IDENTITY.configVersion||!isSearchReport(snapshot.report))return <p role="alert">已保存公开报告暂时无法核对。</p>
 return <SearchReport report={snapshot.report}/>
}
