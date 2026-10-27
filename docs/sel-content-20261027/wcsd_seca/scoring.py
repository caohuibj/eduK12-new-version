# -*- coding: utf-8 -*-
import json
from pathlib import Path
DATA=json.loads(Path(__file__).with_name('instrument.json').read_text())
def score(version, responses):
    if version not in DATA['versions']: raise ValueError('version must be 40 or 17')
    valid=set(DATA['versions'][version]['items'])
    if set(responses)-valid: raise ValueError('unknown or out-of-version item')
    if any(type(v) is not int or v not in (1,2,3,4) for v in responses.values()): raise ValueError('responses must be integer 1–4; omit missing')
    output={}
    for d in DATA['dimensions']:
        ids=d['item_ids'] if version=='40' else d['short_item_ids']
        answered=[responses[i] for i in ids if i in responses]
        output[d['id']]={'answered':len(answered),'expected':len(ids),'mean':sum(answered)/len(ids) if len(answered)==len(ids) else None}
    return output
if __name__=='__main__':
    ids=DATA['versions']['17']['items']; answers={i:(n%4)+1 for n,i in enumerate(ids)}
    got=score('17',answers)
    assert [got[d['id']]['mean'] for d in DATA['dimensions']]==[1,3,2,2.5,2.5,2.5,2.5,2.5]
    del answers[ids[1]]
    assert score('17',answers)['emotion_knowledge']['mean'] is None
    assert score('40',{})['self_concept']['mean'] is None
    full40={i:4 for i in DATA['versions']['40']['items']}
    assert all(v['mean']==4 and v['answered']==v['expected'] for v in score('40',full40).values())
    del full40['wc02']
    assert score('40',full40)['self_concept']['mean'] is None
    try: score('17',{ids[0]:0}); raise AssertionError('zero accepted')
    except ValueError: pass
    print(json.dumps({'version':'17','complete_answers':{i:(n%4)+1 for n,i in enumerate(ids)},'scores':got},ensure_ascii=False,indent=2))
