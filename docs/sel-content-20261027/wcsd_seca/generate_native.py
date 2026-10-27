# -*- coding: utf-8 -*-
import json
from pathlib import Path
p=Path(__file__).parent
data=json.loads((p/'instrument.json').read_text())
feedback={
'self_concept':('认识自己的长处','有时长处藏在小事里，也可能是在努力学习的事情。','回想最近一件你做成的小事：你用了什么办法？'),
'emotion_knowledge':('认识自己的情绪','留意感受、情绪对注意力的影响，以及让自己平静的方法。','当情绪影响专注时，什么能帮助你停下来？'),
'social_awareness':('留意他人','观察他人的感受，发现需要帮助的人，也试着听不同的想法。','不确定别人怎么想时，你可以怎样温和地问一句？'),
'emotion_regulation':('与情绪一起行动','沮丧时继续做事、兴奋时耐心等待，都可能因情境而变得容易或困难。','什么时候你更容易耐心等待，或继续完成一件事？'),
'goal_management':('朝目标前进','从设定目标到完成困难任务，每一步都可以练习。','选一件想做的小事，把第一步写得足够小。'),
'school_work':('安排学校功课','做功课、准备考试与保持专注，都可能受任务和环境影响。','什么时间、地点或陪伴，让你更容易开始？'),
'relationship_skills':('与他人相处','在同学意见不同时尊重彼此，并留意如何与他人相处。','如果意见不同，你希望对方怎样听你说？'),
'responsible_decision':('做决定之前','做决定前想想可能发生什么，并考虑不同选择。','面对选择时，先问自己：接下来可能发生什么？')}
for version in ['40','17']:
 items=[x for x in data['items'] if version=='40' or x['in_17']]
 dims=data['dimensions']
 if version=='40': groups=[(d['id'],d['name'],d['item_ids']) for d in dims]
 else: groups=[('overall','社会情绪能力总体自评',[x['id'] for x in items])]
 scores=[dict(key=k,type='dimension' if version=='40' else 'total',label=label,description='题目回答的平均分；越高表示自评越容易。',direction='higher_is_more',canonical=True,displayPrecision=2,missingPolicy={'type':'complete_required'},source={'type':'items','items':[{'itemCode':i,'weight':1} for i in ids],'aggregation':'mean'}) for k,label,ids in groups]
 if version=='40':
  inter=[dict(scoreKey=k,headline=feedback[k][0],source={'type':'score_only'},summary=feedback[k][1]+' 本次分数是这组题目回答的平均值；越高表示你觉得越容易。',bands=[],guidance=[{'category':'reflection','text':feedback[k][2]}]) for k,_,_ in groups]
 else:
  inter=[dict(scoreKey='overall',headline='你的社交与情绪探索',source={'type':'score_only'},summary='这个数字汇总你对17件事情的回答：越高表示你觉得这些事情整体上越容易。你在不同情境中的感受可能不同，这不是给你贴标签。',bands=[],guidance=[{'category':'reflection','text':a+'：'+c} for a,b,c in feedback.values()])]
 limits=['这是一份学生自评，结果反映此次回答，可能受到情境、心情与经历影响。','中文为工作译文，不是香港研究所用的已验证中文原表。','没有适用于你的比较常模；分数不代表诊断或固定能力。']
 if version=='17': limits.append('简版主要提供总体反馈；每个具体方面的题目很少，提示仅供反思，不能视为稳定的分维测量。')
 obj={'schemaVersion':1,'identity':{'instrumentKey':f'wcsd_seca_{version}_zh_cn','instrumentVersion':'1.0.0'},'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':f'Washoe County School District Social–Emotional Competency Assessment — {version}-item','abbreviation':f'WCSD-SECA-{version}','instrumentFamily':'WCSD Social–Emotional Competency Assessment'},'construct':{'primaryDomain':'SOCIAL_EMOTIONAL','secondaryDomains':['SELF_REGULATION'],'constructDefinition':'学生自评在社交与情绪相关知识及技能方面感到容易或困难的程度。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['social_emotional_competence','self_awareness','social_awareness','self_management','relationship_skills','responsible_decision_making','self_report']},'population':{'populationNotes':'原工具面向5–12年级学生；香港研究349名小学儿童，平均年龄9.86岁。中文为工作译文，尚未验证。','respondentTypes':['SELF'],'developmentalEvidence':'PARTIAL'},'administration':{'itemCount':len(items),'estimatedMinutes':12 if version=='40' else 5,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'无指定回忆时段','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原版题意与1–4困难至容易选项；按2018版题序排列。']},'intendedUse':{'intendedUses':[{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'描述性反馈，工作译文尚未验证。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},'evidence':[{'evidenceId':'wcsd-hk-2024','evidenceType':'STRUCTURAL_VALIDITY','population':'Hong Kong school-aged children, n=349, mean age 9.86','locale':'zh','territory':'HK','studyDesign':'Confirmatory factor analysis of 40 and 17 item versions. Study translation is not the present working translation.','rating':'MIXED','citation':'Cheung RYM, Ng OOS. Social–Emotional Competence among School-Aged Children in the Chinese Context. Behavioral Sciences. 2024;14:399.','doi':'10.3390/bs14050399','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC11117818/'}],'referenceApplicability':[]},'localization':{'schemaVersion':1,'sourceLocale':'en','targetLocale':'zh-CN','localizationVersion':'1.0.0','translationSource':'独立工作译文，依据 Cheung & Ng 2024 Table 2；非该研究所用中文原表。','adaptationMethod':'DIRECT_TRANSLATION','expertReviewStatus':'PENDING','cognitiveDebriefStatus':'NOT_ESTABLISHED','localEvidenceRefs':[],'reviewStatus':'PENDING','notes':'未完成中文适用性或认知访谈验证。'},'applicability':{'schemaVersion':1,'policyVersion':'wcsd-seca-self-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},'disclosure':{'schemaVersion':1,'policyVersion':'wcsd-seca-self-v1','audiences':{a:{'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':a=='researcher','methods':True,'educationalContent':False} for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},'instruction':{'schemaVersion':1,'text':'请告诉我们，对你来说，做到下面每件事有多难或多容易。','language':'zh-CN','version':'1.0.0','source':'2018 WCSD-SECA FAQ 前导语的中文工作译文： https://resources.finalsite.net/images/v1744936277/washoeschoolsnet/deitjtnxbl9xmua4l30r/wcsd_seca_faq_format_october_2018_final.pdf'},'executable':{'releaseStatus':'DRAFT','contentLocale':'zh-CN','references':[],'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'WCSD Social–Emotional Competency Assessment','citation':'Cheung RYM, Ng OOS. Behavioral Sciences. 2024;14:399. Table 2. DOI:10.3390/bs14050399.','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC11117818/','publicationYear':2024},'license':{'status':'unknown','redistribution':'unknown','note':'题文来自 CC BY 4.0 论文 Table 2，附作者、来源与许可信息（https://creativecommons.org/licenses/by/4.0/），中文为改编工作译文；量表整体及中文工作译文的具体权利状态未独立核验。'},'display':{'randomizeItems':False},'responseSets':[{'key':'wcsd_difficulty_1_4','options':[{'value':str(o['value']),'label':o['zh'],'score':o['value']} for o in data['options']]}],'items':[{'itemCode':x['id'],'content':x['zh_working_translation'],'type':'single','required':True,'sortOrder':n,'responseSetKey':'wcsd_difficulty_1_4','randomizeOptions':False} for n,x in enumerate(items)],'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':x['id'],'transform':{'type':'identity'}} for x in items],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},'report':{'reportVersion':'1.0.0','primaryScoreKeys':[k for k,_,_ in groups],'scoreOrder':[k for k,_,_ in groups],'interpretations':inter,'limitations':limits,'disclaimer':'这份报告帮助你回想和探索，不是诊断，也不用于给人排名。'},'referencePolicy':{'type':'none'}},'goldenCases':[]}}
 for value in [1,4]:
  obj['executable']['goldenCases'].append({'name':f'all-{value}','answers':[{'itemCode':x['id'],'responseValue':str(value)} for x in items],'expected':{'quality':'interpretable','scores':{k:value for k,_,_ in groups},'totalScoreKeys':[k for k,_,_ in groups]}})
 answers={x['id']: ((1 if n < 8 else 3 if n < 16 else 2) if version=='17' else (next(j for j,d in enumerate(dims) if x['dimension']==d['id']) % 4 + 1)) for n,x in enumerate(items)}
 obj['executable']['goldenCases'].append({'name':'mixed','answers':[{'itemCode':i,'responseValue':str(v)} for i,v in answers.items()],'expected':{'quality':'interpretable','scores':{k:round(sum(answers[i] for i in ids)/len(ids),2) for k,_,ids in groups},'totalScoreKeys':[k for k,_,_ in groups]}})
 if version=='40':
  sample={}
  for d in dims:
   ids=d['item_ids']; key=d['id']
   if key=='self_concept': values=[1]*len(ids)
   elif key=='emotion_knowledge': values=[3]*len(ids)
   elif key=='social_awareness': values=[2]*len(ids)
   elif key=='responsible_decision': values=[1,2,3,3,4]
   else: values=[2,3]*(len(ids)//2)
   sample.update(zip(ids,values))
  obj['executable']['goldenCases'].append({'name':'report-sample','answers':[{'itemCode':i,'responseValue':str(v)} for i,v in sample.items()],'expected':{'quality':'interpretable','scores':{k:round(sum(sample[i] for i in ids)/len(ids),2) for k,_,ids in groups},'totalScoreKeys':[k for k,_,_ in groups]}})
 missing_id=items[0]['id']
 obj['executable']['goldenCases'].append({'name':'missing-first-item','answers':[{'itemCode':x['id'],'responseValue':'4'} for x in items if x['id']!=missing_id],'expected':{'quality':'invalid','scores':{k:(None if missing_id in ids else 4) for k,_,ids in groups},'totalScoreKeys':[k for k,_,_ in groups]}})
 out=p/'native'/version/'instrument.ts';out.parent.mkdir(parents=True,exist_ok=True)
 out.write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
