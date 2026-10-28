import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"It is difficult to be happy unless one is good looking, intelligent, rich and creative.",
"Happiness is more a matter of my attitude towards myself than the way other people feel about me.",
"People will probably think less of me if I make a mistake.",
"If I do not do well all the time, people will not respect me.",
"Taking even a small risk is foolish because the loss is likely to be a disaster.",
"It is possible to gain another person’s respect without being especially talented at anything.",
"I cannot be happy unless most people I know admire me.",
"If a person asks for help, it is a sign of weakness.",
"If I do not do as well as other people, it means I am an inferior human being.",
"If I fail at my work, then I am a failure as a person.",
"If you cannot do something well, there is little point in doing it at all.",
"Making mistakes is fine because I can learn from them.",
"If someone disagrees with me, it probably indicates that he does not like me.",
"If I fail partly, it is as bad as being a complete failure.",
"If other people know what you are really like, they will think less of you.",
"I am nothing if a person I love does not love me.",
"One can get pleasure from an activity regardless of the result.",
"People should have a reasonable likelihood of success before undertaking anything.",
"My value as a person depends greatly on what others think of me.",
"If I don’t set the highest standards for myself, I am likely to end up a second-rate person.",
"If I am to be a worthwhile person, I must be truly outstanding in at least one major respect.",
"People who have good ideas are more worthy than those who do not.",
"I should be upset if I make a mistake.",
"My own opinions of myself are more important than others’ opinions of me.",
"To be a good, moral, worthwhile person, I must help everyone who needs it.",
"If I ask a question, it makes me look inferior.",
"It is awful to be disapproved of by other people important to you.",
"If you don’t have other people to lean on, you are bound to be sad.",
"I can reach important goals without slave driving myself.",
"It is possible for a person to be scolded and not get upset.",
"I cannot trust other people because they might be cruel to me.",
"If others dislike you, you cannot be happy.",
"It is best to give up your own interests in order to please other people.",
"My happiness depends more on other people than it does on me.",
"I do not need the approval of other people in order to be happy.",
"If a person avoids problems, the problems tend to go away.",
"I can be happy even if I miss out on many of the good things in life.",
"What other people think about me is very important.",
"Being isolated from other people is bound to lead to unhappiness.",
"I can find happiness without being loved by another person." ]
reverse=mapping['reverse_items']; code=lambda i:f'DASA-{i:02}'
citation='Weissman AN, Beck AT. (1978). Development and validation of the Dysfunctional Attitude Scale: A preliminary investigation. Paper presented at the meeting of the American Educational Research Association, Toronto.'
src='https://beckinstitute.org/wp-content/uploads/2021/06/DAS-Full-Documents-1.pdf'
refs={'total':list(range(1,41))}
labels={'total':'全部40题总和（失调信念强度）'}
scores=[{'key':'total','type':'total','label':labels['total'],'description':'30个失调信念题按“完全同意=7”直接计分，10个功能信念题（2/6/12/17/24/29/30/35/37/40）按 8−作答 反向计分，全部求和；必须完整作答。范围40–280，分数越高代表失调态度越强。','direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in refs['total']],'aggregation':'sum'}}]
interpretations=[
{'scoreKey':'total','headline':'态度清单，不是成绩单','source':{'type':'score_only'},'summary':'这份记录汇总了你对自己的成就、认可、控制与关系所持态度的“严格程度”。态度是长期形成的假设，不是事实清单，也不是缺陷证明；它们可以被看见、被检验、被更新。','bands':[],'guidance':[{'category':'reflection','text':'40条态度里，哪一条在你最近压力大的时候最常“自动发言”？'},{'category':'strategy','text':'挑一条最刺眼的，写下“这条态度从哪里学来的”和“它帮过我什么、又限制了我什么”。'}]},
]
def fixture(name,answer,miss=[]):
 values={i:(8-answer[i] if i in reverse else answer[i]) for i in range(1,41) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,41) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{'total':(None if miss else sum(values.values()))},'totalScoreKeys':list(refs)}}
low={i:7 if i in reverse else 1 for i in range(1,41)};high={i:1 if i in reverse else 7 for i in range(1,41)}
sample={i:(3 if i in reverse else 5) for i in range(1,41)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-rev3-rest5',sample),fixture('missing-total',sample,[2])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'dasa40','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Dysfunctional Attitude Scale, Form A (40 items)','abbreviation':'DAS-A','instrumentFamily':'Dysfunctional Attitude Scale'},
'construct':{'primaryDomain':'SELF_REGULATION','secondaryDomains':[],'constructDefinition':'自评成就、认可、控制与关系方面的失调性态度（功能失调信念）的强度。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:cbt','construct:cbt_das_dysfunctional_attitudes','dysfunctional_attitudes','core_beliefs','adult_self_report','self_report','use:reflection','use:research','language_validation:english_original','license:license_unverified']},
'population':{'populationNotes':'原版开发与多数验证基于成人（大学生与抑郁临床对照）样本；未建立儿童青少年常模。K12学生施测前须评估年龄适配性。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':40,'estimatedMinutes':15,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'一般态度（“按你多数时候的想法作答”），无指定回忆时段','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原40题顺序与七点同意度选项（完全同意=7 … 完全不同意=1）。','10个功能信念题按官方计分表反向计分（8−作答）。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版用于抑郁易感性研究与CBT疗效研究的常用指标。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'态度强度反馈不构成诊断或人格判定。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'weissman-beck-das-1978','evidenceType':'STRUCTURAL_VALIDITY','population':'US adults (college and depressed samples in original validation)','locale':'en','territory':'US','studyDesign':'Scale development and validation of the DAS; parallel forms A and B refined from the 100-item version.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'反向键以Beck Institute官方计分表为准，并与de Graaf et al. (2009) 对原计分键的引用一致；de Graaf指出反向题易形成方法因子，解读总分时须谨慎。无本地常模，无临床界值。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'dasa40-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'dasa40-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'REMEMBER, ANSWER EACH STATEMENT ACCORDING TO THE WAY YOU THINK MOST OF THE TIME','language':'en','version':'1.0.0','source':'Beck Institute DAS Full Documents 中 DAS-A 表单页指导语，逐字转录。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Dysfunctional Attitude Scale, Form A (DAS-A)','citation':citation,'url':src,'publicationYear':1978},
'license':{'status':'unknown','redistribution':'unknown','note':'题本与官方计分说明来自 Beck Institute 评估工具页公开下载（DAS-Full-Documents）；页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布前须与 Beck Institute 确认权利。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'dasa_agree_1_7','options':[{'value':'7','label':'Totally agree','score':7},{'value':'6','label':'Agree very much','score':6},{'value':'5','label':'Agree slightly','score':5},{'value':'4','label':'Neutral','score':4},{'value':'3','label':'Disagree slightly','score':3},{'value':'2','label':'Disagree very much','score':2},{'value':'1','label':'Totally disagree','score':1}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'dasa_agree_1_7','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'reverse' if i in reverse else 'identity'}} for i in range(1,41)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['total'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['总分反映失调态度的“强度汇总”，不是诊断指标，也不预测抑郁发生。','原验证样本为成人；不构成儿童青少年常模。','反向题易形成方法因子（de Graaf et al., 2009），总分解读须谨慎。','没有常模、百分位或临床界值；分数不能用于疗效判定。','各分数必须完整作答是产品保守约定；缺答不会算零。','题本转录自 Beck Institute 公开下载资料，权利状态未确认。'],'disclaimer':'仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text transcribed from the Beck Institute DAS Full Documents (Weissman & Beck, 1978); license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('dasa40 native written')
