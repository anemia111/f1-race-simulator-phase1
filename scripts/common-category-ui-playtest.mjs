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
 for(const viewport of [{width:1440,height:900},{width:1280,height:720}]) {
  let setupReference, freeReference
  for(const id of ['f1-custom','super-formula','motorsport:kyojo','motorsport:super-gt','motorsport:wec','motorsport:indycar']) {
   const context=await browser.newContext({viewport}), page=await context.newPage()
   page.on('pageerror',error=>errors.push(`${id}: ${error.message}`))
   await page.goto(url,{waitUntil:'domcontentloaded'})
   await page.getByRole('combobox',{name:'Racing series',exact:true}).selectOption(id)
   await page.locator('.leaderboard-tire-age').first().waitFor()
   const ages=await page.locator('.leaderboard-tire-age').allInnerTexts()
   assert.equal(ages.length,await page.locator('.leaderboard-rows > li').count(),`${id}: tyre age on every row`)
   assert.ok(ages.every(age=>/^\d+L$/.test(age)),`${id}: completed set laps beside tyre life`)
   const badgeColors=await page.locator('.leaderboard-tire-life').first().evaluate(el=>{const s=getComputedStyle(el);return {text:s.color,background:s.backgroundColor}})
   assert.notEqual(badgeColors.background,'rgba(0, 0, 0, 0)',`${id}: tyre life has a visible background`)
   assert.notEqual(badgeColors.text,badgeColors.background,`${id}: tyre life contrasts with its background`)
   if(viewport.width===1440)await page.screenshot({path:join(artifacts,`tyre-age-${id.replace(':','-')}.png`)})
   await page.getByRole('button',{name:'Open setup',exact:true}).click()
   const setup=page.locator('.setup-panel')
   await setup.waitFor()
   assert.equal(await setup.locator('.motorsport-sources').count(),0)
   assert.equal(await setup.getByRole('button',{name:'出典・推定条件',exact:true}).count(),0)
   const setupStyle=await setup.evaluate(el=>{const style=x=>{const s=getComputedStyle(x);return [s.fontSize,s.color,s.height,s.backgroundColor]};return {header:style(el.querySelector('.setup-header strong')),label:style(el.querySelector('.field-block span')),field:style(el.querySelector('.field-block select'))}})
   if(!setupReference)setupReference=setupStyle
   assert.deepEqual(setupStyle,setupReference,`${id} setup must match F1 typography and controls`)
   await page.screenshot({path:join(artifacts,`common-settings-${id.replace(':','-')}-${viewport.width}.png`)})
   await setup.locator('.setup-header button').click()
   await page.getByRole('button',{name:'FREE',exact:true}).click()
   const builder=page.getByRole('dialog',{name:'Free Mode session builder',exact:true})
   await builder.waitFor()
   assert.equal(await builder.locator('.free-mode-search label').count(),2)
   for(const name of ['Add multiple','Category grid','Drivers','Cars','Equal cars','Clear','Reset'])assert.equal(await builder.locator('.free-mode-tools').getByRole('button',{name,exact:true}).count(),1,`${id} ${name}`)
   for(const name of ['Rename','Duplicate','Delete','Export JSON','Import JSON'])assert.equal(await builder.locator('.free-mode-presets').getByRole('button',{name,exact:true}).count(),1)
   const freeStyle=await builder.evaluate(el=>{const style=x=>{const s=getComputedStyle(x);return [s.fontSize,s.height,s.color]};return {title:style(el.querySelector('h1')),field:style(el.querySelector('.free-mode-settings select')),row:style(el.querySelector('.free-mode-entry-row')),footerVisible:el.querySelector('.free-mode-footer').getBoundingClientRect().bottom<=innerHeight,scroll:document.documentElement.scrollWidth<=innerWidth}})
   if(!freeReference)freeReference=freeStyle
   assert.deepEqual(freeStyle,freeReference,`${id} Free Mode must match F1 dimensions`)
   await page.screenshot({path:join(artifacts,`common-free-${id.replace(':','-')}-${viewport.width}.png`)})
   if(id.startsWith('motorsport:')) {
    const rows=builder.locator('.free-mode-entry-row'), before=await rows.count()
    await builder.getByLabel('Edit crew for grid 1',{exact:true}).click()
    const crew=builder.locator('.free-mode-crew').first(), label=await crew.locator('summary').textContent()
    await crew.getByRole('button',{name:'Add crew for grid 1',exact:true}).click()
    assert.notEqual(await crew.locator('summary').textContent(),label)
    await crew.getByRole('button',{name:'Remove crew for grid 1',exact:true}).click()
    assert.equal(await crew.locator('summary').textContent(),label)
    await crew.locator('summary').click()
    await builder.getByLabel('Number of cars to add',{exact:true}).fill('2')
    await builder.getByRole('button',{name:'Add multiple',exact:true}).click()
    assert.equal(await rows.count(),before+2)
    await builder.getByRole('button',{name:'Clear',exact:true}).click()
    assert.equal(await rows.count(),0)
    await builder.getByRole('button',{name:'Add multiple',exact:true}).click()
    assert.equal(await rows.count(),2)
    assert.equal(await builder.getByRole('button',{name:'Start session',exact:true}).isEnabled(),true)
    const presets=builder.locator('.free-mode-presets')
    await builder.getByLabel('Free Mode preset name',{exact:true}).fill('Common QA')
    await presets.getByRole('button',{name:'Save preset',exact:true}).click()
    await builder.getByLabel('Free Mode preset name',{exact:true}).fill('Renamed QA')
    await presets.getByRole('button',{name:'Rename',exact:true}).click()
    assert.equal(await builder.getByLabel('Saved Free Mode preset',{exact:true}).inputValue(),'Renamed QA')
    await presets.getByRole('button',{name:'Duplicate',exact:true}).click()
    assert.equal(await builder.getByLabel('Saved Free Mode preset',{exact:true}).inputValue(),'Renamed QA copy')
    await presets.getByRole('button',{name:'Delete',exact:true}).click()
    assert.equal(await builder.getByLabel('Saved Free Mode preset',{exact:true}).locator('option').count(),2)
    await builder.getByLabel('Saved Free Mode preset',{exact:true}).selectOption('Renamed QA')
    assert.equal(await rows.count(),2)

   }
   reports.push({id,viewport,setupStyle,freeStyle})
   await context.close()
   console.log(`[common-ui] ${id} ${viewport.width}: passed`)
  }
 }
 assert.deepEqual(errors,[])
 await writeFile(join(artifacts,'common-category-ui.json'),JSON.stringify({reports,errors},null,2))
} finally {await browser.close();await server?.close()}
