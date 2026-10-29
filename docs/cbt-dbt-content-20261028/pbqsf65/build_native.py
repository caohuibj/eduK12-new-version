import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"Being exposed as inferior or inadequate will be intolerable.",
"I should avoid unpleasant situations at all cost.",
"If people act friendly, they may be trying to use or exploit me.",
"I have to resist the domination of authorities but at the same time maintain their approval and acceptance.",
"I cannot tolerate unpleasant feelings.",
"Flaws, defects, or mistakes are intolerable.",
"Other people are often too demanding.",
"I should be the center of attention.",
"If I don’t have systems, everything will fall apart.",
"It’s intolerable if I’m not accorded my due respect or don’t get what I’m entitled to",
"It is important to do a perfect job on everything.",
"I enjoy doing things more by myself than with other people.",
"Others will try to use me or manipuate me if I don’t watch out.",
"Other people have hidden motives.",
"The worst possible thing would be to be abandoned.",
"Other people should recognize how special I am.",
"Other people will deliberately try to demean",
"I need others to help me make decisions or tell me what to do.",
"Details are extremely important.",
"If I regard people as too bossy, I have a right to disregard their demands.",
"Authority figures tend to be intrusive, demanding, interfering, and controlling.",
"The way to get what I want is to dazzle or amuse people.",
"I should do whatever I can get away with.",
"If other people find out things about me, they will use them against me",
"Relationships are messy and interfere with freedom.",
"Only people as brilliant as I am understand me.",
"Since I am so superior, I am entitled to special treatment and privileges.",
"It is important for me to be free and independent of others",
"In many situations, I am better off to be left alone.",
"It is necessary to stick to the highest standards at all times, or things will fall apart.",
"Unpleasant feelings will escalate and get out of control.",
"We live in a jungle and the strong person is the one who survives.",
"I should avoid situations in which I attract attention, or be as inconspicuous as possible.",
"If I don’t keep others engaged with me, they won’t like me.",
"If I want something, I should do whatever is necessary to get it.",
"It’s better to be alone than to feel \"stuck\" with other people.",
"Unless I entertain or impress people, I am nothing.",
"People will get at me if I don’t get them first.",
"Any signs of tension in a relationship indicate the relationship has gone bad; therefore, I should cut it off.",
"If I don’t perform at the highest level, I will fail.",
"Making dealines, complying with demands, and conforming are direct blows to my pride and self-sufficiency.",
"I have been unfairly treated and am entitled to get my fair share by what ever means I can.",
"If people get close to me, they will discover the \"real\" me and reject me.",
"I am needy and weak.",
"I am helpless when I’m left on my own.",
"Other people should satisfy my needs.",
"If I follow the rules the way people expect, it will inhibit my freedom of action.",
"People will take advantage of me if I give them the chance.",
"I have to be on guard at all times.",
"My privacy is much more important to me than closeness to people.",
"Rules are arbitrary and stifle me.",
"It is awful if people ignore me.",
"What other people think doesn’t matter to me.",
"In order to be happy, I need other people to pay attention to me.",
"If I entertain people, they will not notice my weaknesses.",
"I need somebody around available at all times to help me to carry out what I need to do or in case something bad happens",
"Any flaw or defect or performance may lead to a catastrophe.",
"Since I am so talented, people should go out of their way to promote my career.",
"If I don’t push other people, I will get pushed around.",
"I don’t have to be bound by the rules that apply to other people.",
"Force or cunning is the best way to get things done.",
"I must maintain access to my supporter or helper at all times.",
"I am basically alone -- unless I can attach myself to a stronger person.",
"I cannot trust other people.",
"I can’t cope as other people can." ]
reverse=mapping['reverse_items'];dimensions=mapping['dimensions']; code=lambda i:f'PBQ-{i:02}'
citation='Personality Belief Questionnaire – Short Form (PBQ-SF), © 1995 Aaron T. Beck, M.D. & Judith S. Beck, Ph.D., Beck Institute for Cognitive Therapy and Research; scoring key by A.C. Butler (6/00) distributed in the same packet. 心理测量学研究概述见同一资料包内 Bhar, Beck & Butler, "Beliefs in personality disorders: An overview of the Personality Beliefs Questionnaire".'
src='https://beckinstitute.org/wp-content/uploads/2021/06/PBQ-SF-Full-Documents.pdf'
refs=dimensions; labels={'avoidant':'回避型信念','dependent':'依赖型信念','passive_aggressive':'被动攻击型信念','obsessive_compulsive':'强迫型信念','antisocial':'反社会型信念','narcissistic':'自恋型信念','histrionic':'表演型信念','schizoid':'分裂样信念','paranoid':'偏执型信念','borderline':'边缘型信念'}
scores=[{'key':k,'type':'dimension','label':labels[k],'description':'相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。','direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in ids],'aggregation':'sum'}} for k,ids in refs.items()]
interpretations=[
{'scoreKey':'avoidant','headline':'“暴露即危险”','source':{'type':'score_only'},'summary':'这组信念关注被批评、被拒绝或暴露不足是否难以承受。它们更像长期形成的自我保护规则；得分高不等于你有回避型人格，也不定义你的社交能力。','bands':[],'guidance':[{'category':'reflection','text':'最近一次因为怕被否定而推掉的事情是什么？'},{'category':'strategy','text':'选一个低风险的“小暴露”：在一件事上说出自己的真实想法，然后记录实际结果。'}]},
{'scoreKey':'dependent','headline':'“独自撑不住”','source':{'type':'score_only'},'summary':'这组信念关注是否只有依靠更强的人才能应对生活。需要支持是人之常情；把支持当成唯一支柱才容易失衡。','bands':[],'guidance':[{'category':'reflection','text':'过去一个月里，哪些事其实是你独立完成的？'},{'category':'strategy','text':'为一件小事先试自己的方案，再征求意见，比较两者差异。'}]},
{'scoreKey':'passive_aggressive','headline':'“顺从即被压制”','source':{'type':'score_only'},'summary':'这组信念关注权威、规则与要求是否像对个人自由的侵犯。对不合理要求有抵触是正常的；留意的是“表面答应、背后较劲”的循环。','bands':[],'guidance':[{'category':'reflection','text':'你上一次“表面同意、心里不服”是什么情形？'},{'category':'strategy','text':'试着把不满翻译成一句直接而尊重的话，说给当事人听。'}]},
{'scoreKey':'obsessive_compulsive','headline':'“不完美就崩塌”','source':{'type':'score_only'},'summary':'这组信念关注错误、细节和最高标准是否被看作不可妥协。高标准本身有价值；当“必须完美”盖过“可以完成”时就容易耗竭。','bands':[],'guidance':[{'category':'reflection','text':'哪件被你反复修改的事，其实第一次版本已经够用？'},{'category':'strategy','text':'选一件任务刻意做到“足够好”就停，记录结果是否真的变糟。'}]},
{'scoreKey':'antisocial','headline':'“强者为王”','source':{'type':'score_only'},'summary':'这组信念把人际看作丛林、把手段看作正当。它们与冲动和越轨行为的研究相关联；信念强不等于行为会越界，但值得自我觉察。','bands':[],'guidance':[{'category':'reflection','text':'“规则都是给别人的”这个想法，最近一次在你心里出现是什么时候？'},{'category':'strategy','text':'复盘一次“走捷径”的冲动：它带来了什么、又让你付出了什么。'}]},
{'scoreKey':'narcissistic','headline':'“我应得特殊对待”','source':{'type':'score_only'},'summary':'这组信念关注特殊性与应得感。自信是资产；当它需要通过压过别人来确认时，关系容易紧张。','bands':[],'guidance':[{'category':'reflection','text':'最近一次感到“没被特别对待”的愤怒，背后期待的是什么？'},{'category':'strategy','text':'做一件不署名的好事，练习让价值感不依赖观众。'}]},
{'scoreKey':'histrionic','headline':'“被忽视就糟糕”','source':{'type':'score_only'},'summary':'这组信念关注是否必须被关注、逗乐他人才有存在感。渴望联结是天性；把注意力当作唯一货币会让关系变得疲惫。','bands':[],'guidance':[{'category':'reflection','text':'安静独处的时刻，你通常感觉如何？'},{'category':'strategy','text':'尝试一次“不表演”的相聚：只倾听、不接梗，观察关系是否依然稳固。'}]},
{'scoreKey':'schizoid','headline':'“关系是负担”','source':{'type':'score_only'},'summary':'这组信念把亲密看作纠缠、把独处看作保护。喜欢独处没有问题；需要留意的是“想靠近时却无法靠近”的僵局。','bands':[],'guidance':[{'category':'reflection','text':'哪些场合你其实想要陪伴，却用了回避的方式应对？'},{'category':'strategy','text':'安排一次短时、可控的社交（30分钟内），结束后记录感受。'}]},
{'scoreKey':'paranoid','headline':'“背后有意图”','source':{'type':'score_only'},'summary':'这组信念关注他人是否暗藏动机、需要时时设防。警觉曾是有效的保护；但持续开启会很耗能，也容易误读善意。','bands':[],'guidance':[{'category':'reflection','text':'最近一次“觉得对方有别的意思”，事后看证据支持吗？'},{'category':'strategy','text':'写下三个最近被你解读为“有意图”的举动，各自列一个替代解释。'}]},
{'scoreKey':'borderline','headline':'“情绪会失控”','source':{'type':'score_only'},'summary':'这组信念关注被抛弃的恐惧、情绪的失控感与自我的不稳定感。它们在研究中与边缘型人格风格相关；高分说明这些体验频繁，不等于诊断，也不代表无法改变——DBT 技能训练正是为此发展。','bands':[],'guidance':[{'category':'reflection','text':'情绪最猛烈的时刻，通常由什么事件触发？'},{'category':'strategy','text':'为强烈的情绪准备一个“降温清单”（冷水、快走、给信任的人发消息），写在手机里备用；若困扰持续，建议寻求专业支持。'}]}]
def fixture(name,answer,miss=[]):
 values={i:answer[i] for i in range(1,66) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,66) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{k:(None if any(i in miss for i in ids) else sum(values[i] for i in ids)) for k,ids in refs.items()},'totalScoreKeys':list(refs)}}
