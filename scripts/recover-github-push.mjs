// Recover a failed Git receive-pack using the Git Database API. Only an exact
// reconstruction of the local commit may advance the expected remote parent.
import { execFileSync } from 'node:child_process'

const [directory, repository, branch] = process.argv.slice(2)
if (!directory || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[\w./-]+$/.test(branch ?? '')) throw new Error('Expected checkout, owner/repository and branch')
const run = (program, args, input) => execFileSync(program,args,{cwd:directory,input,maxBuffer:20_000_000})
const git = (...args) => run('git',args).toString('utf8').trimEnd()
const api = (path, body, method='POST') => JSON.parse(run('gh',['api',`repos/${repository}/${path}`,...(body === undefined ? [] : ['--method',method,'--input','-'])],body === undefined ? undefined : JSON.stringify(body)).toString('utf8'))
const remote = git('remote','get-url','origin').replace(/\.git$/,'')
if (remote !== `https://github.com/${repository}` && remote !== `git@github.com:${repository}`) throw new Error('Unexpected GitHub remote')
if (git('status','--porcelain')) throw new Error('Checkout has uncommitted changes')
const head = git('rev-parse','HEAD'), parent = git('rev-parse','HEAD^')
const current = api(`git/ref/heads/${branch}`).object.sha
if (current !== head) {
  if (current !== parent) throw new Error('Remote branch changed; refusing to overwrite it')
  const base = api(`git/commits/${parent}`)
  const changes = git('diff-tree','--no-commit-id','--name-status','--no-renames','-r','-z','HEAD').split('\0').filter(Boolean)
  const tree = []
  for (let index=0;index<changes.length;index+=2) {
    const status=changes[index], path=changes[index+1]
    if (!path || !['A','M','D'].includes(status)) throw new Error('Unsupported tree change')
    if (status==='D') { tree.push({path,mode:'100644',type:'blob',sha:null}); continue }
    const blob=api('git/blobs',{content:run('git',['show',`${head}:${path}`]).toString('base64'),encoding:'base64'})
    tree.push({path,mode:'100644',type:'blob',sha:blob.sha})
  }
  const reconstructed=api('git/trees',{base_tree:base.tree.sha,tree})
  if (reconstructed.sha!==git('rev-parse','HEAD^{tree}')) throw new Error('Reconstructed tree differs from local commit')
  const fields=git('show','-s','--format=%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%B','HEAD').split('\n')
  const commit=api('git/commits',{tree:reconstructed.sha,parents:[parent],message:`${fields.slice(6).join('\n')}\n`,author:{name:fields[0],email:fields[1],date:fields[2]},committer:{name:fields[3],email:fields[4],date:fields[5]}})
  if (commit.sha!==head) throw new Error('Reconstructed commit differs from local commit')
  api(`git/refs/heads/${branch}`,{sha:head,force:false},'PATCH')
}
if (api(`git/ref/heads/${branch}`).object.sha!==head) throw new Error('Remote commit verification failed')
git('fetch','origin',branch)
console.log(`Recovered GitHub push: ${repository} ${branch} ${head.slice(0,7)} (identical commit, no force)`)
