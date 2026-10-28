import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"Feeling distressed or upset is unbearable to me.",
"When I feel distressed or upset, all I can think about is how bad I feel.",
"I can’t handle feeling distressed or upset.",
"My feelings of distress are so intense that they completely take over.",
"There’s nothing worse than feeling distressed or upset.",
"I can tolerate being distressed or upset as well as most people.",
"My feelings of distress or being upset are not acceptable.",
"I’ll do anything to avoid feeling distressed or upset.",
"Other people seem to be able to tolerate feeling distressed or upset better that I can.",
"Being distressed or upset is always a major ordeal for me.",
"I am ashamed of myself when I feel distressed or upset.",
"My feelings of distress or being upset scare me.",
"I’ll do anything to stop feeling distressed or upset.",
"When I feel distressed or upset, I must do something about it immediately.",
"When I feel distressed or upset, I cannot help but concentrate on how bad the distress actually feels." ]
reverse=mapping['reverse_items']; code=lambda i:f'DTS-{i:02}'
citation='Simons JS, Gaher RM. (2005). The Distress Tolerance Scale: Development and validation of a self-report measure. Motivation and Emotion, 29(2), 83–102.'
src='https://healccc.com/wp-content/uploads/2022/10/EEC_00_Distress-Tolerance-Scale.pdf'
refs={'total':list(range(1,16))}
labels={'total':'全部15题均值（统一反向）'}
scores=[{'key':'total','type':'total','label':labels['total'],'description':'15题全部按 6−作答 统一反向后求均值；分数越高代表对负性情绪的耐受评价越好。必须完整作答。','direction':'higher_is_more','canonical':True,'displayPrecision':2,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in refs['total']],'aggregation':'mean'}}]
interpretations=[
{'scoreKey':'total','headline':'对“难受”的评价','source':{'type':'score_only'},'summary':'这份记录反映你如何看待和承受难受的情绪——是觉得不可忍受，还是相信自己对难受有一定的容纳空间。这是对情绪的态度与评价，不是能力测验，更不是性格判决。','bands':[],'guidance':[{'category':'reflection','text':'回想最近一次难受的经历：当时你对自己说了什么？这些话让难受更容易承受，还是更难？'},{'category':'strategy','text':'下一次难受时，试着先不做任何“马上摆脱它”的动作，给自己90秒只是感受它——然后再决定怎么做。'}]},
]
def fixture(name,answer,miss=[]):
 values={i:(6-answer[i] if i in reverse else answer[i]) for i in range(1,16) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,16) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{'total':(None if miss else round(sum(values.values())/len(values),2))},'totalScoreKeys':list(refs)}}
low={i:1 for i in range(1,16)};high={i:5 for i in range(1,16)}
sample={i:(2 if i<=5 else 3 if i<=10 else 4) for i in range(1,16)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-234-bands',sample),fixture('missing-total',sample,[9])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'dts15','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Distress Tolerance Scale, 15-item','abbreviation':'DTS','instrumentFamily':'Distress Tolerance Scale'},
'construct':{'primaryDomain':'SELF_REGULATION','secondaryDomains':[],'constructDefinition':'自评对负性情绪状态的主观耐受能力与评价。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:dbt','construct:dbt_dts_distress_tolerance','distress_tolerance','adult_self_report','self_report','use:reflection','use:research','language_validation:english_original','license:license_unverified','subscale_structure_pending_verification']},
'population':{'populationNotes':'原版验证样本为美国大学生；未建立儿童青少年常模。青少年施测前须评估年龄适配性。原论文四因子（Tolerance/Absorption/Appraisal/Regulation）的题项归属未能在公开来源核实，本版本只实现总分。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':15,'estimatedMinutes':6,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'一般性评价（“想到自己难受/不安的时候”），无指定回忆时段','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原15题顺序与五点同意度选项（1=非常同意 … 5=非常不同意）。','全部题目按官方方向统一反向计分。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版在大学生样本验证了总分与四因子结构。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'耐受评价的反馈不构成临床判断。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'simons-gaher-dts-2005','evidenceType':'STRUCTURAL_VALIDITY','population':'US undergraduate samples','locale':'en','territory':'US','studyDesign':'Scale development with four-factor structure, internal consistency and convergent/discriminant validity.','rating':'SUFFICIENT','citation':citation,'doi':'10.1007/s11031-005-7955-3','url':'https://doi.org/10.1007/s11031-005-7955-3','notes':'原文为订阅期刊，四因子题项归属未逐题核实；本版本仅实现统一反向后的总分均值。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'dts15-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'dts15-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'Think of times that you feel distressed or upset. Select the item from the menu that best describes your beliefs about feeling distressed or upset.','language':'en','version':'1.0.0','source':'题本PDF Directions 行，逐字转录。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Distress Tolerance Scale (DTS)','citation':citation,'url':src,'publicationYear':2005},
'license':{'status':'unknown','redistribution':'unknown','note':'题本页脚标注 © 2005 Jeffrey S. Simons and Raluca M. Gaher；转录自公开网络副本，未取得作者或出版方授权声明。不声称商业、翻译或再分发授权；正式发布前须确认权利。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'dts_agreement_1_5','options':[{'value':'1','label':'Strongly agree','score':1},{'value':'2','label':'Mildly agree','score':2},{'value':'3','label':'Agree and disagree equally','score':3},{'value':'4','label':'Mildly disagree','score':4},{'value':'5','label':'Strongly disagree','score':5}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'dts_agreement_1_5','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'reverse'}} for i in range(1,16)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['total'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['本版本只实现统一反向后的总分均值；原论文四因子的题项归属未经核实，未提供分量表分。','原验证样本为美国大学生；不构成儿童青少年常模。','没有常模、百分位或临床界值；分数是“对难受的评价”，不是能力测验。','各分数必须完整作答是产品保守约定；缺答不会算零。','题本转录自公开网络副本，权利状态未确认。'],'disclaimer':'仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text © 2005 Jeffrey S. Simons and Raluca M. Gaher; transcribed from a publicly posted copy, license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('dts15 native written')
