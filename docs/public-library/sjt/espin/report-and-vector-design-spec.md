# Draft report wording and original vector-chart design specification

Unpublished editorial design only. No source website images or code; no chart image or executable assessment created. The underlying source is the CC BY 4.0 supplement by Malini Josiam, Walter Lee, Stephany Santos and Ananya Saini: https://ndownloader.figshare.com/files/68624977 . License https://creativecommons.org/licenses/by/4.0/ . Wording and design below are new adaptations, not author-endorsed or validated Chinese reporting.

## Opening statement / 开头说明

EN: This summary describes which responses you selected in these 19 situations. It does not measure ability, establish a fixed personality type, diagnose a condition, or compare you with a reference population. Context and available resources may affect your choices. The Chinese translation is a draft and has not been validated.

ZH: 本摘要描述你在这 19 个情境中选择了哪些应对方式。它不测量能力，不确定固定的人格类型，不作诊断，也不将你与常模人群比较。所处情境和可获得的资源可能影响你的选择。中文译本为草稿，尚未经验证。

## Counts, not scores / 次数，而非能力得分

EN: Selected as MOST likely: {category}: {most_count} of 19 situations. Selected as LEAST likely: {category}: {least_count} of 19 situations. These are separate counts; do not subtract one from the other.

ZH: 被选为“最可能采取”的次数：{类别}，19 个情境中有 {most_count} 次。被选为“最不可能采取”的次数：{类别}，19 个情境中有 {least_count} 次。这是两组独立的次数，不相减。

EN: Most frequently selected as MOST likely: {all_max_most_categories}, each {max_most_count} times. If multiple categories share the maximum, all are shown; no single category is assigned.

ZH: 被选为“最可能采取”次数最多的类别：{所有并列类别}，各 {max_most_count} 次。如果有多个类别并列最多，全部列出，不指定单一类别。

EN: Most frequently selected as LEAST likely: {all_max_least_categories}, each {max_least_count} times. This is not the category with the fewest MOST selections.

ZH: 被选为“最不可能采取”次数最多的类别：{所有并列类别}，各 {max_least_count} 次。这不等同于“最可能采取”次数最少的类别。

## Domain summaries / 领域摘要

EN: Within {domain}, your MOST-likely selections were {category_counts}, across {domain_n} situations. All categories tied for the largest count are listed. Only MOST-likely selections are summarized here. Domains have just 3 or 4 situations and are not validated subscale scores.

ZH: 在“{领域}”的 {domain_n} 个情境中，你选为“最可能采取”的各类别次数为 {category_counts}。次数最多的所有并列类别均列出。此处仅汇总“最可能采取”的选择。每个领域只有 3 或 4 个情境，不是经过验证的分量表得分。

## Optional author commentary / 可选作者描述

Place the verbatim English and faithful Chinese Appendix D description in a separate expandable section titled “Author's general description / 作者的一般性描述.” State that the text describes a response category, not a validated individual conclusion. Do not dynamically rewrite it as “you have poor coping skills,” “you need therapy,” or “you are high/low.” Present general strengths and limitations without ranking categories as good/bad. No intervention recommendation inferred from counts.

## Original SVG design specification (not a source image)

- White background; black/dark text; no red/green clinical severity colors, gauges, radar areas or percentile bands.
- Overall section: five rows in fixed A–E order; one blue bar for MOST count and one neutral outlined bar for LEAST count per category. Shared integer horizontal axis 0–19. Exact values visible as text at bar ends, and a text table equivalent available for accessibility.
- Label the series in text, not color alone: “最可能 / MOST” and “最不可能 / LEAST.” Do not stack these two series, because each separately sums to 19.
- Above the bars, use “选择次数 / Selection counts,” not “能力得分 / Ability score.” Display “19 个情境 / 19 situations.” Footer includes “草稿；中文未经验证 / Draft; Chinese not validated.”
- Domain section: six small panels with five category counts each, MOST only. Common integer axis 0–4; show the actual domain denominator (3 or 4) in each panel. Do not normalize to percentile or imply comparability of validated domain scores.
- Ties: state all tied categories in adjacent plain text, preserving A–E order purely for display. Do not choose the first category as winner.
- Export vector SVG authored from these primitives only. No logos, source screenshots, official chart traces or copied website styles/assets. Require independent numeric review of the underlying complete response pairs before generating respondent-specific charts.
- Accessibility: adequate text contrast, no color-only semantics, explicit counts, English and Simplified Chinese font fallbacks, and descriptive alt text. Never label the underlying values as validated norms.

## Invalid response handling

EN: Each situation needs one MOST and one different LEAST response. Please complete or correct situation {id}. No result is calculated until all 19 pairs are valid.

ZH: 每个情境需要选择一项“最可能采取”和另一项不同的“最不可能采取”。请补全或更正第 {id} 个情境。在 19 组选择全部有效之前，不计算结果。

This is an error-message draft, not implementation. The authoritative runtime must reject same-option pairs even if the front-end is bypassed.
