import {chromium} from 'playwright'
import {preview} from 'vite'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import assert from 'node:assert/strict'
const root=resolve(import.meta.dirname,'..'),artifacts=resolve(process.env.QA_ARTIFACT_DIR||join(tmpdir(),'f1-simulator-qa'))
await mkdir(artifacts,{recursive:true})
const server=await preview({root,logLevel:'error',preview:{host:'127.0.0.1',port:0}})
const browser=await chromium.launch({headless:true}),errors=[],results=[]
try {
 for(const viewport of [{width:1440,height:900},{width:1280,height:720}]){
  const page=await browser.newPage({viewport})
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
  for(const category of ['f1-custom','super-formula','motorsport:kyojo','motorsport:super-gt','motorsport:wec','motorsport:indycar']){
   await page.getByRole('combobox',{name:'Racing series',exact:true}).selectOption(category)
   await page.getByRole('button',{name:'Open setup',exact:true}).click()
   await page.locator('.setup-panel').waitFor()
   const selector=category.startsWith('motorsport:')?page.getByRole('combobox',{name:'Motorsport event',exact:true}):page.getByLabel('Championship round')
   await selector.waitFor()
   await selector.locator('option').first().waitFor({state:'attached'})
   const options=await selector.locator('option').evaluateAll(options=>options.filter(o=>!o.disabled&&o.value).map(o=>({value:o.value,label:o.label})))
   assert.ok(options.length>0,`${category}: empty calendar`)
   for(const [index,option] of options.entries()){
    await selector.selectOption(option.value)
    await page.locator('.setup-header button').click()
    await page.getByLabel('Map elevation',{exact:true}).waitFor()
    const text=await page.locator('.map-elevation-control > span').innerText()
    assert.ok(!/NaN|undefined/.test(text),`${category} ${option.label}: elevation`)
    if(option.value==='f1-16')assert.match(text,/671–697/)
    for(const label of ['2D','1x','5x','3x']){
     const button=page.getByRole('button',{name:`Map elevation ${label}`,exact:true})
     await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true')
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false)
    results.push({category,width:viewport.width,event:option.value,label:option.label,elevation:text})
    if(index===0||['f1-12','f1-16'].includes(option.value))await page.screenshot({path:join(artifacts,`elevation-${category.replace(':','-')}-${option.value.replaceAll(':','-')}-${viewport.width}.png`)})
    await page.getByRole('button',{name:'Open setup',exact:true}).click()
   }
   await page.locator('.setup-header button').click()
   console.log(`Elevation UI: ${category} ${viewport.width}, ${options.length} events`)
  }
  await page.close()
 }
 assert.deepEqual(errors,[])
 await writeFile(join(artifacts,'course-elevation-playtest.json'),JSON.stringify({errors,results},null,2))
 console.log(`Verified ${results.length} category/event/viewport combinations`)
}finally{await browser.close();await new Promise(done=>server.httpServer.close(done))}
