# -*- coding: utf-8 -*-
import json
DOMAINS={'prosocial':list(range(1,7)),'honesty':list(range(7,12)),'self_development':list(range(12,16)),'self_control':list(range(16,20)),'respect_school':list(range(20,25)),'respect_home':list(range(25,29))}
def score(answers):
 if any(type(i) is not int or i not in range(1,29) or type(v) is not int or v not in range(1,5) for i,v in answers.items()): raise ValueError('answers must map item numbers to integers 1–4')
 return {k:(sum(answers[i] for i in ids)/len(ids) if all(i in answers for i in ids) else None) for k,ids in DOMAINS.items()}
if __name__=='__main__':
 vals=[2,3,4,2,3,4]; answers={i:vals[n] for n,ids in enumerate(DOMAINS.values()) for i in ids}
 result=score(answers); assert list(result.values())==vals
 assert all(x is None for x in score({}).values())
 deleted=answers.copy(); deleted.pop(7); assert score(deleted)['honesty'] is None and score(deleted)['prosocial']==2
 try: score({1:0}); raise AssertionError('invalid value accepted')
 except ValueError: pass
 print(json.dumps({'answers':answers,'scores':result},ensure_ascii=False,indent=2))
