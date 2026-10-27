# -*- coding: utf-8 -*-
import json
DOMAINS={'self_management':[1,6,11,16,21,26,31,36,41],'social_engagement':[2,7,12,17,22,27,32,37,42],'cooperation':[3,8,13,18,23,28,33,38,43],'emotional_resilience':[4,9,14,19,24,29,34,39,44],'innovation':[5,10,15,20,25,30,35,40,45]}
def score(answers):
 if any(type(i) is not int or i not in range(1,46) or type(v) is not int or v not in range(1,6) for i,v in answers.items()): raise ValueError('numbered answers must be integers 1–5')
 return {key:(sum(answers[i] for i in ids)/len(ids) if all(i in answers for i in ids) else None) for key,ids in DOMAINS.items()}
if __name__=='__main__':
 answers={i:((i-1)%5)+1 for i in range(1,46)}
 assert score(answers)==dict(zip(DOMAINS,[1,2,3,4,5]))
 answers.pop(1); assert score(answers)['self_management'] is None and score(answers)['social_engagement']==2
 try: score({1:0}); raise AssertionError('invalid answer accepted')
 except ValueError: pass
 print(json.dumps({'answers':{i:((i-1)%5)+1 for i in range(1,46)},'scores':score({i:((i-1)%5)+1 for i in range(1,46)})},ensure_ascii=False,indent=2))
