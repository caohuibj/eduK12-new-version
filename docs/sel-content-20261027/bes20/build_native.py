import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
'My friend’s emotions don’t affect me much.',
'After being with a friend who is sad about something, I usually feel sad.',
'I can understand my friend’s happiness when she/he does well at something.',
'I get frightened when I watch characters in a good scary movie.',
'I get caught up in other people’s feelings easily.',
'I find it hard to know when my friends are frightened.',
'I don’t become sad when I see other people crying.',
'Other people’s feelings don’t bother me at all.',
'When someone is feeling ‘down’ I can usually understand how they feel.',
'I can usually work out when my friends are scared.',
'I often become sad when watching sad things on TV or in films.',
'I can often understand how people are feeling even before they tell me.',
'Seeing a person who has been angered has no effect on my feelings.',
'I can usually work out when people are cheerful.',
'I tend to feel scared when I am with friends who are afraid.',
'I can usually realize quickly when a friend is angry.',
'I often get swept up in my friend’s feelings.',
'My friend’s unhappiness doesn’t make me feel anything.',
'I am not usually aware of my friend’s feelings.',
'I have trouble figuring out when my friends are happy.' ]
reverse=mapping['reverse_items'];dimensions=mapping['dimensions']; code=lambda i:f'BES-{i:02}'
citation='Jolliffe D, Farrington DP. (2006). Development and validation of the Basic Empathy Scale. Journal of Adolescence, 29(4), 589–611. https://doi.org/10.1016/j.adolescence.2005.08.010'
idb='https://publications.iadb.org/publications/english/document/Skills-for-life-A-review-of-life-skills-and-their-measurability-malleability-and-meaningfulness.pdf'
refs={**dimensions,'total':list(range(1,21))}; labels={'affective_empathy':'情感共情','cognitive_empathy':'认知共情','total':'全部20题总和'}
scores=[{'key':k,'type':'total' if k=='total' else 'dimension','label':labels[k],'description':'相关题按反向键统一方向后求和；必须完整作答。','direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in ids],'aggregation':'sum'}} for k,ids in refs.items()]
interpretations=[{'scoreKey':'affective_empathy','headline':'感受的回声','source':{'type':'score_only'},'summary':'这组题关注他人的情绪是否会影响你的感受。感受到别人的难过，不代表你必须承担或解决所有事情；照顾自己的感受也很重要。','bands':[],'guidance':[{'category':'reflection','text':'当朋友难过时，你身体或心里会有什么变化？什么能让你保持一点自己的空间？'},{'category':'strategy','text':'下次陪伴朋友时，辨认“这是对方的感受，这是我的感受”，必要时找信任的人支持。'}]},
{'scoreKey':'cognitive_empathy','headline':'理解对方','source':{'type':'score_only'},'summary':'这组题关注你对他人心情的理解。即使很熟悉，也不一定总能准确猜到对方的感受；多问一句可以帮助彼此理解。','bands':[],'guidance':[{'category':'reflection','text':'有没有一次，你发现朋友真正的感受和自己猜的不一样？'},{'category':'strategy','text':'试着说：“我猜你可能有点失落，我理解得对吗？”让对方决定怎么回答。'}]},
{'scoreKey':'total','headline':'这次回答的整体记录','source':{'type':'score_only'},'summary':'总均值汇总两类题目的回答，不能说明一个人在所有情境中的关心方式，也不能定义善良与否。','bands':[],'guidance':[{'category':'reflection','text':'回顾两方面的具体经历，哪些情境让你更容易理解或感受到别人的心情？'},{'category':'strategy','text':'选择一个舒服的方式练习倾听，尊重对方和自己的边界。'}]}]
def fixture(name,answer,miss=[]):
 values={i:(6-answer[i] if i in reverse else answer[i]) for i in range(1,21) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,21) if i not in miss], 'expected':{'quality':'invalid' if miss else 'interpretable','scores':{k:(None if any(i in miss for i in ids) else sum(values[i] for i in ids)) for k,ids in refs.items()},'totalScoreKeys':list(refs)}}
high={i:1 if i in reverse else 5 for i in range(1,21)};low={i:5 if i in reverse else 1 for i in range(1,21)}
sample={i:(6-(4 if i in dimensions['affective_empathy'] else 3) if i in reverse else 4 if i in dimensions['affective_empathy'] else 3) for i in range(1,21)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-44-27',sample),fixture('missing-affective',sample,[1])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'bes20','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Basic Empathy Scale, original 20-item version','abbreviation':'BES-20','instrumentFamily':'Basic Empathy Scale'},
'construct':{'primaryDomain':'SOCIAL_EMOTIONAL','secondaryDomains':[],'constructDefinition':'自评对他人情绪的情感共鸣与认知理解两个方面。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['empathy','affective_empathy','cognitive_empathy','adolescent_self_report']},
'population':{'populationNotes':'原版英文验证为英格兰约15岁的Year 10青少年；不将中文修订版证据套用原版。','respondentTypes':['SELF'],'developmentalEvidence':'PARTIAL'},
'administration':{'itemCount':20,'estimatedMinutes':5,'administrationModes':['PAPER'],'timeFrame':'一般自我描述，无指定回忆时段','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['英文原文引自IDB报告第29页；原报告只标出1、3、5的文字，2和4显示数字。','第6题属于认知而非情感；预计时长为产品估计。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版英文在英格兰青少年样本研究。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'自评结果不定义人格或道德价值。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'jolliffe-farrington-bes-2006','evidenceType':'STRUCTURAL_VALIDITY','population':'English Year 10 adolescents around age 15, independent samples of 363 and 357','locale':'en','territory':'GB','studyDesign':'Scale development and two-factor confirmatory analysis in a separate school cohort.','rating':'SUFFICIENT','citation':citation,'doi':'10.1016/j.adolescence.2005.08.010','url':'https://pubmed.ncbi.nlm.nih.gov/16198409/','notes':'该证据对应英文青少年样本，不构成本地常模。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'bes20-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'bes20-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Basic Empathy Scale (BES)','citation':citation,'url':idb,'publicationYear':2006},
'license':{'status':'unknown','redistribution':'unknown','note':'题文引自 McGrath & Adler (2022) IDB报告第29页，©2022 Inter-American Development Bank，CC BY-NC-ND 3.0 IGO（https://creativecommons.org/licenses/by-nc-nd/3.0/igo/legalcode），署名、非商业、不得分发改编；独立BES题本权利范围未确认，不声称商业或翻译授权。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'bes_agreement_1_5','options':[{'value':str(i),'label':('Strongly disagree' if i==1 else 'Neutral' if i==3 else 'Strongly agree' if i==5 else str(i)),'score':i} for i in range(1,6)]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'bes_agreement_1_5','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'reverse' if i in reverse else 'identity'}} for i in range(1,21)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['affective_empathy','cognitive_empathy'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['英文自评受情境、心情与表达方式影响，不能代表所有关系。','原验证为英格兰约15岁的学生，不构成中文人群常模。','各分数必须完整作答是产品约定；缺答不会算零。','没有常模、百分位或诊断阈值。'],'disclaimer':'仅供认识与反思，不用于诊断、人格评判或高风险决策。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text: IDB 2022, p.29, © IDB, CC BY-NC-ND 3.0 IGO; original BES by Jolliffe & Farrington (2006).\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
