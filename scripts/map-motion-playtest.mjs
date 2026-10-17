import {createServer} from 'node:http'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {chromium} from 'playwright'
const out=resolve(process.env.MAP_QA_DIR??'../../outputs/map-motion-qa');await mkdir(out,{recursive:true})
const roots={before:resolve('../../work/map-motion-before'),after:resolve('dist')};let serving='before'
const mimes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname,root=roots[serving],file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+sep))throw Error();res.writeHead(200,{'Content-Type':mimes[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file))}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:false,args:['--use-angle=d3d11','--window-position=-2400,-2400']})
const results=[],errors=[]
try{
 for(const version of ['before','after']) for(const [category,camera] of [['f1-custom','overview'],['f1-custom','chase'],['wec','overview'],['wec','chase'],...(version==='after'?[['super-gt','overview'],['kyojo','overview'],['indycar','overview']]:[])]){
  if(process.env.MAP_QA_ONLY_F1==='1' && category!=='f1-custom') continue
  serving=version
  const context=await browser.newContext({viewport:{width:1280,height:900},...(version==='after'&&category==='f1-custom'&&camera==='overview'?{recordVideo:{dir:out,size:{width:1280,height:900}}}:{})})
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://api.openf1.org/**',route=>route.abort())
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForSelector('.leaderboard-rows li')
  if(category!=='f1-custom'){
   await page.getByLabel('Racing series',{exact:true}).selectOption(`motorsport:${category}`)
   await page.getByRole('button',{name:'Resume simulation',exact:true}).waitFor()
  }
  if(category==='f1-custom') {
   await page.locator('.sidebar-settings').click()
   const rounds=page.getByLabel('Championship round')
   const suzuka=await rounds.locator('option').evaluateAll(options=>options.find(option=>/suzuka/i.test(option.textContent))?.value)
   await rounds.selectOption(suzuka)
   await page.getByPlaceholder('simulation seed').fill('stutter-suzuka-fixed-20261017')
   await page.getByLabel('close setup').click()
   await page.locator('.leaderboard-rows li').filter({hasText:'LEC'}).getByRole('button').click()
  }
  const skip=page.getByRole('button',{name:'Skip formation lap',exact:true});if(await skip.count())await skip.click()
  const resume=page.getByRole('button',{name:'Resume simulation',exact:true});if(await resume.count())await resume.click()
  await page.getByRole('button',{name:`${camera} camera`,exact:true}).click()
  await page.waitForFunction(()=>window.__mapMotion?.moving && !document.querySelector('.start-signal') && (document.querySelector('.broadcast-session-core time')?.textContent??'00:00:00').trim()!=='00:00:00',{}, {timeout:60000})
  await page.waitForTimeout(1200)
  const data=await page.evaluate(async()=>{
   const samples=[];let previous=performance.now()
   await new Promise(resolve=>{const start=performance.now();function tick(){const now=performance.now();if(window.__mapMotion)samples.push({...window.__mapMotion,at:now,gap:now-previous});previous=now;if(now-start>=6000)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)})
   const gl=document.querySelector('canvas')?.getContext('webgl2')??document.querySelector('canvas')?.getContext('webgl');const debug=gl?.getExtension('WEBGL_debug_renderer_info')
   return {samples,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown'}
  })
  const pairs=data.samples.slice(1).map((b,i)=>[data.samples[i],b]).filter(([a,b])=>a.moving&&b.moving&&a.driverId===b.driverId)
  if(pairs.length<200) { await page.screenshot({path:resolve(out,'invalid-motion.png')}); await writeFile(resolve(out,'invalid-motion.json'),JSON.stringify({samples:data.samples.slice(-30),clock:await page.locator('.broadcast-session-core time').innerText()},null,2)); }
  if(pairs.length<200) throw new Error('Insufficient moving frames for '+category+' '+camera)
  const stopped=pairs.filter(([a,b])=>Math.hypot(b.x-a.x,b.z-a.z)<1e-6).length
  const gaps=data.samples.map(s=>s.gap).sort((a,b)=>a-b)
  const result={version,category,camera,frames:pairs.length,stoppedFrames:stopped,stoppedPercent:pairs.length?100*stopped/pairs.length:null,frameGapP95:gaps[Math.floor(gaps.length*.95)],renderer:data.renderer}
  results.push(result);console.log(JSON.stringify(result))
  await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors},null,2))
  if(version==='after'&&category==='f1-custom'&&camera==='overview')await page.screenshot({path:resolve(out,'smooth-map.png')})
  if(version==='after'){
   await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
   await page.waitForTimeout(300)
   const paused=await page.evaluate(()=>({...window.__mapMotion}))
   await page.waitForTimeout(300)
   const later=await page.evaluate(()=>({...window.__mapMotion}))
   if(Math.hypot(later.x-paused.x,later.z-paused.z)>1e-6)throw new Error('Pause drift '+category)
  }
  await context.close()
 }
 if(errors.length)throw new Error(errors.join('\n'))
}finally{await browser.close();await new Promise(r=>server.close(r))}
