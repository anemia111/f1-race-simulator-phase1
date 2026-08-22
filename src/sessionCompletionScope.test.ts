import { describe, expect, it } from 'vitest'
import { sessionCompletionDestinationFor } from './sessionCompletionScope'

describe('session completion scope', () => {
  it('keeps Free Mode completion out of the championship weekend context', () => {
    expect(sessionCompletionDestinationFor('free')).toBe('free-mode')
    expect(sessionCompletionDestinationFor('championship')).toBe(
      'championship-weekend',
    )
  })
})
