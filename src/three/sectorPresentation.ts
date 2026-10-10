/** Control-line-relative marks can wrap through zero in imported sessions.
 * Never fabricate equal sectors when no verified registration is available.
 */
export function sectorPresentationSpans(marks: readonly number[]) {
  return marks.map((start, index) => {
    const end = marks[(index + 1) % marks.length]
    return { start, span: end > start ? end - start : end + 1 - start }
  })
}
