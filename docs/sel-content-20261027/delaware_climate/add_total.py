# -*- coding: utf-8 -*-
import json
from pathlib import Path
p=Path(__file__).parent/'native/instrument.ts';s=p.read_text();out=json.loads(s.split(' = ',1)[1].rsplit(' satisfies ',1)[0]);d=out['executable']['definition'];scoring=d['scoring'];scoring['scorerKey']='delaware_climate_2020_v1'
for score in scoring['scores']: score['range']={'min':1,'max':4}
code=lambda i:f'DSCS-{i:02d}'
scoring['scores'].append({'key':'climate_total','type':'total','label':'Total School Climate','description':'Sum of all 30 climate items, reversing bullying items 9, 14 and 26; range 30–120.','direction':'higher_is_more','canonical':True,'displayPrecision':0,'range':{'min':30,'max':120},'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in range(1,31)],'aggregation':'sum'}})
report=d['report'];report['primaryScoreKeys']=['climate_total'];report['scoreOrder'].append('climate_total');report['interpretations'].append({'scoreKey':'climate_total','headline':'Total school climate','source':{'type':'score_only'},'summary':'This sum combines the 30 climate responses. The three bullying responses are reversed for this total; a higher total means more positive reported climate. One student’s total is not a school average.','bands':[],'guidance':[{'category':'reflection','text':'Combine a suitable group summary with student voice and other evidence to identify one area for school improvement.'}]});out['catalog']['administration']['layoutConstraints'][1]='Bullying subscale stays in its original direction; total reverses items 9, 14 and 26 and sums all 30 content items.'
for case in out['executable']['goldenCases']:
 answers={x['itemCode']:int(x['responseValue']) for x in case['answers']}; v=[answers.get(code(i)) for i in range(1,31)]
 case['expected']['scores']['climate_total']=None if any(x is None for x in v) else sum((5-x if i in (9,14,26) else x) for i,x in enumerate(v,1));case['expected']['totalScoreKeys'].append('climate_total')
keys=[x['key'] for x in scoring['scores']]
for good in (True,False):
 answers={i: (1 if i in (9,14,26) else 4) if good else (4 if i in (9,14,26) else 1) for i in range(1,31)};answers[31]=1
 out['executable']['goldenCases'].append({'name':'total-max' if good else 'total-min','answers':[{'itemCode':code(i),'responseValue':str(v)} for i,v in answers.items()],'expected':{'quality':'interpretable','scores':{**{k:(1 if good else 4) if k=='bullying' else (4 if good else 1) for k in keys[:-1]},'climate_total':120 if good else 30},'totalScoreKeys':keys}})
out['executable']['scorerPlugins']=['__SCORER_PLUGIN__']
text=json.dumps(out,ensure_ascii=False,indent=2).replace('"__SCORER_PLUGIN__"',"{ key: 'delaware_climate_2020_v1', version: '1.0.0', scorer: delawareClimateScorer }")
p.write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\nimport { delawareClimateScorer } from './scorer'\n\nexport const SCALE_INSTRUMENT_SOURCE = "+text+' satisfies ScaleInstrumentSourceV1\n')
