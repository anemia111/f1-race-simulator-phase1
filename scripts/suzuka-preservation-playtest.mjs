import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const root=resolve(process.env.PRESERVATION_SOURCE ?? '.')
const out=resolve(process.env.PRESERVATION_QA_DIR ?? '../../outputs/suzuka-preservation-after')
await mkdir(out,{recursive:true})
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:0}})
await server.listen()
const browser=await chromium.launch({headless:false,args:['--use-angle=d3d11','--window-position=-2400,-2400',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']})
const errors=[],results=[]
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('https://api.openf1.org/**',r=>r.abort())
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
  await page.waitForSelector('.leaderboard-rows li')
  for(const series of ['f1-custom','super-formula']) {
    await page.getByLabel('Racing series',{exact:true}).selectOption(series)
    if(await page.getByRole('button',{name:'Pause simulation',exact:true}).count()) await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
    await page.locator('.sidebar-settings').click()
    await page.getByPlaceholder('simulation seed').fill('suzuka-preservation-20261017')
    const options=await page.getByLabel('Championship round').locator('option').evaluateAll(items=>items.filter(i=>!i.disabled).map(i=>({value:i.value,label:i.textContent})))
    await page.getByLabel('close setup').click()
    for(let i=0;i<options.length;i++) {
      const option=options[i]
      await page.locator('.sidebar-settings').click()
      await page.getByLabel('Championship round').selectOption(option.value)
      await page.getByLabel('close setup').click()
      const pause=page.getByRole('button',{name:'Pause simulation',exact:true})
      if(await pause.count()) await pause.click()
      await page.waitForTimeout(1200)
      const canvas=page.locator('canvas')
      await canvas.waitFor()
      const screenshot=await canvas.screenshot({path:resolve(out,`${series}-${i}.png`)})
      const title=await page.locator('.broadcast-brand').innerText()
      results.push({series,round:option.value,label:option.label,title,sha256:createHash('sha256').update(screenshot).digest('hex'),canvas:await canvas.boundingBox()})
    }
  }
  if(errors.length)throw new Error(errors.join('\n'))
} finally {
  await writeFile(resolve(out,'results.json'),JSON.stringify({root,results,errors},null,2))
  await browser.close();await server.close()
}