low={i:0 for i in range(1,66)};high={i:4 for i in range(1,66)}
sample={i:(2 if i%2 else 3) for i in range(1,66)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-odd2-even3',sample),fixture('missing-borderline',sample,[44])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'pbqsf65','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Personality Belief Questionnaire – Short Form (PBQ-SF), 65 items','abbreviation':'PBQ-SF','instrumentFamily':'Personality Belief Questionnaire'},
'construct':{'primaryDomain':'PERSONALITY','secondaryDomains':['BEHAVIORAL_DIFFICULTIES'],'constructDefinition':'自评与各人格风格相关的功能失调信念强度（十个量表）；量表名指信念维度，不构成人格障碍诊断。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:cbt','construct:cbt_pbq_personality_beliefs','dysfunctional_attitudes','personality_beliefs','adult_clinical_population','self_report','use:research','language_validation:english_original','license:license_unverified']},
'population':{'populationNotes':'PBQ 为精神科门诊成人患者设计（Z分数常模基于683名混合诊断门诊患者，仅记录不实现）；未建立儿童青少年常模。本工具面向临床研究情境，不得用于普通学生筛查或人格评判。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':65,'estimatedMinutes':15,'administrationModes':['DIGITAL_SUPERVISED','PAPER'],'timeFrame':'一般信念（“多数时候”你对每条陈述的相信程度），无指定回忆时段','requiredTraining':True,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原65题顺序与0–4信念强度选项（4=完全相信 … 0=完全不相信）。','表单开头另有示例条目（The world is a dangerous place.），不属于65题，未纳入。','原文疑似印刷/拼写问题按原样保留：第13题 manipuate、第41题 dealines、第42题 what ever；第56题尾部印刷退化，按正式发表文本 something bad happens 录入并记录。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版用于人格风格相关信念的研究与临床概念化；量表与PDQ-R等指标相关中等。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON','INDIVIDUAL_REFLECTION']},
'evidence':[{'evidenceId':'bhar-beck-butler-pbq-review','evidenceType':'STRUCTURAL_VALIDITY','population':'US adult psychiatric outpatients (largest study N=756) and community adults','locale':'en','territory':'US','studyDesign':'Psychometric overview of the PBQ/PBQ-SF: internal consistency, test-retest and criterion validity across studies; included in the same distribution packet.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'量表计分键与Z分数公式来自随表分发的官方Scoring Key；Z分数基于门诊常模，本实现仅提供原始分。对非临床人群的效度证据较弱（原综述明确指出）。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'pbqsf65-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'pbqsf65-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'Please read the statements below and rate HOW MUCH YOU BELIEVE EACH ONE. Try to judge how you feel about each statement MOST OF THE TIME. Do not leave any statements blank.','language':'en','version':'1.0.0','source':'Beck Institute PBQ-SF 表单第1页指导语，逐字转录（© 1995 Aaron T. Beck & Judith S. Beck）。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Personality Belief Questionnaire – Short Form (PBQ-SF)','citation':citation,'url':src,'publicationYear':1995},
'license':{'status':'unknown','redistribution':'unknown','note':'表单页脚 © 1995 by Aaron T. Beck, M.D. & Judith S. Beck, Ph.D., Bala Cynwyd, PA: Beck Institute for Cognitive Therapy and Research；Beck Institute 评估工具页公开提供下载，页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布前须与 Beck Institute 确认权利。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'pbq_belief_0_4','options':[{'value':'4','label':'I Believe it Totally','score':4},{'value':'3','label':'I Believe it Very Much','score':3},{'value':'2','label':'I Believe it Moderately','score':2},{'value':'1','label':'I Believe it Slightly','score':1},{'value':'0','label':'I Don’t Believe it at all','score':0}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'pbq_belief_0_4','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,66)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['avoidant','dependent','passive_aggressive','obsessive_compulsive','antisocial','narcissistic','histrionic','schizoid','paranoid','borderline'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['十个量表是“信念维度”分，不是人格障碍诊断，也不能用于人格评判或标签。','原版为成人精神科门诊设计；对非临床人群效度证据较弱；不构成儿童青少年常模。','官方计分定义Z分数（683门诊样本常模）；本实现只提供原始分，不提供常模、百分位或界值。','官方计分不定义总分；各量表不可相加。','各分数必须完整作答是产品保守约定；缺答不会算零。','题本转录自 Beck Institute 公开下载资料（扫描件，第56题尾部印刷退化按正式发表文本录入），权利状态未确认。'],'disclaimer':'仅供研究情境使用，不用于诊断、人格评判、高风险决策或替代专业帮助。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text © 1995 Aaron T. Beck & Judith S. Beck, Beck Institute; transcribed from the officially posted scanned form, license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('pbqsf65 native written')
