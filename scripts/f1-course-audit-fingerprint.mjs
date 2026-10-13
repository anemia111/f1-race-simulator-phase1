import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

// Include production inputs, not test/report files. Current measurements and
// immutable historical revisions have distinct, reproducible fingerprints.
export async function f1CourseAuditFingerprint(root, revision) {
  const paths = revision
    ? execFileSync('git', ['ls-tree', '-r', '--name-only', revision, '--', 'src'], {cwd:root,encoding:'utf8',windowsHide:true})
      .trim().split('\n').map(path=>path.slice(4))
    : await readdir(resolve(root,'src'),{recursive:true})
  const files = paths.filter(path=>
    /\.(ts|tsx|json|csv)$/.test(path) && !/\.test\.[tj]sx?$/.test(path)).map(path=>path.replaceAll('\\','/')).sort()
  // Historical reports must identify the immutable source they measured,
  // rather than pretending their evidence applies to later runtime changes.
  const blobs = revision ? execFileSync('git', ['cat-file', '--batch'], {
    cwd:root, input:files.map(file=>`${revision}:src/${file}\n`).join(''),
    maxBuffer:64*1024*1024, windowsHide:true,
  }) : null
  let offset = 0
  const hash = createHash('sha256')
  for (const file of files) {
    let contents
    if (blobs) {
      const end = blobs.indexOf(10,offset)
      const header = blobs.subarray(offset,end).toString('utf8')
      const match = /^\w+ blob (\d+)$/.exec(header)
      if (!match) throw new Error(`Missing historical audit input: ${file}`)
      const size = Number(match[1])
      contents = blobs.subarray(end+1,end+1+size).toString('utf8')
      offset = end+size+2
    } else contents = await readFile(resolve(root,'src',file),'utf8')
    hash.update(file.replaceAll('\\','/'))
    hash.update(contents.replaceAll('\r\n','\n'))
  }
  return `sha256:${hash.digest('hex')}`
}
