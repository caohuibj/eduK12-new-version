# Wave 1 P1 Scale Integration Design

Status: IMPLEMENTING
Branch: `content/scale-expansion`
Scope: DASS-21, GSE, SDQ, MPFI-24, WHO-5, PSS-10

## 1. Goal

Introduce the re-reviewed P1 instruments into the Scale Library without weakening existing scientific, rights, localization, or deployment gates.

A P1 label means **content-priority**, not automatic publication readiness. The platform must continue to distinguish:

- scientific evidence;
- exact-form/localization provenance;
- executable package completeness;
- electronic administration / scoring / display rights;
- deployment status;
- report eligibility.

No instrument is allowed to become launchable merely because it has a Simplified Chinese translation or a Chinese validation paper.

## 2. Wave 1 instrument matrix

| Instrument | Chinese evidence population | Package plan | Launch posture |
| --- | --- | --- | --- |
| WHO-5 | Mainland Chinese university samples; existing product also uses a youth entry boundary | Existing executable package | Keep descriptive only; no Chinese norms/diagnosis |
| SDQ | Chinese children/adolescents, parent/teacher/self-report evidence; existing package coverage is parent + teacher | Existing executable packages | Keep electronic-administration authorization gate |
| DASS-21 | Chinese university students; 2023 study includes 1,507 primary + 1,131 middle-school students | Catalog first; executable package only after respondent-facing report policy is enforced | Not launchable in this wave |
| GSE | Chinese adaptation; large Chinese school-age and university samples in later validation work | Catalog first | Not launchable until restricted-online-use / display conditions are represented and approved |
| MPFI-24 | 3,568 Chinese respondents across middle-school students, university students, university teachers and medical professionals | Catalog first | Not launchable until exact Simplified Chinese form + redistribution/digital-use provenance is stored |
| PSS-10 | 1,096 Shanghai university students; two-week retest n=129 | Catalog first | Permission required through MAPI/ePROVIDE; no package until authorization/text provenance closes |

## 3. Canonical evidence anchors

### DASS-21

Original/source system:
- Lovibond, S. H., & Lovibond, P. F. (1995). *Manual for the Depression Anxiety Stress Scales* (2nd ed.).
- Official DASS site: questionnaire is public domain; computer administration is allowed for restricted groups, but public website/app administration and automated respondent interpretation are explicitly constrained.

Chinese validation anchors:
- Wang, K. et al. (2016). Cross-cultural validation of the Depression Anxiety Stress Scale-21 in China. *Psychological Assessment, 28*, e88-e100. DOI: 10.1037/pas0000207.
- Cao, C.-H. et al. (2023). Evaluating the psychometric properties of the Chinese Depression Anxiety Stress Scale for Youth (DASS-Y) and DASS-21. *Child and Adolescent Psychiatry and Mental Health, 17*, 106. DOI: 10.1186/s13034-023-00655-2. Primary-school n=1,507; middle-school n=1,131.

Interpretive constraint:
- Do not expose clinical cut-offs or automated diagnostic language in the student-facing report.
- For younger samples, do not overstate separation of depression/anxiety/stress; the 2023 study reports weak discriminant validity for DASS-21 despite acceptable reliability/convergent validity.

### GSE

Original:
- Schwarzer, R., & Jerusalem, M. (1995). Generalized Self-Efficacy Scale. In *Measures in Health Psychology: A User's Portfolio*.

Chinese adaptation:
- Zhang, J. X., & Schwarzer, R. (1995). Measuring optimistic self-beliefs: A Chinese adaptation of the General Self-Efficacy Scale. *Psychologia, 38*(3), 174-181.

Rights constraint:
- Official documentation grants non-commercial research/development use and restricted password-protected online research, but states that the full scale must not be published openly on the Internet.

Interpretive constraint:
- Single construct: generalized self-efficacy.
- No diagnostic or ability/achievement inference.
- No population percentile until a version-matched reference set is explicitly added.

### MPFI-24

Original family:
- Rolffs, J. L., Rogge, R. D., & Wilson, K. G. (2018). Development and validation of the Multidimensional Psychological Flexibility Inventory. *Assessment, 25*, 458-482. DOI: 10.1177/1073191116645905.

Chinese short-form validation:
- Fang, S., Huang, M., Ding, D., & Zheng, Q. (2024). The Chinese version of the multidimensional psychological flexibility inventory short form (MPFI-24): Assessment of psychometric properties using classical test theory and network analysis. *Journal of Contextual Behavioral Science, 33*, 100805. DOI: 10.1016/j.jcbs.2024.100805.
- Valid respondents n=3,568 across middle-school students, university students, university teachers, and medical professionals; retest n=350 university students.

Interpretive constraint:
- Report flexibility and inflexibility separately; do not collapse them into a single good/bad personality label.
- No diagnosis and no claim that a score indicates psychopathology.

### PSS-10

Original:
- Cohen, S., Kamarck, T., & Mermelstein, R. (1983). A global measure of perceived stress. *Journal of Health and Social Behavior, 24*, 385-396.
- Cohen, S., & Williamson, G. (1988) is the standard 10-item scoring/reference source.

