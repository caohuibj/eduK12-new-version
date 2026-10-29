import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"I feel I have to be nice to other people.",
"It is important to me to be free and independent.",
"It is more important that I know I've done a good job than having others know it.",
"Being able to share experiences with other people makes them much more enjoyable for me.",
"I am afraid of hurting other people's feelings.",
"It bothers me when people try to direct my behavior or activities.",
"I find it difficult to say \"no\" to people.",
"I feel bad if I do not have some social plans for the weekend.",
"I prize being a unique individual more than being a member of a group.",
"When I feel sick, I like to left alone.",
"I am concerned that if people knew my faults or weaknesses they would not like me.",
"If I think I am right about something, I feel comfortable expressing myself even if others don't like it.",
"When visiting people, I get fidgety when sitting around talking and would rather get up and do something.",
"It is more important to meet your own objectives on a task than to meet another person's objectives.",
"I do things that are not in my best interest in order to please others.",
"I like to take long walks by myself.",
"I am more concerned that people like me than I am about making important achievements.",
"I would be uncomfortable dining out in a restaurant by myself.",
"I don't enjoy what I am doing when I don't feel that someone in my life really cares about me.",
"I am not influenced by others in what I decide to do.",
"It is very important that I feel free to get up and go wherever I want.",
"I value work accomplishments more than I value making friends.",
"I find it is of importance to be in control of my emotions.",
"I get uncomfortable when I am not sure how I am expected to behave in the presence of other people.",
"I feel more comfortable helping others than receiving help.",
"It would not be much fun for me to travel to a new place all alone.",
"If a friend has not called for a while, I get worried that he or she has forgotten me.",
"It is more important to be active and doing things than having close relations with other people.",
"I get uncomfortable around a person who does not clearly like me.",
"If a goal is important to me, I will pursue it even if it may make other people uncomfortable.",
"I find it difficult to be separated from people I love.",
"When I achieve a goal I get more satisfaction from reaching the goal than from any praise I might get.",
"I censor what I say because I am concerned that the other person may disapprove or disagree.",
"I get lonely when I am home by myself at night.",
"I often find myself thinking about friends or family.",
"I prefer to make my own plans, so I am not controlled by others.",
"I can comfortably be by myself all day without feeling a need to have someone around.",
"If somebody criticizes my appearance, I feel I am not attractive to other people.",
"It is more important to get a job done than to worry about people's reactions.",
"I like to spend my free time with others.",
"I don't like to answer personal questions because they feel like an invasion of my privacy.",
"When I have a problem, I like to go off on my own and think it through rather than being influenced by others.",
"In relationships, people often are too demanding of each other.",
"I am uneasy when I cannot tell whether or not someone I've met likes me.",
"I set my own standards and goals for myself rather than accepting those of other people.",
"I am more apologetic to others than I need to be.",
"It is important to me to be liked and approved of by others.",
"I enjoy accomplishing things more than being given credit for them.",
"Having close bonds with other people makes me feel secure.",
"When I am with other people, I look for signs whether or not they like being with me.",
"I like to go off on my own, exploring new places -- without other people.",
"If I think somebody may be upset at me, I want to apologize.",
"I like to be certain that there is somebody close I can contact in case something unpleasant happens to me.",
"I feel confined when I have to sit through a long meeting.",
"I don't like people to invade my privacy.",
"I feel uncomfortable being a nonconformist.",
"The worst part about being in jail would be not being able to move around freely.",
"The worst part about growing old is being left alone.",
"I worry that somebody I love will die.",
"The possibility of being rejected by others for standing up for my rights would not stop me." ]
reverse=mapping['reverse_items'];dimensions=mapping['dimensions'];totals=mapping['totals']; code=lambda i:f'SAS-{i:02}'
citation='Beck AT, Epstein N, Harrison G, Emery GD. (1983). Development of the Sociotropy-Autonomy Scale: A preliminary report. Center for Cognitive Therapy, University of Pennsylvania Medical School, Philadelphia. 量表构成另与同一资料包内 Clark 等 “Development of the Sociotropy-Autonomy Scale” 的因子表（Tables 2–3）交叉核对。'
src='https://beckinstitute.org/wp-content/uploads/2021/06/SAS-Full-Documents.pdf'
refs={**dimensions,'sociotropy':totals['sociotropy'],'autonomy':totals['autonomy']}; labels={'soc_concern_disapproval':'在意不赞成','soc_attachment_separation':'依恋/分离担忧','soc_pleasing_others':'取悦他人','aut_individualistic_achievement':'个人成就','aut_mobility_freedom':'行动自由/不受控制','aut_preference_solitude':'独处偏好','sociotropy':'社会依赖总分（30题）','autonomy':'自主性总分（30题）'}
scores=[{'key':k,'type':'total' if k in ('sociotropy','autonomy') else 'dimension','label':labels[k],'description':'相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。','direction':'higher_is_more','canonical':k in ('sociotropy','autonomy'),'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in ids],'aggregation':'sum'}} for k,ids in refs.items()]
interpretations=[
{'scoreKey':'sociotropy','headline':'在关系里的我','source':{'type':'score_only'},'summary':'这份总分汇总了你在多大程度上“靠他人的认可、陪伴与满意来定位自己”。依赖关系不是缺点；值得留意的是当它变成唯一的价值来源时，人会活得很紧。','bands':[],'guidance':[{'category':'reflection','text':'过去一周，你有哪些决定是为了让别人满意而做的？'},{'category':'strategy','text':'为一件小事练习“先问自己想要什么”，再考虑别人，并记录感受差异。'}]},
{'scoreKey':'autonomy','headline':'独立做事的我','source':{'type':'score_only'},'summary':'这份总分汇总了你在多大程度上“靠自己的目标、标准与自由来定位自己”。独立是能力；但当它变成“绝不能依靠任何人”时，支持就进不来了。','bands':[],'guidance':[{'category':'reflection','text':'最近一次主动求助是什么时候？结果如何？'},{'category':'strategy','text':'选一件有难度的事，尝试向一位信任的人求助一次，观察关系与结果。'}]},
{'scoreKey':'soc_concern_disapproval','headline':'“别人会怎么看”','source':{'type':'score_only'},'summary':'这组题关注你是否在意被否定、被冷淡，是否会寻找他人喜欢自己的信号。在意评价很普遍；差别只在它占用多少注意力。','bands':[],'guidance':[{'category':'reflection','text':'过去一周，你花了多少精力揣测别人对你的看法？'},{'category':'strategy','text':'下次揣测时改为一问：有什么证据？有别的解释吗？'}]},
{'scoreKey':'soc_attachment_separation','headline':'“怕分开”','source':{'type':'score_only'},'summary':'这组题关注与亲近之人的联结和分离焦虑。珍视关系是健康的；当分离的想法持续带来不安时，可以练习把安全感放回自己身上一部分。','bands':[],'guidance':[{'category':'reflection','text':'独处时你最怕的是什么？那种感觉从什么时候开始？'},{'category':'strategy','text':'为“一个人的一晚”设计一个让自己舒服的小仪式，练习与自己相处。'}]},
{'scoreKey':'soc_pleasing_others','headline':'“让所有人都满意”','source':{'type':'score_only'},'summary':'这组题统计为了让别人舒服而委屈自己的频率。善意是优点；无底线的取悦会让人忘了自己的需要。','bands':[],'guidance':[{'category':'reflection','text':'最近一次说“不”是什么时候？说出口时感觉如何？'},{'category':'strategy','text':'从小事开始练习拒绝：先延迟回答（“我看一下再答复你”），再决定。'}]},
{'scoreKey':'aut_individualistic_achievement','headline':'“做成事最重要”','source':{'type':'score_only'},'summary':'这组题关注你多大程度上以目标与成就定义自己，而非他人的夸奖。成就感是动力；只靠它定位价值，低谷期会格外难熬。','bands':[],'guidance':[{'category':'reflection','text':'上一次没有“做成什么”的一周，你如何评价自己？'},{'category':'strategy','text':'练习“过程式自我肯定”：记录一件只因投入而值得的事。'}]},
{'scoreKey':'aut_mobility_freedom','headline':'“谁也别管我”','source':{'type':'score_only'},'summary':'这组题关注你对行动自由和不受控制的在意。自主感很重要；留意它是否让你把普通的关心也当成干涉。','bands':[],'guidance':[{'category':'reflection','text':'最近一次“感觉被管”的时刻，对方实际做了什么？'},{'category':'strategy','text':'区分“干涉”与“关心”：写下三个例子，分别问自己对方的意图还有什么可能。'}]},
{'scoreKey':'aut_preference_solitude','headline':'“独处充电”','source':{'type':'score_only'},'summary':'这组题关注你从独处中获得恢复的倾向。喜欢独处没有问题；关键是这是选择，还是回避的出口。','bands':[],'guidance':[{'category':'reflection','text':'你上一次主动社交是什么时候？是选择还是压力？'},{'category':'strategy','text':'记录一周的独处/社交时间，看看比例是否接近你真正想要的样子。'}]}]
def fixture(name,answer,miss=[]):
 values={i:answer[i] for i in range(1,61) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,61) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{k:(None if any(i in miss for i in ids) else sum(values[i] for i in ids)) for k,ids in refs.items()},'totalScoreKeys':['sociotropy','autonomy']}}
