import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"I have a responsibility and commitment to my family.",
"I believe I can learn to adjust or cope with my problems.",
"I believe I have control over my life and destiny",
"I have a desire to live.",
"I believe only God has the right to end a life.",
"I am afraid of death",
"My family might believe I did not love them",
"I do not believe that things get miserable or hopeless enough that I would rather be dead",
"My family depends upon me and needs me",
"I do not want to die",
"I want to watch my children as they grow",
"Life is all we have and is better than nothing",
"I have future plans I am looking forward to carrying out",
"No matter how badly I feel, I know that it will not last",
"I am afraid of the unknown",
"I love and enjoy my family too much and could not leave them",
"I want to experience all that life has to offer and there are many experiences I haven't had yet which I want to have",
"I am afraid that my method of killing myself would fail",
"I care enough about myself to live",
"Life is too beautiful and precious to end it",
"It would not be fair to leave the children for others to take care of",
"I believe I can find other solutions to my problems",
"I am afraid of going to hell",
"I have a love of life",
"I am too stable to kill myself",
"I am a coward and do not have the guts to do it",
"My religious beliefs forbid it",
"The effect on my children could be harmful",
"I am curious about what will happen in the future",
"It would hurt my family too much and I would not want them to suffer",
"I am concerned about what others would think of me",
"I believe everything has a way of working out for the best",
"I could not decide where, when, and how to do it",
"I consider it morally wrong",
"I still have many things left to do",
"I have the courage to face life",
"I am happy and content with my life",
"I am afraid of the actual \"act\" of killing myself (the pain, blood, violence",
"I believe killing myself would not really accomplish or solve anything",
"I have hope that things will improve and the future will be happier",
"Other people would think I am weak and selfish.",
"I have an inner drive to survive",
"I would not want people to think I did not have control over my life",
"I believe I can find a purpose in life, a reason to live",
"I see no reason to hurry death along",
"I am so inept that my method would not work",
"I would not want my family to feel guilty afterwards",
"I would not want my family to think I was selfish or a coward" ]
reverse=mapping['reverse_items']; code=lambda i:f'RFL-{i:02}'
citation='Linehan MM, Goodstein JL, Nielsen SL, Chiles JA. (1983). Reasons for staying alive when you are thinking of killing yourself: The Reasons for Living Inventory. Journal of Consulting and Clinical Psychology, 51(2), 276–283.'
src='https://depts.washington.edu/uwbrtc/wp-content/uploads/Reasons-for-Living-Scale-short-form-48-items.pdf'
refs={'total':list(range(1,49))}
labels={'total':'全部48题总和（生存理由强度）'}
scores=[{'key':'total','type':'total','label':labels['total'],'description':'48题作答直接求和（无反向题）；必须完整作答。范围48–288，分数越高代表“不自杀的理由”被评价为越重要。','direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in refs['total']],'aggregation':'sum'}},
{'key':'mean','type':'total','label':'全部48题均值','description':'48题作答求均值（无反向题）；必须完整作答。范围1–6，便于不同时点比较。','direction':'higher_is_more','canonical':False,'displayPrecision':2,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in refs['total']],'aggregation':'mean'}}]
interpretations=[
{'scoreKey':'total','headline':'撑住你的理由','source':{'type':'score_only'},'summary':'这份记录汇总了你此刻为“活下去”所列理由的重要程度——对家人的责任、对未来的期待、对自己的在意、信念与价值观。它是研究情境下的保护因素指标，不是生存意志的排名，也不定义你想不想活。','bands':[],'guidance':[{'category':'reflection','text':'这48条理由里，哪一条是你自己最真实的？哪一条是“别人期待你有”的？'},{'category':'strategy','text':'把对你最重要的三条写在随身可见的地方；如果此刻的痛苦压过了所有理由，请立即联系危机干预/心理援助热线或你信任的人。'}]},
{'scoreKey':'mean','headline':'平均重要度','source':{'type':'score_only'},'summary':'均值把总分换算回1–6范围，便于与之前或之后的记录比较。它不用于与他人比较，也不划分风险等级。','bands':[],'guidance':[{'category':'reflection','text':'与上次记录相比，哪些理由变得更重要、哪些变淡了？'},{'category':'strategy','text':'与你的研究或治疗团队分享这份记录；新增一条属于你自己的理由，并具体到一次可执行的小事。'}]}]
def fixture(name,answer,miss=[]):
 values={i:answer[i] for i in range(1,49) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,49) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{'total':(None if miss else sum(values.values())),'mean':(None if miss else round(sum(values.values())/len(values),2))},'totalScoreKeys':list(refs)}}
