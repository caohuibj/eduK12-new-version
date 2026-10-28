# -*- coding: utf-8 -*-
"""CompACT-Y 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["CY_01", "CY_02", "CY_03", "CY_04", "CY_05", "CY_06", "CY_07", "CY_08", "CY_09", "CY_10", "CY_11", "CY_12", "CY_13", "CY_14", "CY_15", "CY_16", "CY_17", "CY_18", "CY_19"]
MAX_VALUE = 6  # 作答量尺上端

# total: 心理灵活性总分（19题）
SCORE_ITEMS_TOTAL = ["CY_01", "CY_02", "CY_03", "CY_04", "CY_05", "CY_06", "CY_07", "CY_08", "CY_09", "CY_10", "CY_11", "CY_12", "CY_13", "CY_14", "CY_15", "CY_16", "CY_17", "CY_18", "CY_19"]
SCORE_REVERSE_TOTAL = ["CY_02", "CY_03", "CY_05", "CY_06", "CY_08", "CY_09", "CY_11", "CY_12", "CY_14", "CY_15", "CY_17"]
# valued_action: 价值行动（VA，8题）
SCORE_ITEMS_VALUED_ACTION = ["CY_01", "CY_04", "CY_07", "CY_10", "CY_13", "CY_16", "CY_18", "CY_19"]
SCORE_REVERSE_VALUED_ACTION = []
# openness_to_experience: 对体验的开放（OE，6题反向后）
SCORE_ITEMS_OPENNESS_TO_EXPERIENCE = ["CY_02", "CY_05", "CY_08", "CY_11", "CY_14", "CY_17"]
SCORE_REVERSE_OPENNESS_TO_EXPERIENCE = ["CY_02", "CY_05", "CY_08", "CY_11", "CY_14", "CY_17"]
# behavioural_awareness: 对行为的觉察（BA，5题反向后）
SCORE_ITEMS_BEHAVIOURAL_AWARENESS = ["CY_03", "CY_06", "CY_09", "CY_12", "CY_15"]
SCORE_REVERSE_BEHAVIOURAL_AWARENESS = ["CY_03", "CY_06", "CY_09", "CY_12", "CY_15"]

def compute(answers):
    """answers: {itemCode: 数值}；返回 {scoreKey: 分数或 None}。"""
    out = {}
    missing = [c for c in SCORE_ITEMS_TOTAL if c not in answers]
    if missing:
        out['total'] = None
    else:
        out['total'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_TOTAL else answers[c]
            for c in SCORE_ITEMS_TOTAL)
    missing = [c for c in SCORE_ITEMS_VALUED_ACTION if c not in answers]
    if missing:
        out['valued_action'] = None
    else:
        out['valued_action'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_VALUED_ACTION else answers[c]
            for c in SCORE_ITEMS_VALUED_ACTION)
    missing = [c for c in SCORE_ITEMS_OPENNESS_TO_EXPERIENCE if c not in answers]
    if missing:
        out['openness_to_experience'] = None
    else:
        out['openness_to_experience'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_OPENNESS_TO_EXPERIENCE else answers[c]
            for c in SCORE_ITEMS_OPENNESS_TO_EXPERIENCE)
    missing = [c for c in SCORE_ITEMS_BEHAVIOURAL_AWARENESS if c not in answers]
    if missing:
        out['behavioural_awareness'] = None
    else:
        out['behavioural_awareness'] = sum(
            (MAX_VALUE - answers[c]) if c in SCORE_REVERSE_BEHAVIOURAL_AWARENESS else answers[c]
            for c in SCORE_ITEMS_BEHAVIOURAL_AWARENESS)
    return out
