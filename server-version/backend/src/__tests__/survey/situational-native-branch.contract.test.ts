import {describe,it,expect} from 'vitest'
import {compileSjtNativeBranchFixture,createSjtNativeBranchFinalFixtures,sjtNativeBranchExpectedPaths} from '../fixtures/sjt-native-branch.fixture'
import {compileSurveyNativeSituationalHeader,frozenSurveyNativeSituationalRuntime} from '../../modules/survey/situational-native.definition'
import {projectReachableSituationDefinitionForScoring} from '../../modules/situational/situation-trajectory'
import {scoreSituationalModel} from '../../modules/situational/situation-model-resolver'

describe('shared native source with true authored branches',()=>{
  it('compiles all authored terminal paths and scores only their reachable scientific plane',()=>{
    const compiled=compileSjtNativeBranchFixture()
    const header=compileSurveyNativeSituationalHeader({...compiled.package,releaseStatus:'PUBLISHED'})
    const {snapshot}=frozenSurveyNativeSituationalRuntime({kind:'SJT',executionProtocol:header.protocol,
      compiledDefinition:compiled.package.definition,nativeSituational:{...header,attemptEpoch:1,frozenAt:'2026-10-24T10:00:00.000Z'}})
    expect(snapshot.definitionHash).toBe(compiled.definitionHash)
    const cases=createSjtNativeBranchFinalFixtures('branch-contract',compiled)
    expect(cases.map(c=>c.caseName).sort()).toEqual(Object.keys(sjtNativeBranchExpectedPaths).sort())
    for(const c of cases){
      expect(c.trajectory.nodeKeys.map(key=>{const node=c.definition.flow.nodes.find(n=>n.nodeKey===key)!;return node.nodeType==='SCENE'?node.roundKey:node.nodeKey})).toEqual(c.expectedLogicalPath)
      expect(c.trajectory.reachedTerminal).toBe(true)
      const scored=scoreSituationalModel(projectReachableSituationDefinitionForScoring(c.definition,c.trajectory),c.responses,{responsesValidated:true,independentSceneKeyBySceneKey:Object.fromEntries(c.definition.flow.nodes.flatMap(n=>n.nodeType==='SCENE'?[[n.sceneKey,n.motherSceneKey]]:[]))})
      expect(scored.metrics.find(metric=>metric.key==='coordination')?.value).toBe(c.expected.metrics!.coordination)
    }
  })
})
