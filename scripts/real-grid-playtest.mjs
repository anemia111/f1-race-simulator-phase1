import { preview } from 'vite'
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const server = await preview({ logLevel:'error', preview:{host:'127.0.0.1',port:0} })
const browser = await chromium.launch({headless:true})
try {
 const page = await browser.newPage({viewport:{width:1920,height:1080}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://api.openf1.org/**', route=>route.abort())
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
 await page.waitForSelector('.leaderboard-rows li')
 await page.getByRole('button',{name:'Pause simulation',exact:true}).click()
 const rows=await page.locator('.leaderboard-rows li').allTextContents()
 for(const code of ['LEC','HAM','HAD','LIN','STR','OCO']) if(!rows.some(row=>row.includes(code))) throw new Error('Missing '+code)
 if(rows.length!==22||rows.some(row=>/\b(NAK|TSU)\b/.test(row))) throw new Error('Wrong grid')
 await page.screenshot({path:'../../outputs/real-grid-2026.png',fullPage:true})
 await writeFile('../../outputs/real-grid-browser.json',JSON.stringify({rows,count:rows.length,errors},null,2))
 if(errors.length) throw new Error(errors.join('\n'))
 console.log('Actual browser: 22 official drivers, no NAK/TSU in race grid, no page errors.')
} finally {await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))}
