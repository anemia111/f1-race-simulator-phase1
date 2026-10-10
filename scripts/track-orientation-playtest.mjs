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
const browser=await chromium.launch({headless:true}), reports=[], errors=[]
try {
 for(const id of ['f1-custom','super-formula','motorsport:kyojo','motorsport:super-gt','motorsport:wec','motorsport:indycar']) {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  page.on('pageerror',error=>errors.push(`${id}: ${error.message}`))
  await page.goto(url,{waitUntil:'domcontentloaded'})
  await page.getByRole('combobox',{name:'Racing series',exact:true}).selectOption(id)
  const pause=page.getByRole('button',{name:'Pause simulation',exact:true})
  if(await pause.isVisible()) await pause.click()
  await page.locator('.race-canvas canvas').waitFor({state:'visible',timeout:60000})
  // Allow the overview camera to settle after a category/course change.
  await page.waitForTimeout(2500)
  const filename=`horizontal-straight-${id.replace(':','-')}.png`
  await page.screenshot({path:join(artifacts,filename),fullPage:true})
  const canvas=page.getByRole('img',{name:'Interactive circuit map',exact:true})
  // Canvas has no implicit image role; use the explicit accessible label.
  const map=await canvas.count()?canvas:page.getByLabel('Interactive circuit map',{exact:true})
  const initial=await map.screenshot()
  await map.focus()
  await page.keyboard.press('+')
  await page.waitForTimeout(600)
  const zoomed=await map.screenshot()
  assert.ok(!initial.equals(zoomed),`${id}: keyboard zoom must change the map`)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(600)
  const rotated=await map.screenshot()
  assert.ok(!zoomed.equals(rotated),`${id}: keyboard rotation must change the map`)
  const box=await map.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2
  await page.mouse.move(x,y)
  await page.mouse.wheel(0,-350)
  await page.waitForTimeout(600)
  const wheeled=await map.screenshot()
  assert.ok(!rotated.equals(wheeled),`${id}: wheel zoom must change the map`)
  await page.mouse.move(x,y)
  await page.mouse.down()
  await page.mouse.move(x+100,y+35,{steps:12})
  await page.mouse.up()
  await page.waitForTimeout(600)
  const dragged=await map.screenshot()
  assert.ok(!wheeled.equals(dragged),`${id}: drag rotation must change the map`)
  await page.getByTitle('overview camera',{exact:true}).click()
  await page.waitForTimeout(1500)
  const reset=await map.screenshot()
  assert.ok(!dragged.equals(reset),`${id}: overview button must reset the map`)
  await page.screenshot({path:join(artifacts,filename),fullPage:true})
  const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(viewport.scroll<=viewport.width+1)
  reports.push({id,screenshot:filename,viewport,keyboardZoom:true,keyboardRotation:true,wheelZoom:true,dragRotation:true,overviewReset:true})
  await context.close()
 }
 assert.deepEqual(errors,[])
 const report={url,reports,errors}
 await writeFile(join(artifacts,'track-orientation-browser.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify(report,null,2))
} finally {await browser.close();await server?.close()}
