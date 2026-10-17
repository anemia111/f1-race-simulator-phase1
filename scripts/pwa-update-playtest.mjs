import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { chromium } from 'playwright'
const out=resolve('../../outputs/pwa-update-qa');await mkdir(out,{recursive:true})
const roots={A:resolve('../../work/pwa-update-A'),B:resolve('dist'),legacy:resolve('../../work/stutter-before/f1-race-simulator-phase1/dist')}
let serving='A'
const mimes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)
  const root=roots[serving], file=resolve(root,'.'+(path==='/'?'/index.html':path))
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mimes[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes)
 }catch{res.writeHead(404);res.end()}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${server.address().port}/`
const browser=await chromium.launch({headless:true})
const errors=[],result={}
try{
 const context=await browser.newContext({viewport:{width:1920,height:1080}})
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://api.openf1.org/**',route=>route.abort())
 await page.goto(url);await page.waitForSelector('.app-update-current')
 await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;localStorage.setItem('pwa-test-preserve','unchanged')})
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null)
 const before=await page.locator('html').getAttribute('data-build-id')
 let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++})
 serving='B'
 await page.getByRole('button',{name:'更新を確認',exact:true}).click()
 await page.waitForSelector('.app-update-available')
 await page.screenshot({path:resolve(out,'update-available.png')})
 result.beforeBuild=before
 result.noAutomaticReload=navigations===0&&(await page.locator('html').getAttribute('data-build-id'))===before
 if(!result.noAutomaticReload)throw new Error('Background update interrupted page')
 await page.getByRole('button',{name:'最新版を表示',exact:true}).click()
 await page.waitForFunction(build=>document.documentElement.dataset.buildId!==build,before)
 await page.waitForSelector('.app-update-current')
 result.afterBuild=await page.locator('html').getAttribute('data-build-id')
 result.singleReload=navigations===1
 result.storagePreserved=await page.evaluate(()=>localStorage.getItem('pwa-test-preserve')==='unchanged')
 if(!result.singleReload||!result.storagePreserved)throw new Error('Reload/storage failure')
 await page.getByRole('complementary',{name:'dashboard navigation'}).getByRole('button',{name:'Categories',exact:true}).click()
 await page.getByLabel('Data category',{exact:true}).selectOption('wec')
 await page.getByRole('button',{name:'マシン情報',exact:true}).click()
 result.wecMachineCount=await page.locator('.machine-spec-card').count()
 if(result.wecMachineCount!==18)throw new Error('Missing WEC specs')
 await page.screenshot({path:resolve(out,'updated-wec-machines.png')})
 await context.setOffline(true)
 await page.getByRole('button',{name:'更新を確認',exact:true}).click()
 await page.waitForSelector('.app-update-offline')
 result.offlineNotice=await page.locator('.app-update-notice').innerText()
 await page.screenshot({path:resolve(out,'offline-notice.png')})
 await page.reload();await page.waitForSelector('.app-update-offline')
 result.offlineReloadBuild=await page.locator('html').getAttribute('data-build-id')
 if(result.offlineReloadBuild!==result.afterBuild)throw new Error('Offline navigation lost newest shell')
 await context.setOffline(false)
 await page.getByRole('button',{name:'更新を確認',exact:true}).click()
 await page.waitForSelector('.app-update-current')
 result.reconnectCurrent=true
 await context.close()
 serving='legacy'
 const legacyContext=await browser.newContext({viewport:{width:1920,height:1080}})
 const legacyPage=await legacyContext.newPage()
 await legacyPage.route('https://api.openf1.org/**',route=>route.abort())
 await legacyPage.goto(url)
 await legacyPage.waitForFunction(()=>navigator.serviceWorker.controller!==null)
 result.legacyInitiallyMissingCategories=!(await legacyPage.getByRole('complementary',{name:'dashboard navigation'}).innerText()).includes('CATEGORIES')
 serving='B'
 await legacyPage.evaluate(async()=>{
  const old=navigator.serviceWorker.controller
  const nextController=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Legacy activation timeout')),15000)
   navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve()}, {once:true})
  })
  await (await navigator.serviceWorker.getRegistration()).update()
  if(navigator.serviceWorker.controller===old)await nextController
 })
 await legacyPage.reload()
 await legacyPage.waitForSelector('.app-update-current')
 result.legacySingleNavigationUpgraded=(await legacyPage.getByRole('complementary',{name:'dashboard navigation'}).innerText()).includes('CATEGORIES')
 if(!result.legacyInitiallyMissingCategories||!result.legacySingleNavigationUpgraded)throw new Error('Legacy upgrade failed')
 await legacyContext.close()
 const freshContext=await browser.newContext()
 const freshPage=await freshContext.newPage()
 await freshPage.route('https://api.openf1.org/**',route=>route.abort())
 await freshPage.goto(url)
 await freshPage.waitForFunction(()=>navigator.serviceWorker.controller!==null)
 await freshContext.setOffline(true)
 await freshPage.reload()
 await freshPage.waitForSelector('.app-update-offline')
 result.firstInstallOfflineFallback=true
 await freshContext.close()
 result.errors=errors
 if(errors.length)throw new Error(errors.join('\n'))
 await writeFile(resolve(out,'results.json'),JSON.stringify(result,null,2))
 console.log(JSON.stringify(result,null,2))
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
