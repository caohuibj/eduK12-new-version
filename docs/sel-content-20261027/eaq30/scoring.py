import json
from pathlib import Path

DATA = json.loads((Path(__file__).parent / 'instrument-data.json').read_text())


def score(answers):
    if set(answers) - set(range(1, 31)):
        raise ValueError('unknown item')
    for value in answers.values():
        if value is not None and (type(value) is not int or value not in (1, 2, 3)):
            raise ValueError('response must be integer 1–3 or null')
    result = {}
    for dim in DATA['dimensions']:
        values = [answers.get(i) for i in dim['items']]
        if None in values:
            result[dim['key']] = None
        else:
            result[dim['key']] = sum(4-v if i in DATA['reverse'] else v for i, v in zip(dim['items'], values)) / len(values)
    return result