low={i:1 for i in range(1,49)};high={i:6 for i in range(1,49)}
sample={i:(3 if i%2 else 4) for i in range(1,49)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-odd3-even4',sample),fixture('missing-total',sample,[4])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'rfl48','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Reasons for Living Scale (48 items)','abbreviation':'RFL','instrumentFamily':'Reasons for Living Inventory'},
'construct':{'primaryDomain':'WELL_BEING','secondaryDomains':['BEHAVIORAL_DIFFICULTIES'],'constructDefinition':'自评面对自杀想法时维系生命的信念与保护性理由的强度。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:dbt','construct:dbt_rfl_reasons_for_living','protective_factors','suicide_research_context','adult_clinical_population','self_report','use:research','language_validation:english_original','license:rights_restricted_noncommercial','subscale_structure_pending_verification']},
'population':{'populationNotes':'原版开发基于成年精神科样本（Linehan et al., 1983）；未建立儿童青少年常模。含自杀相关内容，仅面向研究/临床情境施测，须配套专业支持流程；不得用于普通学生筛查、个体风险分级或 INDIVIDUAL_REFLECTION。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':48,'estimatedMinutes':15,'administrationModes':['DIGITAL_SUPERVISED','PAPER'],'timeFrame':'此刻（“对你而言现在有多重要”）','requiredTraining':True,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原48题顺序与1–6重要度选项。','原表单第38题括号未闭合（…blood, violence），按原文逐字保留。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版用于自杀风险研究中保护因素的量化；与危险因素指标配合使用。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON','INDIVIDUAL_REFLECTION']},
'evidence':[{'evidenceId':'linehan-rfl-1983','evidenceType':'STRUCTURAL_VALIDITY','population':'US adult psychiatric inpatients and community adults','locale':'en','territory':'US','studyDesign':'Scale development with six-factor structure and discrimination between suicidal and nonsuicidal groups.','rating':'SUFFICIENT','citation':citation,'doi':'10.1037/0022-006X.51.2.276','url':'https://doi.org/10.1037/0022-006X.51.2.276','notes':'六因子题项归属未能自权威公开来源核实，本版本仅实现总分与均值；无临床界值，不用于风险分级。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'rfl48-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'rfl48-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'Many people have thought of suicide at least once. Others have never considered it. Whether you have considered it or not, we are interested in the reasons you would have for not committing suicide if the thought were to occur to you or if someone were to suggest it to you. On the following pages are reasons people sometimes give for not committing suicide. We would like to know how important each of these possible reasons would be to you at this time in your life as a reason to not kill yourself. Each reason can be rated from 1 (Not At All Important) to 6 (Extremely Important). If a reason does not apply to you or if you do not believe the statement is true, then it is not likely important and you should put a 1. Please use the whole range of choices so as not to rate only at the middle (2, 3, 4, 5) or only at the extremes (1, 6). Even if you never have or firmly believe you never would seriously consider killing yourself, it is still important that you rate each reason. In this case, rate on the basis of why killing yourself is not or would never be an alternative for you.','language':'en','version':'1.0.0','source':'UW BRTC 分发题本 INSTRUCTIONS 段逐字转录（©1996 M. M. Linehan）。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Reasons for Living Scale (RFL-48)','citation':citation,'url':src,'publicationYear':1983},
'license':{'status':'restricted','redistribution':'restricted','note':'题本页脚 © 1996 M. M. Linehan，经华盛顿大学 BRTC 评估工具页公开分发；BRTC 声明其工具仅限研究、临床及教育用途，不得商业使用。本登记仅用于非商业研究草稿；正式发布、翻译或商业部署前须联系权利方。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'rfl_importance_1_6','options':[{'value':'1','label':'Not At All Important','score':1},{'value':'2','label':'Quite Unimportant','score':2},{'value':'3','label':'Somewhat Unimportant','score':3},{'value':'4','label':'Somewhat Important','score':4},{'value':'5','label':'Quite Important','score':5},{'value':'6','label':'Extremely Important','score':6}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'rfl_importance_1_6','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,49)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['total','mean'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['本工具是研究情境下的保护因素指标，不是风险分级工具，也不定义个人的生存意志。','原版样本为成人精神科与社区样本；不构成儿童青少年常模。','六因子分量表的题项归属未经核实，本版本只提供总分与均值。','没有常模、百分位或临床界值。','含自杀相关内容；施测与结果反馈须配套专业支持流程，不得用于普通学生筛查。','各分数必须完整作答是产品保守约定；缺答不会算零。'],'disclaimer':'仅供研究情境使用；若此刻出现自杀念头，请立即联系危机干预/心理援助热线、治疗团队或可信任的人。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text © 1996 M. M. Linehan, distributed via UW BRTC for noncommercial research/clinical/educational use.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('rfl48 native written')
