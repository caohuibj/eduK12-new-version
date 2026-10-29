import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"You can be a happy person without going out of your way to please other people.",
"I have to impress new acquaintances with my charm, intelligence or wit or they won’t like me.",
"If I put other peoples’ needs before my own, they should help me when I want them to do something for me.",
"It is shameful for a person to display his weaknesses.",
"People will like me even if I am not successful.",
"People who have the marks of success (good looks, fame, wealth) are bound to be happier than people who do not.",
"I should try to impress other people if I want them to like me.",
"If a person I love does not love me it means I am unloveable.",
"I ought to be able to solve my problems quickly and without a great deal of effort.",
"If a person is indifferent to me, it means he does not like me.",
"I should be able to please everybody.",
"Others can care for me even if they know all my weaknesses.",
"If people whom I care about do not care for me, it is awful.",
"Criticism need not upset the person who receives the criticism.",
"My life is wasted unless I am a success.",
"People should prepare for the worst or they will be disappointed.",
"I must be a useful, productive, creative person or life has no purpose.",
"A person should think less of himself if other people do not accept him.",
"I do not need other people’s approval for me to be happy.",
"I can enjoy myself even when others do not like me.",
"My value as a person greatly depends on what others think of me.",
"If I make a foolish statement, it means I am a foolish person.",
"If a person has to be alone for a long period of time, it follows that he has to feel lonely.",
"A person should be able to control what happens to him.",
"If a person is not a success, then his life is meaningless.",
"A person doesn’t need to be well liked in order to be happy.",
"If someone performs a selfish act, this means he is a selfish person.",
"I should always have complete control over my feelings.",
"I should be happy all the time.",
"If people consider me unattractive it need not upset me.",
"Whenever I take a chance or risk I am only looking for trouble.",
"A person cannot change his emotional reactions even if he knows they are harmful to him.",
"I may be able to influence other people’s behavior, but I cannot control it.",
"People will reject you if they know you weaknesses.",
"People should be criticized for their mistakes.",
"One should look for a practical solution to problems rather than a perfect solution.",
"If I do well, it probably is due to chance; if I do badly, it is probably my own fault.",
"The way to get people to like you is to impress them with your personality.",
"Turning to someone else for advise or help is an admission of weakness.",
"A person should do well at everything he undertakes." ]
reverse=mapping['reverse_items']; code=lambda i:f'DASB-{i:02}'
citation='Weissman AN, Beck AT. (1978). Development and validation of the Dysfunctional Attitude Scale: A preliminary investigation. Paper presented at the meeting of the American Educational Research Association, Toronto.'
src='https://beckinstitute.org/wp-content/uploads/2021/06/DAS-Full-Documents-1.pdf'
refs={'total':list(range(1,41))}
labels={'total':'全部40题总和（失调信念强度）'}
scores=[{'key':'total','type':'total','label':labels['total'],'description':'30个失调信念题按“完全同意=7”直接计分，10个功能信念题（1/5/12/14/19/20/26/30/33/36）按 8−作答 反向计分，全部求和；必须完整作答。范围40–280，分数越高代表失调态度越强。','direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in refs['total']],'aggregation':'sum'}}]
interpretations=[
{'scoreKey':'total','headline':'态度清单，不是成绩单','source':{'type':'score_only'},'summary':'这份记录汇总了你对自己的成就、认可、控制与关系所持态度的“严格程度”。态度是长期形成的假设，不是事实清单，也不是缺陷证明；它们可以被看见、被检验、被更新。B表与A表是平行版本，分数不能互相换算。','bands':[],'guidance':[{'category':'reflection','text':'40条态度里，哪一条在你最近压力大的时候最常“自动发言”？'},{'category':'strategy','text':'挑一条最刺眼的，写下“这条态度从哪里学来的”和“它帮过我什么、又限制了我什么”。'}]},
]
def fixture(name,answer,miss=[]):
 values={i:(8-answer[i] if i in reverse else answer[i]) for i in range(1,41) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,41) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{'total':(None if miss else sum(values.values()))},'totalScoreKeys':list(refs)}}
