import { describe, expect, it } from 'vitest'
import { performanceSessionForWeekendStage } from './sessionRules'

describe('weekend performance axes', () => {
  it('uses qualifying pace only for Q/SQ and race pace for FP/races', () => {
    expect(performanceSessionForWeekendStage('qualifying')).toBe('qualifying')
    expect(performanceSessionForWeekendStage('qualifying2')).toBe('qualifying')
    expect(performanceSessionForWeekendStage('sprintQualifying')).toBe(
      'qualifying',
    )
    expect(performanceSessionForWeekendStage('fp1')).toBe('race')
    expect(performanceSessionForWeekendStage('fp2')).toBe('race')
    expect(performanceSessionForWeekendStage('fp3')).toBe('race')
    expect(performanceSessionForWeekendStage('sprint')).toBe('race')
    expect(performanceSessionForWeekendStage('race')).toBe('race')
    expect(performanceSessionForWeekendStage('race2')).toBe('race')
  })
})
