import {chromium} from 'playwright';
import {preview} from 'vite';
import assert from 'node:assert/strict';
const server=await preview({preview:{host:'127.0.0.1',port:0},logLevel:'error'});
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
 for(const id of ['f1-custom','super-formula','motorsport:kyojo','motorsport:super-gt','motorsport:wec','motorsport:indycar']){
  await page.getByRole('combobox',{name:'Racing series',exact:true}).selectOption(id);
  if(id.startsWith('motorsport:')){
   await page.getByRole('button',{name:'Engineer',exact:true}).click();
   await page.locator('.driver-rating-evidence').waitFor();
   assert.match(await page.locator('.driver-rating-evidence').innerText(),/全カテゴリー共通/);
   if(id==='motorsport:kyojo'){
    const select=page.locator('.engineer-heading select');
    const options=await select.locator('option').evaluateAll(items=>items.map(o=>({value:o.value,label:o.textContent})));
    for(const [name,rating] of [['Riona Tomishita',70],['Joanne Ciconte',69],['Kokoro Sato',67]]){
     const option=options.find(o=>o.label.includes(name));
     assert.ok(option,`KYOJO entry ${name}`);
     await select.selectOption(option.value);
     assert.ok((await page.locator('.driver-rating-evidence').innerText()).includes(`${rating} / 100`));
    }
    await page.locator('.driver-rating-evidence').scrollIntoViewIfNeeded();
    await page.screenshot({path:'../../outputs/driver-rating-kyojo.png'});
   }
   console.log(id+': rating visible in Engineer');
   await page.getByRole('button',{name:'Close race engineer',exact:true}).click();
   continue;
  }
  await page.getByRole('button',{name:'Open setup',exact:true}).click();
  const panel=page.locator('.setup-panel');
  await panel.locator('.driver-rating-evidence').waitFor();
  assert.match(await panel.locator('.driver-rating-evidence').innerText(),/全カテゴリー共通/);
  const select=panel.locator('.setup-section').filter({hasText:'Driver tune'}).locator('select');
  if(id==='f1-custom'){
   await select.selectOption('yuki_nakayama');
   assert.match(await panel.locator('.driver-rating-evidence').innerText(),/120 \/ 120/);
   await select.selectOption('max_verstappen');
   assert.match(await panel.locator('.driver-rating-evidence').innerText(),/98 \/ 100/);
   await panel.locator('.driver-rating-evidence').scrollIntoViewIfNeeded();
   await page.screenshot({path:'../../outputs/driver-rating-f1.png'});
  }
  if(id==='super-formula'){
   await select.selectOption('juju_noda');
   assert.match(await panel.locator('.driver-rating-evidence').innerText(),/67 \/ 100/);
   await panel.locator('.driver-rating-evidence').scrollIntoViewIfNeeded();
   await page.screenshot({path:'../../outputs/driver-rating-sf.png'});
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(id+': rating visible');
  await panel.locator('.setup-header button').click();
 }
 assert.deepEqual(errors,[]);
} finally {await browser.close();await new Promise(r=>server.httpServer.close(r));}

