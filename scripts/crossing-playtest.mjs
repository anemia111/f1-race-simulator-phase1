import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const out = resolve(process.env.CROSSING_QA_DIR ?? '../../outputs/suzuka-crossing-before')
await mkdir(out,{recursive:true})
const server = await createServer({root:resolve(process.env.CROSSING_SOURCE ?? '.'),logLevel:'error',server:{host:'127.0.0.1',port:0}})
await server.listen()
const browser = await chromium.launch({headless:false,args:['--use-angle=d3d11','--window-position=-2400,-2400',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']})
const errors=[], measurements=[]
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  page.on('pageerror',e=>errors.push(e.message))
  const views=[{view:'overview'},{view:'approach'},{view:'under'},
    ...[1,3,9,11,14,16].map(corner=>({view:'overview',corner}))]
  for(const {view,corner} of views) {
    const name=corner?`corner-${corner}`:view
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/qa/suzuka-crossing.html?view=${view}${corner?`&corner=${corner}`:''}`)
    await page.waitForSelector('body[data-ready="true"]',{timeout:60000})
    const metrics=await page.evaluate(async()=>{
      const gaps=[];let previous=performance.now();const start=previous
      await new Promise(resolve=>{function frame(now){gaps.push(now-previous);previous=now;if(now-start>=1200)resolve();else requestAnimationFrame(frame)}requestAnimationFrame(frame)})
      const gl=document.querySelector('canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info')
      return {triangles:Number(document.body.dataset.triangles),calls:Number(document.body.dataset.calls),
        frameGapP95:gaps.toSorted((a,b)=>a-b)[Math.floor(gaps.length*.95)],frames:gaps.length,
        renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}
    })
    measurements.push({name,...metrics})
    await page.screenshot({path:resolve(out,`${name}.png`)})
  }
  await writeFile(resolve(out,'results.json'),JSON.stringify({errors,measurements},null,2))
  if(errors.length)throw new Error(errors.join('\n'))
} finally {await browser.close();await server.close()}
