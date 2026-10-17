import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as T from 'three'
import { SuzukaTrack } from '../../src/three/tracks/SuzukaTrack'
import { SuzukaScenery } from '../../src/three/scenery/SuzukaScenery'
import { roadPose, cornerStations } from '../../src/three/tracks/suzukaSurface'

const view = new URLSearchParams(location.search).get('view') ?? 'approach'
const corner = Number(new URLSearchParams(location.search).get('corner'))
const station = cornerStations.find(c=>c.number===corner)?.progress ?? .43579
const crossing = roadPose(station)
const eye = view === 'overview'
  ? crossing.position.clone().addScaledVector(crossing.side, 55).addScaledVector(crossing.tangent, -45).add(new T.Vector3(0, 40, 0))
  : roadPose(view === 'under' ? station : station - .00529).position.add(new T.Vector3(0, 1.4, 0))
const target = view === 'overview' ? crossing.position : roadPose(station + .00621).position.add(new T.Vector3(0, 1.4, 0))
export function Ready() {
  let frames = 0
  useFrame(({gl}) => {
    if (++frames > 10) document.body.dataset.ready = 'true'
    document.body.dataset.triangles = String(gl.info.render.triangles)
    document.body.dataset.calls = String(gl.info.render.calls)
  })
  return null
}
createRoot(document.getElementById('root')!).render(<div style={{width:'100vw',height:'100vh'}}>
  <Canvas shadows camera={{position:eye.toArray(), fov:58, near:.1, far:6000}}
    onCreated={({camera}) => camera.lookAt(target)} gl={{toneMapping:T.ACESFilmicToneMapping,toneMappingExposure:.82}}>
    <color attach="background" args={['#b3c5cc']} />
    <hemisphereLight args={['#cfdfed','#636344',1.15]} />
    <directionalLight position={eye.clone().add(new T.Vector3(-100,160,90))} intensity={3.1} />
    <Suspense fallback={null}><SuzukaTrack wet={false} /><SuzukaScenery quality="medium" /><Ready /></Suspense>
  </Canvas>
  <div style={{position:'absolute',top:12,left:12,padding:12,color:'white',background:'#10212bd9',fontFamily:'sans-serif'}}>
    SUZUKA · {corner ? `T${corner}` : 'CROSSING'} · {view} · geometry verification<br/>Road heights: DEM estimate; dimensions and surrounding terrain: visual estimates
  </div>
</div>)