Chinese validation:
- Lu, W. et al. (2017). Chinese version of the Perceived Stress Scale-10: A psychometric study in Chinese university students. *PLOS ONE, 12*(12), e0189543. DOI: 10.1371/journal.pone.0189543. n=1,096; mean age 18.3; retest n=129.

Rights constraint:
- Current Carnegie Mellon guidance requires a permission request through MAPI/ePROVIDE.
- Translation rights may also belong to the translator. No item text enters the code-owned package until the authorization chain is recorded.

Interpretive constraint:
- No diagnostic cut-off. Report perceived stress as a descriptive construct only.

### WHO-5

Keep the existing code-owned Chinese PR package and report contract.

Validation anchor:
- Fung, S.-F. et al. (2022). Validity and Psychometric Evaluation of the Chinese Version of the 5-Item WHO Well-Being Index. *Frontiers in Public Health, 10*, 872436. DOI: 10.3389/fpubh.2022.872436.

Interpretive constraint:
- Keep raw 0-25 + percentage 0-100 as descriptive scores.
- No Chinese norm percentile and no diagnosis.

### SDQ

Keep the existing parent / teacher package architecture and existing electronic-administration rights gate.

Validation anchor:
- Du, Y., Kou, J., & Coghill, D. (2008). The validity, reliability and normative scores of the parent, teacher and self report versions of the SDQ in China. *Child and Adolescent Psychiatry and Mental Health, 2*, 8. DOI: 10.1186/1753-2000-2-8.

Interpretive constraint:
- Five domain scores + total difficulties remain descriptive unless an exact population/version reference is explicitly activated.
- Do not infer diagnosis from total difficulties or any subscale.
- Preserve known caveats around weaker reliability/structure for some subscales and self-report contexts.

## 4. Report design

### 4.1 Global rules

All Wave 1 reports must follow the existing `ScaleDefinitionV2.report` model when an executable package exists.

Default report level is **descriptive**:

1. instrument / respondent / time-window;
2. score cards for canonical scores;
3. plain-language construct explanation;
4. reflection guidance;
5. limitations and evidence-population boundary;
6. version / scoring / localization provenance;
7. explicit non-diagnostic disclaimer.

Forbidden by default:

- diagnosis;
- clinical labels derived only from questionnaire scores;
- high-stakes selection;
- school ranking;
- teacher accountability;
- unsupported cross-group comparisons;
- Chinese percentile/norm claims unless a version-matched reference set is activated.

### 4.2 DASS-21 planned report

Scores:
- depression;
- anxiety;
- stress.

Student-facing design (future, only if rights/report policy permits):
- describe the three recent-experience dimensions without severity labels;
- emphasize overlap between dimensions, especially in younger samples;
- provide general help-seeking language only, not automated clinical interpretation.

Research/admin report:
- retain raw dimension scores and scoring-version provenance;
- permit longitudinal within-person plots only under the platform's existing longitudinal safety rules.

### 4.3 GSE planned report

Scores:
- generalized self-efficacy total / mean (exact canonical scoring to be fixed when package provenance closes).

Narrative:
- describes perceived ability to cope with difficult or unexpected demands;
- higher score = stronger self-reported generalized self-efficacy;
- does not represent intelligence, academic achievement, executive-function performance, or diagnosis.

### 4.4 MPFI-24 planned report

Primary scores:
- psychological flexibility;
- psychological inflexibility.

Secondary scores may be added only when the exact 24-item scoring map is frozen and verified.

Narrative:
- flexibility and inflexibility are reported as related but distinct process dimensions;
- recommendations are reflection-oriented and ACT-consistent, without treatment claims.

### 4.5 PSS-10 planned report

Primary score:
- perceived stress total.

Narrative:
- describes perceived unpredictability, uncontrollability and overload during the defined recall period;
- no clinical thresholds;
- no normative rank unless an explicit applicable reference set is later activated.

### 4.6 WHO-5 / SDQ

Reuse existing runtime report contracts. This wave should enrich their Scientific Evidence Matrix rather than introduce new normative bands.

## 5. Publication states for this wave

- `WHO-5`: existing package remains product-published; deployment still rights/commercial-scope gated.
- `SDQ`: existing packages remain package-published; electronic administration remains authorization gated.
- `DASS-21`: Library `REVIEWED`, no launch until respondent-facing feedback policy is compatible with official use constraints.
- `GSE`: Library `REVIEWED`, no launch until restricted-online-use/display authorization is represented.
- `MPFI-24`: Library `REVIEWED`, no launch until exact Simplified Chinese item/scoring source and digital/redistribution provenance are recorded.
- `PSS-10`: Library `REVIEWED`, no launch until MAPI/ePROVIDE + translation permission evidence is recorded.

## 6. Engineering rule

Wave 1 must support **catalog-first / package-later** instruments. A `CANDIDATE` or `REVIEWED` catalog record without a package is allowed to appear as `NOT_AVAILABLE`, with an explicit governance reason. `ACCEPTED` continues to require a bound executable package.

This preserves fail-closed deployment while allowing the platform to represent scientifically prioritized instruments before rights/package work is complete.
