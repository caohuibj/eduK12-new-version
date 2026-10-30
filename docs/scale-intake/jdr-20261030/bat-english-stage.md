# BAT English source-only two-tool development slice

Source: 2020 IJERPH17:9495 Appendix B Table A2/A3, DOI: 10.3390/ijerph17249495. Both English questionnaire item sets are from the attributed CC BY 4.0 article; the separate author-hosted questionnaire PDF and manual are not copied. BAT author site states no alterations to the instrument and mandatory citation: https://burnoutassessmenttool.be/start_eng/.

- `bat12_2020_en@1.0.0`: 12 English work-related core questions, one descriptive raw mean 1–5. C/S1.0.0, Pnone, R1.0.0 original Chinese teacher report. 5 golden sources, project complete_required missing policy (not claimed as author rule).
- `bat_secondary10_2020_en@1.0.0`: 10 English secondary psychological/psychosomatic complaints, one original mean 1–5 without independent five-item personal reports. C/S1.0.0 Pnone R1.0.0 Chinese report. 5 golden sources, project complete_required missing policy.

**Dependency**: shared presentation report locale validator PR #397 must be normally merged before this can be filed as *pure content* in a new PR. The English questionnaire/instruction remain `en`; the independent teacher report locale is `zh-CN`. No automatic English→Chinese questionnaire translation in this source branch. Author-hosted official simplified Chinese source exists, but BAT work Chinese item 9 has a substantial meaning conflict with English item 9. That translation is held out of executable development pending human review.

**Not done:** selected source actual runtime/score/report CI for these specific BAT instruments, Git merge, DB install, PUBLIC, deployment, grants, tasks, scientific validation or new author permission. The only prepared files are two unchanged original source declarations, wrappers, index and this note; no shared scorer, CI or runtime changes.
