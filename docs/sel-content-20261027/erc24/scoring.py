import json
from pathlib import Path
DATA=json.loads((Path(__file__).parent/'data.json').read_text())
def score(answers):
 if set(answers)-set(range(1,25)): raise ValueError('unknown item')
 for v in answers.values():
  if v is not None and (type(v) is not int or not 1<=v<=4): raise ValueError('invalid response')
 out={}
 for d in DATA['dimensions']:
  vals=[answers.get(i) for i in d['items']]
  out[d['key']]=None if None in vals else sum(5-v if i in DATA['reverse'] else v for i,v in zip(d['items'],vals))
 return out
