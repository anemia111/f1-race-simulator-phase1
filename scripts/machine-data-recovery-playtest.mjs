import { preview } from 'vite'
import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
const out='../../outputs/machine-data-recovery'
await mkdir(out,{recursive:true})
const server=await preview({logLevel:'error',preview:{host:'127.0.0.1',port:0}})
const browser=await chromium.launch({headless:true})
const results=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}})
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://api.openf1.org/**',route=>route.abort())
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
 await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
 await page.getByRole('complementary',{name:'dashboard navigation'}).getByRole('button',{name:'Categories',exact:true}).click()
 await page.getByRole('button',{name:'マシン情報',exact:true}).click()
 for(const [id,count] of [['wec',18],['gt500',3],['gt300',15],['kyojo',1],['indycar',6]]){
  await page.getByLabel('Data category',{exact:true}).selectOption(id)
  const actual=await page.locator('.machine-spec-card').count()
  if(actual!==count)throw new Error(`${id} ${actual} !== ${count}`)
  const text=await page.locator('.machine-info').innerText()
  if(id==='indycar'&&!text.includes('未確認'))throw new Error('Missing unknown-power label')
  await page.screenshot({path:`${out}/${id}.png`})
  results.push({category:id,machineConfigurations:actual})
 }
 for(const id of ['f1-custom','super-formula','f2','f3']){
  await page.getByLabel('Data category',{exact:true}).selectOption(id)
  await page.waitForSelector('.machine-info table tbody tr')
  if(id==='f1-custom'&&!(await page.locator('.machine-info').innerText()).includes('大会指定タイヤ公称重量'))throw new Error('Lost F1 mass qualifier')
  results.push({category:id,machineDataVisible:true})
 }
 await page.getByRole('button',{name:'ドライバー・エントリー',exact:true}).click()
 if(await page.locator('.category-catalog tbody tr').count()!==30)throw new Error('Driver entries regression')
 if(errors.length)throw new Error(errors.join('\n'))
 await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2))
 console.log(JSON.stringify({results,errors},null,2))
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))}
