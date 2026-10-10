import { chromium } from 'playwright'
import { preview } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const root=resolve(import.meta.dirname,'..'), artifacts=resolve(process.env.QA_ARTIFACT_DIR||join(tmpdir(),'f1-simulator-qa'))
await mkdir(artifacts,{recursive:true})
const server=process.env.QA_BASE_URL ? null : await preview({root,logLevel:'error',preview:{host:'127.0.0.1',port:0}})
const url=process.env.QA_BASE_URL||`http://127.0.0.1:${server.httpServer.address().port}/`
const browser=await chromium.launch({headless:true}), errors=[]
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await page.getByRole('combobox',{name:'Racing series',exact:true}).selectOption('f1-custom')
 await page.getByRole('button',{name:'1x',exact:true}).click()
 await page.getByRole('button',{name:'Open setup',exact:true}).click()
 await page.getByPlaceholder('simulation seed').fill('sc-best-lap-48')
 await page.getByLabel('close setup',{exact:true}).click()
 assert.equal(await page.locator('.track-map-status .flag-sc').count(),1, 'Seed must produce an SC formation')
 await page.getByLabel('Skip formation lap',{exact:true}).click()
 await page.getByLabel('Skip formation lap',{exact:true}).waitFor({state:'hidden',timeout:60000})
 const resume=page.getByRole('button',{name:'Resume simulation',exact:true})
 if(await resume.isVisible())await resume.click()
 await page.waitForTimeout(5000)
 const openingBest=await page.locator('.footer-best strong').innerText()
 assert.ok(!/\d/.test(openingBest),`Release crossing must not record PB: ${openingBest}`)
 await page.screenshot({path:join(artifacts,'f1-sc-start-no-false-best.png'),fullPage:true})
 await page.getByRole('button',{name:'60x',exact:true}).click()
 await page.waitForFunction(()=>/\d/.test(document.querySelector('.footer-best strong')?.textContent||''),null,{timeout:60000})
 await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
 const firstBest=await page.locator('.footer-best strong').innerText(), parts=firstBest.split(':')
 const seconds=Number(parts[0])*60+Number(parts[1])
 assert.ok(seconds>30,`A real complete lap is required: ${firstBest}`)
 await page.screenshot({path:join(artifacts,'f1-sc-first-complete-lap.png'),fullPage:true})
 assert.deepEqual(errors,[])
 const report={url,seed:'sc-best-lap-48',openingBest,firstBest,seconds,errors}
 await writeFile(join(artifacts,'start-lap-timing-browser.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify(report,null,2))
} finally {await browser.close();await server?.close()}
