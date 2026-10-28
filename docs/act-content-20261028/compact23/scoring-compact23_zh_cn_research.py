# -*- coding: utf-8 -*-
"""CompACT 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["COMPACT_01", "COMPACT_02", "COMPACT_03", "COMPACT_04", "COMPACT_05", "COMPACT_06", "COMPACT_07", "COMPACT_08", "COMPACT_09", "COMPACT_10", "COMPACT_11", "COMPACT_12", "COMPACT_13", "COMPACT_14", "COMPACT_15", "COMPACT_16", "COMPACT_17", "COMPACT_18", "COMPACT_19", "COMPACT_20", "COMPACT_21", "COMPACT_22", "COMPACT_23"]
MAX_VALUE = 6  # 作答量尺上端

# total: 心理灵活性总分（23题）
SCORE_ITEMS_TOTAL = ["COMPACT_01", "COMPACT_02", "COMPACT_03", "COMPACT_04", "COMPACT_05", "COMPACT_06", "COMPACT_07", "COMPACT_08", "COMPACT_09", "COMPACT_10", "COMPACT_11", "COMPACT_12", "COMPACT_13", "COMPACT_14", "COMPACT_15", "COMPACT_16", "COMPACT_17", "COMPACT_18", "COMPACT_19", "COMPACT_20", "COMPACT_21", "COMPACT_22", "COMPACT_23"]
SCORE_REVERSE_TOTAL = ["COMPACT_02", "COMPACT_03", "COMPACT_04", "COMPACT_06", "COMPACT_08", "COMPACT_09", "COMPACT_11", "COMPACT_12", "COMPACT_15", "COMPACT_16", "COMPACT_18", "COMPACT_19"]
SCORE_AGG_TOTAL = 'sum'
# openness_to_experience: 对体验的开放（OE，10题反向后）
SCORE_ITEMS_OPENNESS_TO_EXPERIENCE = ["COMPACT_02", "COMPACT_04", "COMPACT_06", "COMPACT_08", "COMPACT_11", "COMPACT_13", "COMPACT_15", "COMPACT_18", "COMPACT_20", "COMPACT_22"]
SCORE_REVERSE_OPENNESS_TO_EXPERIENCE = ["COMPACT_02", "COMPACT_04", "COMPACT_06", "COMPACT_08", "COMPACT_11", "COMPACT_15", "COMPACT_18"]
SCORE_AGG_OPENNESS_TO_EXPERIENCE = 'sum'
# behavioural_awareness: 对行为的觉察（BA，5题反向后）
SCORE_ITEMS_BEHAVIOURAL_AWARENESS = ["COMPACT_03", "COMPACT_09", "COMPACT_12", "COMPACT_16", "COMPACT_19"]
SCORE_REVERSE_BEHAVIOURAL_AWARENESS = ["COMPACT_03", "COMPACT_09", "COMPACT_12", "COMPACT_16", "COMPACT_19"]
SCORE_AGG_BEHAVIOURAL_AWARENESS = 'sum'
# valued_action: 价值行动（VA，8题）
SCORE_ITEMS_VALUED_ACTION = ["COMPACT_01", "COMPACT_05", "COMPACT_07", "COMPACT_10", "COMPACT_14", "COMPACT_17", "COMPACT_21", "COMPACT_23"]
SCORE_REVERSE_VALUED_ACTION = []
SCORE_AGG_VALUED_ACTION = 'sum'

def compute(answers):
    """answers: {itemCode: 数值}；返回 {scoreKey: 分数或 None}。"""
    out = {}
    missing = [c for c in SCORE_ITEMS_TOTAL if c not in answers]
    if missing:
        out['total'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_TOTAL else answers[c]
                 for c in SCORE_ITEMS_TOTAL]
        out['total'] = (sum(_vals) / len(_vals)) if SCORE_AGG_TOTAL == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_OPENNESS_TO_EXPERIENCE if c not in answers]
    if missing:
        out['openness_to_experience'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_OPENNESS_TO_EXPERIENCE else answers[c]
                 for c in SCORE_ITEMS_OPENNESS_TO_EXPERIENCE]
        out['openness_to_experience'] = (sum(_vals) / len(_vals)) if SCORE_AGG_OPENNESS_TO_EXPERIENCE == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_BEHAVIOURAL_AWARENESS if c not in answers]
    if missing:
        out['behavioural_awareness'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_BEHAVIOURAL_AWARENESS else answers[c]
                 for c in SCORE_ITEMS_BEHAVIOURAL_AWARENESS]
        out['behavioural_awareness'] = (sum(_vals) / len(_vals)) if SCORE_AGG_BEHAVIOURAL_AWARENESS == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_VALUED_ACTION if c not in answers]
    if missing:
        out['valued_action'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_VALUED_ACTION else answers[c]
                 for c in SCORE_ITEMS_VALUED_ACTION]
        out['valued_action'] = (sum(_vals) / len(_vals)) if SCORE_AGG_VALUED_ACTION == 'mean' else sum(_vals)
    return out
