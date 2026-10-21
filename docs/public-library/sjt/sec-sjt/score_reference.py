"""SEC-SJT scoring reference for research QA, not a clinical implementation.

SPDX-License-Identifier: CC-BY-SA-4.0
Input: an ordered list of exactly ten values; only integers 1..5 are valid.
None means an unanswered item. No coercion, interpolation, norms, or labels.
"""
KEY = (3, 4, 2, 1, 4, 3, 3, 3, 2, 3)

def score(answers):
    result = {'instrument_id':'SEC-SJT','score_type':'original_key_raw_total',
              'raw_total':None,'maximum':10,'item_scores':None,
              'norm_percentile':None,'diagnostic_label':None,
              'translation_status':'unvalidated_working_translation'}
    if not isinstance(answers, list) or len(answers) != 10:
        return result | {'status':'invalid_shape','missing_count':None}
    missing = [i+1 for i,x in enumerate(answers) if x is None]
    invalid = [i+1 for i,x in enumerate(answers) if x is not None and (type(x) is not int or not 1 <= x <= 5)]
    if invalid:
        return result | {'status':'invalid','invalid_items':invalid,'missing_count':len(missing)}
    if missing:
        return result | {'status':'incomplete','missing_items':missing,'missing_count':len(missing)}
    item_scores = [int(a == k) for a,k in zip(answers,KEY)]
    return result | {'status':'complete','missing_count':0,'raw_total':sum(item_scores),'item_scores':item_scores}