low={i:7 if i in reverse else 1 for i in range(1,41)};high={i:1 if i in reverse else 7 for i in range(1,41)}
sample={i:(3 if i in reverse else 5) for i in range(1,41)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-rev3-rest5',sample),fixture('missing-total',sample,[1])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'dasb40','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Dysfunctional Attitude Scale, Form B (40 items)','abbreviation':'DAS-B','instrumentFamily':'Dysfunctional Attitude Scale'},
'construct':{'primaryDomain':'SELF_REGULATION','secondaryDomains':[],'constructDefinition':'自评成就、认可、控制与关系方面的失调性态度（功能失调信念）的强度；与DAS-A为平行表。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:cbt','construct:cbt_das_dysfunctional_attitudes','dysfunctional_attitudes','core_beliefs','adult_self_report','self_report','use:reflection','use:research','language_validation:english_original','license:license_unverified']},
'population':{'populationNotes':'原版开发与多数验证基于成人（大学生与抑郁临床对照）样本；未建立儿童青少年常模。K12学生施测前须评估年龄适配性。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':40,'estimatedMinutes':15,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'一般态度（“按你多数时候的想法作答”），无指定回忆时段','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原40题顺序与七点同意度选项（完全同意=7 … 完全不同意=1）。','10个功能信念题按官方计分表反向计分（8−作答）。','原表第34题作 “you weaknesses”、第39题作 “advise”，均按原文逐字保留。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版用于抑郁易感性研究与CBT疗效研究的常用指标；B表与A表平行。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'态度强度反馈不构成诊断或人格判定。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'weissman-beck-das-1978','evidenceType':'STRUCTURAL_VALIDITY','population':'US adults (college and depressed samples in original validation)','locale':'en','territory':'US','studyDesign':'Scale development and validation of the DAS; parallel forms A and B refined from the 100-item version.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'B表反向键取自同一官方计分表FORM B列（1/5/12/14/19/20/26/30/33/36），题文内容逐题核对为功能信念方向；#12与#30在A/B两表均列为功能题。无本地常模，无临床界值。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'dasb40-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'dasb40-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'REMEMBER, ANSWER EACH STATEMENT ACCORDING TO THE WAY YOU THINK MOST OF THE TIME','language':'en','version':'1.0.0','source':'Beck Institute DAS Full Documents 中 DAS-B 表单页指导语，逐字转录。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Dysfunctional Attitude Scale, Form B (DAS-B)','citation':citation,'url':src,'publicationYear':1978},
'license':{'status':'unknown','redistribution':'unknown','note':'题本与官方计分说明来自 Beck Institute 评估工具页公开下载（DAS-Full-Documents）；页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布前须与 Beck Institute 确认权利。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'dasb_agree_1_7','options':[{'value':'7','label':'Totally agree','score':7},{'value':'6','label':'Agree very much','score':6},{'value':'5','label':'Agree slightly','score':5},{'value':'4','label':'Neutral','score':4},{'value':'3','label':'Disagree slightly','score':3},{'value':'2','label':'Disagree very much','score':2},{'value':'1','label':'Totally disagree','score':1}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'dasb_agree_1_7','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'reverse' if i in reverse else 'identity'}} for i in range(1,41)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['total'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['总分反映失调态度的“强度汇总”，不是诊断指标，也不预测抑郁发生。','B表与A表为平行版本，分数不能互换、相加或比较。','原验证样本为成人；不构成儿童青少年常模。','没有常模、百分位或临床界值；分数不能用于疗效判定。','各分数必须完整作答是产品保守约定；缺答不会算零。','题本转录自 Beck Institute 公开下载资料，权利状态未确认。'],'disclaimer':'仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text transcribed from the Beck Institute DAS Full Documents (Weissman & Beck, 1978); license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('dasb40 native written')
