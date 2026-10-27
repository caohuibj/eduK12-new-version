# -*- coding: utf-8 -*-
import json
DOMAINS={'self_awareness':list(range(1,8)),'self_management':list(range(8,15)),'social_awareness':list(range(15,22)),'relationship_skills':list(range(22,30)),'responsible_decision':list(range(30,37))}
def score(answers):
 if any(type(i) is not int or i not in range(1,37) or type(v) is not int or v not in range(1,5) for i,v in answers.items()): raise ValueError('personal SEC answers must be integers 1–4')
 return {k:(sum(answers[i] for i in ids)/len(ids) if all(i in answers for i in ids) else None) for k,ids in DOMAINS.items()}
if __name__=='__main__':
 vals=[2,3,4,2,3]; answers={i:vals[n] for n,ids in enumerate(DOMAINS.values()) for i in ids}; result=score(answers); assert list(result.values())==vals
 missing=answers.copy(); missing.pop(1); assert score(missing)['self_awareness'] is None and score(missing)['self_management']==3
 try: score({1:0}); raise AssertionError('invalid accepted')
 except ValueError: pass
 print(json.dumps({'answers':answers,'scores':result},ensure_ascii=False,indent=2))
