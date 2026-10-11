import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

// Include production inputs, not test/report files. This intentionally
// invalidates measurements after any production source/data change.
export async function f1CourseAuditFingerprint(root) {
  const files = (await readdir(resolve(root,'src'),{recursive:true})).filter(path=>
    /\.(ts|tsx|json|csv)$/.test(path) && !/\.test\.[tj]sx?$/.test(path)).map(path=>path.replaceAll('\\','/')).sort()
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.replaceAll('\\','/'))
    hash.update((await readFile(resolve(root,'src',file),'utf8')).replaceAll('\r\n','\n'))
  }
  return `sha256:${hash.digest('hex')}`
}
