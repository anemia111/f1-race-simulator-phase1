import { chromium } from 'playwright'
import { preview } from 'vite'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const remote=process.env.SF_CALENDAR_APP_URL
const server=remote?null:await preview({root:fileURLToPath(new URL('..',import.meta.url)),logLevel:'error',preview:{host:'127.0.0.1',port:0}})
const url=remote??`http://127.0.0.1:${server.httpServer.address().port}/`
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}}), errors=[], reports=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://api.openf1.org/**',route=>route.abort())
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await page.getByLabel('Racing series',{exact:true}).selectOption('super-formula')
 await page.waitForFunction(()=>document.querySelectorAll('.leaderboard-rows > li').length===24)
 for(const [event,laps] of [['sf-01',37],['sf-02',37],['sf-03-replacement',25],['sf-04',31],['sf-05',31],['sf-06',41],['sf-07',41],['sf-08',51],['sf-09',41],['sf-10',41],['sf-11',31],['sf-12',31]]) {
  await page.locator('.broadcast-sidebar .sidebar-settings').click()
  await page.waitForSelector('.setup-panel')
  console.log(`[sf-calendar] selecting ${event}`)
  await page.getByLabel('Championship round').selectOption(event)
  const sessions=await page.getByLabel('Weekend session').locator('option').evaluateAll(options=>options.map(option=>option.value))
  assert.ok(sessions.includes('race'),`${event} has no decision race`)
  await page.getByLabel('Weekend session').selectOption('race')
  // Wet SC starts/aborted starts legitimately subtract extra formation laps.
  // This calendar test checks scheduled distance under a single dry formation.
  await page.getByLabel('Seed',{exact:true}).fill('sf-calendar-dry-0')
  await page.waitForFunction(laps=>new RegExp(`\\d+\\s*/\\s*${laps}`).test(document.querySelector('.broadcast-session-core')?.textContent??''),laps).catch(async error=>{
   console.log(JSON.stringify({event,core:await page.locator('.broadcast-session-core').textContent(),selectedEvent:await page.getByLabel('Championship round').inputValue(),session:await page.getByLabel('Weekend session').inputValue(),errors}))
   throw error
  })
  await page.waitForFunction(()=>document.querySelector('.broadcast-session-core time')?.textContent==='00:00:00')
  await page.getByTitle('Close setup',{exact:true}).click()
  await page.getByRole('button',{name:'60x',exact:true}).click()
  const resume=page.getByRole('button',{name:'Resume simulation',exact:true})
  if(await resume.isVisible())await resume.click()
  const skip=page.getByRole('button',{name:'Skip formation lap',exact:true})
  if(await skip.isVisible())await skip.click()
  await page.waitForFunction(()=>{const time=document.querySelector('.broadcast-session-core time')?.textContent;return time&&time!=='00:00:00'})
  await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
  const progress=await page.locator('.broadcast-session-core').innerText()
  reports.push({event,laps,sessions,progress,started:true})
  console.log(`[sf-calendar] ${event}: Race / ${laps} laps started`)
 }
 assert.deepEqual(errors,[])
 const report={url,release:await page.evaluate(()=>document.documentElement.dataset.releaseId),reports,errors}
 if(process.env.SF_CALENDAR_REPORT)await writeFile(process.env.SF_CALENDAR_REPORT,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report,null,2))
}finally{await browser.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve))}
