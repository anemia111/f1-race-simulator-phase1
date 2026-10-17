import { preview } from 'vite'
import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const out=resolve('../../outputs/suzuka-camera-qa');await mkdir(out,{recursive:true})
const server=await preview({logLevel:'error',preview:{host:'127.0.0.1',port:0}})
const browser=await chromium.launch({headless:false,args:['--use-angle=d3d11','--window-position=-2400,-2400',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']})
const errors=[],results=[]
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://api.openf1.org/**',r=>r.abort())
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
  await page.waitForSelector('.leaderboard-rows li')
  await page.locator('.sidebar-settings').click()
  const rounds=page.getByLabel('Championship round')
  const suzuka=await rounds.locator('option').evaluateAll(items=>items.find(i=>/suzuka/i.test(i.textContent)).value)
  await rounds.selectOption(suzuka)
  await page.getByLabel('close setup').click()
  await page.getByRole('button',{name:'Cinematic',exact:true}).click()
  await page.waitForFunction(()=>window.__cinematicMetrics?.triangles>0,{}, {timeout:60000})
  for(const mode of ['tv','trackside','chase','onboard','helicopter','free']) {
    await page.getByLabel('Cinematic camera').selectOption(mode)
    await page.waitForTimeout(1200)
    await page.screenshot({path:resolve(out,`${mode}.png`)})
    results.push({mode,rendered:await page.locator('canvas').isVisible()})
  }
  for(const quality of ['high','medium','low']) {
    await page.getByLabel('Cinematic quality').selectOption(quality)
    await page.waitForTimeout(1000)
    results.push({quality,rendered:await page.locator('canvas').isVisible()})
  }
  await page.getByRole('button',{name:'Overview Map',exact:true}).click()
  results.push({returnToOverview:await page.getByRole('button',{name:'Overview Map',exact:true}).getAttribute('aria-pressed')==='true'})
  if(errors.length || results.some(r=>r.rendered===false))throw new Error(JSON.stringify({errors,results}))
}finally{
  await writeFile(resolve(out,'results.json'),JSON.stringify({errors,results,note:'Functional camera and quality checks; concurrent UI checks, not an FPS benchmark.'},null,2))
  await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))
}
