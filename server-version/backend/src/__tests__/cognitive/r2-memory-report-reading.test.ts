import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry';
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation';
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze';
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report';
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry';
import type { CognitiveParticipantPresentationV1 } from '../../modules/cognitive/participant-presentation.types';
import type { CognitiveProfile, CognitiveScoreResult } from '../../modules/cognitive/v2/types';
const keys = ['digitbackward', 'picturesequence', 'pairedassociate', 'wordlist', 'runningspan', 'sentencecheck', 'seqlearn', 'letternumseries', 'visualwm', 'auditoryrt', 'auditorynback'];
const load = async (key: string) => {
    const { participantPresentations } = await import(`../../modules/cognitive/tasks/${key}/participant-presentation.ts`);
    const presentation = participantPresentations.find((p: CognitiveParticipantPresentationV1) => p.reportReading?.version === '3.0.0') as CognitiveParticipantPresentationV1;
    const entry = requireCognitiveRegistryEntry(key, presentation.engineVersion, presentation.scoringVersion);
    const definition = buildCognitiveV2TaskDefinition(entry);
    const fixture = JSON.parse(readFileSync(new URL(`../../modules/cognitive/tasks/${key}/fixtures/${presentation.engineVersion}-${presentation.scoringVersion}.json`, import.meta.url), 'utf8')).cases[0].input;
    return { presentation, entry, definition, fixture };
};
const render = async (key: string, overrides?: {
    metrics?: Record<string, unknown>;
    quality?: CognitiveScoreResult['quality'];
    profile?: CognitiveProfile;
}) => {
    const { presentation, entry, definition, fixture } = await load(key);
    const score = definition.scorer(fixture);
    return projectThreeLayerReport({ ...entry, configVersion: entry.engineVersion, protocolSignature: 'synthetic-r2-report', profile: overrides?.profile ?? 'standard', participantPresentation: presentation,
        definition: definition.report, metricDefinitions: definition.metrics, qualityDefinitions: definition.quality,
        metrics: { ...score.metrics, ...overrides?.metrics }, score: { ...score, ...(overrides?.quality ? { quality: overrides.quality } : {}) }, config: fixture.config });
};
describe('R2 memory and audio participant reports', () => {
    it('renders new text using actual scorer fixtures and resolvable metric placeholders', async () => {
        for (const key of keys) {
            const report = await render(key);
            expect(report.reading?.reportVersion, key).toBe('3.0.0');
            expect(report.reading?.feedback.summary, key).not.toMatch(/\{\w+\}|undefined|NaN|毫秒 毫秒/);
            const { presentation, entry } = await load(key);
            expect(Object.keys(presentation.metrics).sort(), key).toEqual(Object.keys(entry.metricDefinitions).sort());
            const policy = presentation.reportReading!;
            for (const summary of [policy.summary, ...Object.values(policy.summaryByProfile ?? {})]) {
                for (const match of summary!.template.matchAll(/\{(\w+)\}/g))
                    expect(summary!.metricKeys, `${key}/${match[1]}`).toContain(match[1]);
            }
        }
    });
    it('preserves null/zero, hides the confounded contrast and keeps short n-back denominators', async () => {
        const quality: CognitiveScoreResult['quality'] = { state: 'interpretable', flags: {}, reasons: [] };
        const missing = await render('runningspan', { metrics: { runningSpanAccuracy: null }, quality });
        expect(missing.reading!.interpretation.withheldMetricKeys).toContain('runningSpanAccuracy');
        expect([...missing.headline, ...missing.user, ...missing.detail].some(m => m.key === 'runningSpanAccuracy')).toBe(false);
        const zero = await render('runningspan', { metrics: { runningSpanAccuracy: 0 }, quality });
        expect(zero.headline.find(m => m.key === 'runningSpanAccuracy')?.formatted).toBe('0%');
        const sentence = await render('sentencecheck');
        expect([...sentence.headline, ...sentence.user, ...sentence.detail].some(m => m.key === 'negationPenaltyMs')).toBe(false);
        expect(sentence.reading!.professional!.metrics.some(m => m.key === 'negationPenaltyMs')).toBe(false);
        const audio = await render('auditorynback', { profile: 'experience', metrics: { matchCount: 2, nonmatchCount: 8, dPrime: null }, quality: { state: 'limited', flags: { legacyUninterpretable: true }, reasons: [] } });
        expect([...audio.headline, ...audio.user].find(m => m.key === 'matchCount')?.value).toBe(2);
        expect([...audio.headline, ...audio.user].find(m => m.key === 'nonmatchCount')?.value).toBe(8);
        expect([...audio.headline, ...audio.user, ...audio.detail].some(m => m.key === 'dPrime')).toBe(false);
    });
    it('keeps old frozen wording while an explicit new config freezes R3 separately', async () => {
        const beforeKey = process.env.DATA_ENCRYPTION_KEY;
        process.env.DATA_ENCRYPTION_KEY = '1'.repeat(64);
        try {
            for (const key of keys) {
                const { entry, presentation, fixture } = await load(key);
                const oldDefinition = JSON.stringify(entry.reportDefinition);
                const before = freezeAssignmentProfile({ entry, baseConfig: fixture.config, profile: 'experience' });
                const oldFrozen = readFrozenReport(before.resolvedReportSnapshotEncrypted)!;
                const config = { ...fixture.config, report: { ...fixture.config.report, reportVersion: '3.0.0' } };
                const next = freezeAssignmentProfile({ entry, baseConfig: config, profile: 'experience' });
                const newFrozen = readFrozenReport(next.resolvedReportSnapshotEncrypted)!;
                expect(newFrozen.presentationVersion, key).toBe('3.0.0');
                expect(newFrozen.participantPresentation!.reportReading!.version, key).toBe('3.0.0');
                expect(next.resolvedConfigHash, key).not.toBe(before.resolvedConfigHash);
                const { report: oldReport, ...oldParameters } = before.resolvedConfig as Record<string, unknown>;
                const { report: newReport, ...newParameters } = next.resolvedConfig as Record<string, unknown>;
                expect(newParameters, key).toEqual(oldParameters);
                expect(JSON.stringify(entry.reportDefinition), key).toBe(oldDefinition);
                const title = presentation.reportReading!.title;
                try {
                    presentation.reportReading!.title = 'later live edit';
                    expect(readFrozenReport(next.resolvedReportSnapshotEncrypted), key).toEqual(newFrozen);
                    expect(readFrozenReport(before.resolvedReportSnapshotEncrypted), key).toEqual(oldFrozen);
                } finally { presentation.reportReading!.title = title; }
            }
        } finally {
            if (beforeKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
            else process.env.DATA_ENCRYPTION_KEY = beforeKey;
        }
    });
});
