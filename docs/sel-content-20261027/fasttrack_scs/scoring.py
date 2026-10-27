import json
from pathlib import Path
DATA=json.loads((Path(__file__).parent/'data.json').read_text())

def score(version, answers):
    d=DATA[version]
    if set(answers)-set(range(1,len(d['items'])+1)): raise ValueError('unknown item')
    for v in answers.values():
        if v is not None and (type(v) is not int or not 0 <= v <= 4): raise ValueError('invalid response')
    result={}
    for dim in d['dimensions']:
        vals=[answers.get(i) for i in dim['items']]
        result[dim['key']]=None if None in vals else sum(vals)/len(vals)
    return result
