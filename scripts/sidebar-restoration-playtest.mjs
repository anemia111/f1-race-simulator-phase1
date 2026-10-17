import { preview } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const out = '../../outputs/sidebar-restoration'
await mkdir(out,{recursive:true})
const server=await preview({logLevel:'error',preview:{host:'127.0.0.1',port:0}})
const browser=await chromium.launch({headless:true})
const results=[],errors=[]
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}})
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://api.openf1.org/**',route=>route.abort())
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
 await page.waitForSelector('.leaderboard-rows li')
 await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
 const nav=page.getByRole('complementary',{name:'dashboard navigation'})
 for(const title of ['Telemetry','Track','Tyres','Messages','Drivers','Season','Data','Map']) {
  await nav.getByRole('button',{name:title,exact:true}).click()
  if(title!=='Data'&&title!=='Map') await page.waitForSelector('.race-data-table, .race-data-empty')
  if(title==='Telemetry') {
   if(await page.getByRole('table',{name:'All drivers telemetry'}).locator('tbody tr').count()!==22) throw new Error('Missing F1 telemetry')
   await page.screenshot({path:`${out}/telemetry.png`})
  }
  results.push({view:title,opened:true})
 }
 await nav.getByRole('button',{name:'Categories',exact:true}).click()
 for(const [id,count] of [['f1-custom',22],['super-formula',24],['f2',22],['f3',30],['gt500',14],['gt300',29],['wec',35],['kyojo',20],['indycar',33]]) {
  await page.getByLabel('Data category',{exact:true}).selectOption(id)
  const actual=await page.locator('.category-catalog tbody tr').count()
  if(actual!==count)throw new Error(`${id}: ${actual} !== ${count}`)
  results.push({category:id,count:actual})
  if(['wec','gt500','kyojo','indycar'].includes(id))await page.screenshot({path:`${out}/${id}.png`})
 }
 await page.getByLabel('Search category drivers and teams').fill('Alex Palou')
 if(await page.locator('.category-catalog tbody tr').count()!==1)throw new Error('Search failed')
 await page.getByLabel('Racing series',{exact:true}).selectOption('super-formula')
 await nav.getByRole('button',{name:'Telemetry',exact:true}).click()
 await page.waitForFunction(()=>document.querySelectorAll('.race-data-table tbody tr').length===24)
 if((await page.locator('.race-data-table tbody').innerText()).includes('SOC'))throw new Error('SF fabricated battery')
 await nav.getByRole('button',{name:'Tyres',exact:true}).click()
 if(!(await page.locator('.race-data-table tbody').innerText()).includes('CTRL'))throw new Error('Missing SF control tyre')
 await page.screenshot({path:`${out}/sf-tyres.png`})
 await page.setViewportSize({width:1280,height:720})
 for(const title of ['Telemetry','Categories','Map','Settings']) {
  const button=nav.getByRole('button',{name:title,exact:true})
  await button.scrollIntoViewIfNeeded()
  const box=await button.boundingBox()
  if(!box||box.y<0||box.y+box.height>720)throw new Error('Unreachable short-screen '+title)
 }
 if(errors.length)throw new Error(errors.join('\n'))
 console.log(JSON.stringify({results,searchPassed:true,superFormulaPassed:true,shortScreenPassed:true,errors},null,2))
 await writeFile(`${out}/results.json`,JSON.stringify({results,searchPassed:true,superFormulaPassed:true,shortScreenPassed:true,errors},null,2))
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))}
