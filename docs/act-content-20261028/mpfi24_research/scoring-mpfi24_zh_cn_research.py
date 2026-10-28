# -*- coding: utf-8 -*-
"""MPFI-24 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["MPFI24_01", "MPFI24_02", "MPFI24_03", "MPFI24_04", "MPFI24_05", "MPFI24_06", "MPFI24_07", "MPFI24_08", "MPFI24_09", "MPFI24_10", "MPFI24_11", "MPFI24_12", "MPFI24_13", "MPFI24_14", "MPFI24_15", "MPFI24_16", "MPFI24_17", "MPFI24_18", "MPFI24_19", "MPFI24_20", "MPFI24_21", "MPFI24_22", "MPFI24_23", "MPFI24_24"]
MAX_VALUE = 6  # 作答量尺上端

# acceptance: 接纳
SCORE_ITEMS_ACCEPTANCE = ["MPFI24_01", "MPFI24_02"]
SCORE_REVERSE_ACCEPTANCE = []
SCORE_AGG_ACCEPTANCE = 'mean'
# present_moment: 接触当下
SCORE_ITEMS_PRESENT_MOMENT = ["MPFI24_03", "MPFI24_04"]
SCORE_REVERSE_PRESENT_MOMENT = []
SCORE_AGG_PRESENT_MOMENT = 'mean'
# self_as_context: 以己为景
SCORE_ITEMS_SELF_AS_CONTEXT = ["MPFI24_05", "MPFI24_06"]
SCORE_REVERSE_SELF_AS_CONTEXT = []
SCORE_AGG_SELF_AS_CONTEXT = 'mean'
# defusion: 认知解离
SCORE_ITEMS_DEFUSION = ["MPFI24_07", "MPFI24_08"]
SCORE_REVERSE_DEFUSION = []
SCORE_AGG_DEFUSION = 'mean'
# values: 价值
SCORE_ITEMS_VALUES = ["MPFI24_09", "MPFI24_10"]
SCORE_REVERSE_VALUES = []
SCORE_AGG_VALUES = 'mean'
# committed_action: 承诺行动
SCORE_ITEMS_COMMITTED_ACTION = ["MPFI24_11", "MPFI24_12"]
SCORE_REVERSE_COMMITTED_ACTION = []
SCORE_AGG_COMMITTED_ACTION = 'mean'
# experiential_avoidance: 经验性回避
SCORE_ITEMS_EXPERIENTIAL_AVOIDANCE = ["MPFI24_13", "MPFI24_14"]
SCORE_REVERSE_EXPERIENTIAL_AVOIDANCE = []
SCORE_AGG_EXPERIENTIAL_AVOIDANCE = 'mean'
# lack_of_contact_present_moment: 缺乏当下接触
SCORE_ITEMS_LACK_OF_CONTACT_PRESENT_MOMENT = ["MPFI24_15", "MPFI24_16"]
SCORE_REVERSE_LACK_OF_CONTACT_PRESENT_MOMENT = []
SCORE_AGG_LACK_OF_CONTACT_PRESENT_MOMENT = 'mean'
# self_as_content: 以己为内容
SCORE_ITEMS_SELF_AS_CONTENT = ["MPFI24_17", "MPFI24_18"]
SCORE_REVERSE_SELF_AS_CONTENT = []
SCORE_AGG_SELF_AS_CONTENT = 'mean'
# fusion: 认知融合
SCORE_ITEMS_FUSION = ["MPFI24_19", "MPFI24_20"]
SCORE_REVERSE_FUSION = []
SCORE_AGG_FUSION = 'mean'
# lack_of_contact_values: 缺乏价值联结
SCORE_ITEMS_LACK_OF_CONTACT_VALUES = ["MPFI24_21", "MPFI24_22"]
SCORE_REVERSE_LACK_OF_CONTACT_VALUES = []
SCORE_AGG_LACK_OF_CONTACT_VALUES = 'mean'
# inaction: 无所作为
SCORE_ITEMS_INACTION = ["MPFI24_23", "MPFI24_24"]
SCORE_REVERSE_INACTION = []
SCORE_AGG_INACTION = 'mean'
# flexibility_composite: 全局灵活性合成分（12题均值）
SCORE_ITEMS_FLEXIBILITY_COMPOSITE = ["MPFI24_01", "MPFI24_02", "MPFI24_03", "MPFI24_04", "MPFI24_05", "MPFI24_06", "MPFI24_07", "MPFI24_08", "MPFI24_09", "MPFI24_10", "MPFI24_11", "MPFI24_12"]
SCORE_REVERSE_FLEXIBILITY_COMPOSITE = []
SCORE_AGG_FLEXIBILITY_COMPOSITE = 'mean'
# inflexibility_composite: 全局不灵活性合成分（12题均值）
SCORE_ITEMS_INFLEXIBILITY_COMPOSITE = ["MPFI24_13", "MPFI24_14", "MPFI24_15", "MPFI24_16", "MPFI24_17", "MPFI24_18", "MPFI24_19", "MPFI24_20", "MPFI24_21", "MPFI24_22", "MPFI24_23", "MPFI24_24"]
SCORE_REVERSE_INFLEXIBILITY_COMPOSITE = []
SCORE_AGG_INFLEXIBILITY_COMPOSITE = 'mean'

def compute(answers):
    """answers: {itemCode: 数值}；返回 {scoreKey: 分数或 None}。"""
    out = {}
    missing = [c for c in SCORE_ITEMS_ACCEPTANCE if c not in answers]
    if missing:
        out['acceptance'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_ACCEPTANCE else answers[c]
                 for c in SCORE_ITEMS_ACCEPTANCE]
        out['acceptance'] = (sum(_vals) / len(_vals)) if SCORE_AGG_ACCEPTANCE == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_PRESENT_MOMENT if c not in answers]
    if missing:
        out['present_moment'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_PRESENT_MOMENT else answers[c]
                 for c in SCORE_ITEMS_PRESENT_MOMENT]
        out['present_moment'] = (sum(_vals) / len(_vals)) if SCORE_AGG_PRESENT_MOMENT == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_SELF_AS_CONTEXT if c not in answers]
    if missing:
        out['self_as_context'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_SELF_AS_CONTEXT else answers[c]
                 for c in SCORE_ITEMS_SELF_AS_CONTEXT]
        out['self_as_context'] = (sum(_vals) / len(_vals)) if SCORE_AGG_SELF_AS_CONTEXT == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_DEFUSION if c not in answers]
    if missing:
        out['defusion'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_DEFUSION else answers[c]
                 for c in SCORE_ITEMS_DEFUSION]
        out['defusion'] = (sum(_vals) / len(_vals)) if SCORE_AGG_DEFUSION == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_VALUES if c not in answers]
    if missing:
        out['values'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_VALUES else answers[c]
                 for c in SCORE_ITEMS_VALUES]
        out['values'] = (sum(_vals) / len(_vals)) if SCORE_AGG_VALUES == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_COMMITTED_ACTION if c not in answers]
    if missing:
        out['committed_action'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_COMMITTED_ACTION else answers[c]
                 for c in SCORE_ITEMS_COMMITTED_ACTION]
        out['committed_action'] = (sum(_vals) / len(_vals)) if SCORE_AGG_COMMITTED_ACTION == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_EXPERIENTIAL_AVOIDANCE if c not in answers]
    if missing:
        out['experiential_avoidance'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_EXPERIENTIAL_AVOIDANCE else answers[c]
                 for c in SCORE_ITEMS_EXPERIENTIAL_AVOIDANCE]
        out['experiential_avoidance'] = (sum(_vals) / len(_vals)) if SCORE_AGG_EXPERIENTIAL_AVOIDANCE == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_LACK_OF_CONTACT_PRESENT_MOMENT if c not in answers]
    if missing:
        out['lack_of_contact_present_moment'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_LACK_OF_CONTACT_PRESENT_MOMENT else answers[c]
                 for c in SCORE_ITEMS_LACK_OF_CONTACT_PRESENT_MOMENT]
        out['lack_of_contact_present_moment'] = (sum(_vals) / len(_vals)) if SCORE_AGG_LACK_OF_CONTACT_PRESENT_MOMENT == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_SELF_AS_CONTENT if c not in answers]
    if missing:
        out['self_as_content'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_SELF_AS_CONTENT else answers[c]
                 for c in SCORE_ITEMS_SELF_AS_CONTENT]
        out['self_as_content'] = (sum(_vals) / len(_vals)) if SCORE_AGG_SELF_AS_CONTENT == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_FUSION if c not in answers]
    if missing:
        out['fusion'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_FUSION else answers[c]
                 for c in SCORE_ITEMS_FUSION]
        out['fusion'] = (sum(_vals) / len(_vals)) if SCORE_AGG_FUSION == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_LACK_OF_CONTACT_VALUES if c not in answers]
    if missing:
        out['lack_of_contact_values'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_LACK_OF_CONTACT_VALUES else answers[c]
                 for c in SCORE_ITEMS_LACK_OF_CONTACT_VALUES]
        out['lack_of_contact_values'] = (sum(_vals) / len(_vals)) if SCORE_AGG_LACK_OF_CONTACT_VALUES == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_INACTION if c not in answers]
    if missing:
        out['inaction'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_INACTION else answers[c]
                 for c in SCORE_ITEMS_INACTION]
        out['inaction'] = (sum(_vals) / len(_vals)) if SCORE_AGG_INACTION == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_FLEXIBILITY_COMPOSITE if c not in answers]
    if missing:
        out['flexibility_composite'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_FLEXIBILITY_COMPOSITE else answers[c]
                 for c in SCORE_ITEMS_FLEXIBILITY_COMPOSITE]
        out['flexibility_composite'] = (sum(_vals) / len(_vals)) if SCORE_AGG_FLEXIBILITY_COMPOSITE == 'mean' else sum(_vals)
    missing = [c for c in SCORE_ITEMS_INFLEXIBILITY_COMPOSITE if c not in answers]
    if missing:
        out['inflexibility_composite'] = None
    else:
        _vals = [(MAX_VALUE - answers[c]) if c in SCORE_REVERSE_INFLEXIBILITY_COMPOSITE else answers[c]
                 for c in SCORE_ITEMS_INFLEXIBILITY_COMPOSITE]
        out['inflexibility_composite'] = (sum(_vals) / len(_vals)) if SCORE_AGG_INFLEXIBILITY_COMPOSITE == 'mean' else sum(_vals)
    return out
