# -*- coding: utf-8 -*-
"""AFQ-Y 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["AFQY_01", "AFQY_02", "AFQY_03", "AFQY_04", "AFQY_05", "AFQY_06", "AFQY_07", "AFQY_08", "AFQY_09", "AFQY_10", "AFQY_11", "AFQY_12", "AFQY_13", "AFQY_14", "AFQY_15", "AFQY_16", "AFQY_17"]
MAX_VALUE = 4  # 作答量尺上端

# total: 心理不灵活性总分（17题）
SCORE_ITEMS_TOTAL = ["AFQY_01", "AFQY_02", "AFQY_03", "AFQY_04", "AFQY_05", "AFQY_06", "AFQY_07", "AFQY_08", "AFQY_09", "AFQY_10", "AFQY_11", "AFQY_12", "AFQY_13", "AFQY_14", "AFQY_15", "AFQY_16", "AFQY_17"]
SCORE_REVERSE_TOTAL = []

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
    return out
