import { describe, expect, it } from 'vitest'
import {
  createAdministrationProvenanceTracker,
  inferCoarseDeviceClass,
  modalityFromPointerType,
  reconcileDeviceClass,
} from '../administration-provenance'

describe('AdministrationProvenanceV1', () => {
  it.each([
    [[], 'UNKNOWN'],
    [['touch'], 'TOUCH'],
    [['mouse'], 'KEYBOARD_MOUSE'],
    [['keyboard'], 'KEYBOARD_MOUSE'],
    [['mouse', 'keyboard'], 'KEYBOARD_MOUSE'],
    [['touch', 'mouse'], 'MIXED'],
    [['touch', 'keyboard'], 'MIXED'],
    [['touch', 'mouse', 'keyboard'], 'MIXED'],
    [['pen'], 'UNKNOWN'],
    [['pen', 'touch'], 'TOUCH'],
    [['pen', 'mouse'], 'KEYBOARD_MOUSE'],
    [['pen', 'keyboard'], 'KEYBOARD_MOUSE'],
    [['pen', 'touch', 'keyboard'], 'MIXED'],
    [['unknown', 'touch', 'unknown'], 'TOUCH'],
    [['touch', 'touch', 'touch'], 'TOUCH'],
  ] as const)('aggregates %j to %s', (events, expected) => {
    const tracker = createAdministrationProvenanceTracker({ deviceClass: 'UNKNOWN' })
    for (const event of events) tracker.observe(event)
    expect(tracker.snapshot().administrationMode).toBe(expected)
  })

  it('keeps no-response/timeout semantics outside the modality tracker', () => {
    const tracker = createAdministrationProvenanceTracker({ deviceClass: 'PHONE' })
    // timeout/miss/omission means no observe() call.
    expect(tracker.snapshot()).toEqual({
      schemaVersion: 1,
      deviceClass: 'PHONE',
      administrationMode: 'UNKNOWN',
    })
  })

  it('restores an aggregate mode without inventing detailed history', () => {
    const tracker = createAdministrationProvenanceTracker({
      deviceClass: 'DESKTOP_LAPTOP',
      initial: { schemaVersion: 1, deviceClass: 'DESKTOP_LAPTOP', administrationMode: 'TOUCH' },
    })
    tracker.observe('keyboard')
    expect(tracker.snapshot()).toEqual({
      schemaVersion: 1,
      deviceClass: 'DESKTOP_LAPTOP',
      administrationMode: 'MIXED',
    })
  })

  it('marks conflicting known form factors as UNKNOWN on cross-device resume', () => {
    expect(reconcileDeviceClass('PHONE', 'DESKTOP_LAPTOP')).toBe('UNKNOWN')
    expect(reconcileDeviceClass('PHONE', 'UNKNOWN')).toBe('PHONE')
    expect(reconcileDeviceClass('UNKNOWN', 'TABLET')).toBe('TABLET')
  })

  it('normalizes pointer types without guessing unknown values', () => {
    expect(modalityFromPointerType('mouse')).toBe('mouse')
    expect(modalityFromPointerType('touch')).toBe('touch')
    expect(modalityFromPointerType('pen')).toBe('pen')
    expect(modalityFromPointerType('')).toBe('unknown')
  })
})

describe('coarse device classification', () => {
  it('classifies only high-confidence form factors', () => {
    expect(inferCoarseDeviceClass({
      screenWidth: 390,
      screenHeight: 844,
      maxTouchPoints: 5,
      primaryCoarsePointer: true,
      anyFinePointer: false,
    })).toBe('PHONE')

    expect(inferCoarseDeviceClass({
      screenWidth: 820,
      screenHeight: 1180,
      maxTouchPoints: 5,
      primaryCoarsePointer: true,
      anyFinePointer: true,
    })).toBe('TABLET')

    expect(inferCoarseDeviceClass({
      screenWidth: 1440,
      screenHeight: 900,
      maxTouchPoints: 0,
      primaryCoarsePointer: false,
      anyFinePointer: true,
    })).toBe('DESKTOP_LAPTOP')
  })

  it('keeps ambiguous touch laptops and tablet-with-fine-primary-pointer unknown', () => {
    expect(inferCoarseDeviceClass({
      screenWidth: 1366,
      screenHeight: 768,
      maxTouchPoints: 10,
      primaryCoarsePointer: false,
      anyFinePointer: true,
    })).toBe('UNKNOWN')
    expect(inferCoarseDeviceClass({
      screenWidth: 1024,
      screenHeight: 768,
      maxTouchPoints: 5,
      primaryCoarsePointer: false,
      anyFinePointer: true,
    })).toBe('UNKNOWN')
  })

  it('never uses viewport width and honors an explicit product fact', () => {
    expect(inferCoarseDeviceClass({ explicitDeviceClass: 'PHONE' })).toBe('PHONE')
    expect(inferCoarseDeviceClass({ screenWidth: null, screenHeight: null, maxTouchPoints: 5 })).toBe('UNKNOWN')
  })
})
