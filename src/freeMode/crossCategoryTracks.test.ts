import { describe, expect, it } from 'vitest'
import { crossCategoryCoursePacks, equallySpacedCoursePoints } from './crossCategoryTracks'

describe('imported physical course distance sampling', () => {
  it('does not turn dense source vertices into extra braking corners', () => {
    const uneven: Array<[number,number]> = [[0,0],[.001,0],[.01,0],[10,0],[10,10],[0,10]]
    expect(equallySpacedCoursePoints(uneven,4)).toEqual([[0,0,0],[10,0,0],[10,0,10],[0,0,10]])
  })
  it('uses the native sampling count for every imported physical pack', () => {
    for (const pack of crossCategoryCoursePacks) {
      expect(pack.track.centerline,pack.id).toHaveLength(156)
      expect(pack.track.centerline.flat().every(Number.isFinite),pack.id).toBe(true)
    }
  })
})