low={i:0 for i in range(1,61)};high={i:4 for i in range(1,61)}
sample={i:(2 if i in totals['sociotropy'] else 3) for i in range(1,61)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-soc2-aut3',sample),fixture('missing-sociotropy',sample,[31])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'sas60','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Sociotropy-Autonomy Scale (SAS), 60-item 1983 form','abbreviation':'SAS','instrumentFamily':'Sociotropy-Autonomy Scale'},
'construct':{'primaryDomain':'PERSONALITY','secondaryDomains':['SOCIAL_EMOTIONAL'],'constructDefinition':'自评社会依赖（sociotropy：在意认可、依恋、取悦）与自主性（autonomy：个人成就、行动自由、独处偏好）两个独立维度的信念与行为倾向。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:cbt','construct:cbt_sas_sociotropy_autonomy','sociotropy','autonomy','adult_self_report','self_report','use:reflection','use:research','language_validation:english_original','license:license_unverified']},
'population':{'populationNotes':'原版开发基于成人样本（抑郁易感性研究）；未建立儿童青少年常模。社会依赖与自主性是两个独立维度而非对立两端，可同时高分。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':60,'estimatedMinutes':15,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'一般自我描述（“该陈述在多大比例的时间里适用于你”），无指定回忆时段','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原60题顺序与五档百分比选项（0%/25%/50%/75%/100%）。','原表第10题作 “I like to left alone”（缺 be），按原表逐字保留；同资料包论文版本作 “I like to be left alone.”，差异已记录。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版用于抑郁易感性与CBT概念化研究；社会依赖与自主性各自独立计分。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'维度强度反馈不构成人格诊断。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'clark-beck-sas-development','evidenceType':'STRUCTURAL_VALIDITY','population':'US adult samples (student and clinical, factor-analytic N=378)','locale':'en','territory':'US','studyDesign':'Factor-analytic development of the SAS: three sociotropy and three autonomy factors; scale and subscale alphas reported in the packet article.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'分量表题项归属以该文Tables 2–3为准（10/13/7 + 12/12/6，恰覆盖60题）；修订版SAS（Sociotropy/Solitude/Independence三量表）为另一版本，未实现。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'sas60-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'sas60-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'Please indicate what percentage of the time each of the statements below applies to you, by using the scale to the left of the items. Choose the percentage that comes closest to how often the item describes you.','language':'en','version':'1.0.0','source':'Beck Institute SAS 表单第1页 INSTRUCTIONS 段逐字转录（表头 SAS II/NE/5/83）。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Sociotropy-Autonomy Scale (SAS), 60-item 1983 form','citation':citation,'url':src,'publicationYear':1983},
'license':{'status':'unknown','redistribution':'unknown','note':'表单与论文来自 Beck Institute 评估工具页公开下载（SAS-Full-Documents）；页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布前须与 Beck Institute 确认权利。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'sas_pct_0_4','options':[{'value':'0','label':'0% (Not at all)','score':0},{'value':'1','label':'25%','score':1},{'value':'2','label':'50%','score':2},{'value':'3','label':'75%','score':3},{'value':'4','label':'100% (Always)','score':4}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'sas_pct_0_4','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,61)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['sociotropy','autonomy'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['社会依赖与自主性是两个独立维度（原研究相关仅轻度负相关），不是对立两端，可同时高分。','分量表构成取自资料包论文因子表；修订版SAS（Sociotropy/Solitude/Independence）为另一版本，未实现。','原始选项为时间百分比，产品采用0–4线性等价计分，已记录。','没有常模、百分位或临床界值；分数不能用于人格诊断。','各分数必须完整作答是产品保守约定；缺答不会算零。','题本转录自 Beck Institute 公开下载资料，权利状态未确认。'],'disclaimer':'仅供认识与反思，不用于诊断、人格评判、高风险决策或替代专业帮助。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text transcribed from the Beck Institute SAS packet (1983 form; Clark et al. factor tables); license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('sas60 native written')
