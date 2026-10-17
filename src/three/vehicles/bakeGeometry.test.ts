import { expect, it } from 'vitest'
import * as T from 'three'
import { bakeGeometry } from './bakeGeometry'
it('bakes quantized glTF accessors without integer overflow or changing the cached asset', () => {
  const g = new T.BufferGeometry()
  g.setAttribute(
    'position',
    new T.BufferAttribute(
      new Int16Array([-32767, 0, 32767, 32767, 0, -32767]),
      3,
      true,
    ),
  )
  const matrix = new T.Matrix4().makeScale(2.45, 2.45, 2.45)
  const result = bakeGeometry(g, matrix)
  expect(result.attributes.position.getX(0)).toBeCloseTo(-2.45)
  expect(result.attributes.position.getZ(0)).toBeCloseTo(2.45)
  expect(g.attributes.position.getX(0)).toBe(-1)
  g.dispose()
  result.dispose()
})
