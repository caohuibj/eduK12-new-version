# -*- coding: utf-8 -*-
"""CAMM 参考计分实现（完整题答计分；缺答按 complete_required 不计分，不补 0）。"""

# 全部题码（按官方题序）
ITEMS = ["CAMM_01", "CAMM_02", "CAMM_03", "CAMM_04", "CAMM_05", "CAMM_06", "CAMM_07", "CAMM_08", "CAMM_09", "CAMM_10"]
MAX_VALUE = 4  # 作答量尺上端

# total: 正念总分（10题，反向后）
SCORE_ITEMS_TOTAL = ["CAMM_01", "CAMM_02", "CAMM_03", "CAMM_04", "CAMM_05", "CAMM_06", "CAMM_07", "CAMM_08", "CAMM_09", "CAMM_10"]
SCORE_REVERSE_TOTAL = ["CAMM_01", "CAMM_02", "CAMM_03", "CAMM_04", "CAMM_05", "CAMM_06", "CAMM_07", "CAMM_08", "CAMM_09", "CAMM_10"]

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
