#!/usr/bin/env python3
"""Authoring-only calibration. Read canonical private inputs; emit aggregates, never responses.
Each canonical row is a person (do not deduplicate the four documented repeated IDs).
Latest valid compatible T3/T2 observation per person and dimension; T1 only for exact Efficacy/Liking.
CI validates committed aggregates and fixtures without requiring private inputs.
"""
import argparse,bisect,csv,hashlib,json,math,statistics
from pathlib import Path
FAMILIES={
 'academic_self_concept':('concept',4,3,5,[2,3]),
 'domain_fixed_mindset':('minddom',3,2,6,[2,3]),
 'value_cost':('evc',7,None,6,[2,3]),
 'tutoring_necessity':('shaedu',3,2,6,[2,3]),
 'academic_self_efficacy':('effi',5,4,5,[1]),
 'teacher_subject_liking':('tealike',3,2,6,[1]),
}
LABELS={'very_low':'目前较少认同','low':'目前不太认同','middle':'目前有时认同','high':'目前比较认同','very_high':'目前很认同'}
KEYS={5:['very_low','low','middle','high','very_high'],4:['very_low','low','high','very_high'],3:['low','middle','high']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bands(values,maximum):
 n=len(values);unique=sorted(set(values));candidates=[((a+b)/2,bisect.bisect_right(values,a)) for a,b in zip(unique,unique[1:])]
 for k,targets in [(5,[.1,.3,.7,.9]),(4,[.2,.5,.8]),(3,[.3,.7])]:
  cuts=[];last=0
  for j,t in enumerate(targets):
   available=[(v,c) for v,c in candidates if c-last>=20 and n-c>=20*(k-j-1)]
   if not available:break
   v,c=min(available,key=lambda vc:(abs(vc[1]/n-t),vc[0]))
   if abs(c/n-t)>.12:break
   cuts.append(v);last=c
  if len(cuts)!=k-1:continue
  bounds=[1,*cuts,maximum];previous=0;out=[]
  for i,key in enumerate(KEYS[k]):
   count=bisect.bisect_right(values,bounds[i+1])-previous;previous+=count
   out.append(dict(key=key,label=LABELS[key],lower=round(bounds[i],8),upper=round(bounds[i+1],8),sampleN=count))
  return out
 raise ValueError('No reviewed 3–5-band calibration; do not invent an empirical reference')
def alpha(matrix):
 if len(matrix)<2:return None
 k=len(matrix[0]);total=statistics.variance([sum(r) for r in matrix])
 return k/(k-1)*(1-sum(statistics.variance(c) for c in zip(*matrix))/total) if total else None

def select_observation(candidates, minimum):
 # Attribute both numerator and denominator to the selected valid wave's stage.
 # If every wave is incomplete, attribute the missing observation to the latest stage.
 return next((candidate for candidate in candidates if sum(v is not None for v in candidate[1]) >= minimum), candidates[0] if candidates else None)

def main():
 import openpyxl
 parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('src/modules/scale/instruments/learning-motivation-wave1-data.json'));args=parser.parse_args()
 source=args.source_dir;data=list(csv.DictReader((source/'Final_edition.csv').open(encoding='utf-8-sig')))
 workbook=openpyxl.load_workbook(source/'Canonical_Data_Package_FINAL_SYNCED.xlsx',read_only=True,data_only=True);sheet=iter(workbook['Item_Map'].values);header=next(sheet);itemmap={d['final_variable']:d for r in sheet if (d:=dict(zip(header,r))).get('final_variable')}
 output={'schemaVersion':1,'sourceDataset':'Learning Motivation / Final_edition (canonical synced)','sourceSnapshot':sha(source/'Final_edition.csv'),'itemMapSnapshot':sha(source/'Canonical_Data_Package_FINAL_SYNCED.xlsx'),'selectionMethod':'LATEST_VALID_COMPATIBLE_WAVE_PER_CANONICAL_PERSON_AND_SCORE','families':{},'references':{}}
 for family,(stem,count,minimum,maximum,waves) in FAMILIES.items():
  textwave=waves[0];texts=[itemmap[f'd{textwave}_{stem}{i}']['questionnaire_text'] for i in range(1,count+1)]
  output['families'][family]={'items':texts,'max':maximum,'minimum':minimum,'waves':waves}
  for subject in ['chemistry','mathematics']:
   if subject=='mathematics' and waves==[1]:continue
   prefix=('m' if subject=='mathematics' else '')+stem
   dimensions={'value':([1,2,3],2),'cost':([4,5,6,7],3)} if family=='value_cost' else {family:(list(range(1,count+1)),minimum)}
   for score,(itemnums,minvalid) in dimensions.items():
    pooled={'junior_secondary':[],'upper_secondary':[]};complete={k:[] for k in pooled};eligible={k:0 for k in pooled}
    mappings={}
    for wave in waves:
     mappings[str(wave)]=[f'd{wave}_{prefix}{i}' if not (wave==3 and prefix=='mshaedu' and i==3) else 'd3_mshaedu13' for i in itemnums]
     for col in mappings[str(wave)]:
      if col not in data[0]:raise ValueError('Missing canonical column '+col)
    for person in data:
     candidates=[]
     for wave in reversed(waves):
      try:grade=int(float(person[f'd{wave}_grade']))
      except (ValueError,KeyError):continue
      stage=({1:'upper_secondary',2:'junior_secondary'}.get(grade) if wave==1 else 'junior_secondary' if grade in [7,8,9] else 'upper_secondary' if grade in [10,11,12] else None)
      if not stage:continue
      vals=[]
      for col in mappings[str(wave)]:
       try:v=float(person[col]);vals.append(v if v.is_integer() and 1<=v<=maximum else None)
       except ValueError:vals.append(None)
      if any(v is not None for v in vals):candidates.append((stage,vals))
     selected=select_observation(candidates,minvalid)
     if selected:
      stage,vals=selected;eligible[stage]+=1
      observed=[v for v in vals if v is not None]
      if len(observed)>=minvalid:
       pooled[stage].append(statistics.mean(observed))
       if len(observed)==len(vals):complete[stage].append(observed)
    for stage,values in pooled.items():
     values.sort();n=len(values)
     if n<100:raise ValueError(f'{family}/{subject}/{stage} below N gate')
     mean=statistics.mean(values);sd=statistics.stdev(values);skew=statistics.mean([(x-mean)**3 for x in values])/(sd**3) if sd else 0
     table=[{'score':v,'percentile':100*(bisect.bisect_left(values,v)+bisect.bisect_right(values,v))/(2*n)} for v in sorted(set(values))]
     output['references'][f'{family}/{subject}/{score}/{stage}']={'N':n,'eligibleN':eligible[stage],'mean':mean,'sd':sd,'median':statistics.median(values),'alphaCompleteCase':alpha(complete[stage]),'alphaN':len(complete[stage]),'bands':bands(values,maximum),'percentileTable':table,'columns':mappings,'minimumValidItems':minvalid,'calibration':{'method':'Nearest ECDF midpoints; 5/4/3 bands, target deviation <= .12, each band N >= 20','missingness':1-n/eligible[stage],'floor':values.count(1)/n,'ceiling':values.count(maximum)/n,'skew':skew,'subgroupReview':'Subject × stage reviewed separately; convenience historical cohort, no population norm or cross-stage invariance claim. Mathematics Cost is provisional due time-cost overlap.'}}
 def stable(value):
  if isinstance(value,float):return round(value,8)
  if isinstance(value,list):return [stable(v) for v in value]
  if isinstance(value,dict):return {k:stable(v) for k,v in value.items()}
  return value
 output=stable(output)
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n');print(f'Aggregated {len(output["references"])} exact subject × stage × score references; no individual rows emitted.')
if __name__=='__main__':main()
