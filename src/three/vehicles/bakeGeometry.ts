import * as T from 'three'

/** Preserve metric size when a compressed glTF stores normalized integer accessors. */
export function bakeGeometry(source: T.BufferGeometry, matrix: T.Matrix4) {
  const geometry = source.clone()
  for (const key of ['position', 'normal']) {
    const a = geometry.getAttribute(key)
    if (a) {
      const values = new Float32Array(a.count * 3)
      for (let i = 0; i < a.count; i++) {
        values[i * 3] = a.getX(i)
        values[i * 3 + 1] = a.getY(i)
        values[i * 3 + 2] = a.getZ(i)
      }
      geometry.setAttribute(key, new T.BufferAttribute(values, 3))
    }
  }
  geometry.applyMatrix4(matrix)
  geometry.computeBoundingSphere()
  return geometry
}
