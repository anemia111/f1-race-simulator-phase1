import * as THREE from 'three'
import type { TrackDefinition } from '../types'
import { elevationAt, elevationProfileFor } from '../data/courseElevation'
import { projectPointToArcProgress } from '../data/sectorBoundaries'

const presentationAngles = new WeakMap<TrackDefinition, number>()
function presentationAngle(track: TrackDefinition) {
  let angle = presentationAngles.get(track)
  if (angle === undefined) {
    const tangent = createTrackCurve(track).getTangentAt(0)
    angle = Math.atan2(tangent.z, tangent.x)
    presentationAngles.set(track, angle)
  }
  return angle
}

/** Furniture must undergo the same rigid rotation as the rendered road. */
export function presentationPoint(track: TrackDefinition, point: [number, number, number]): [number, number, number] {
  const profile=displayElevationFor(track)
  const progress=projectPointToArcProgress(track.centerline,point)
  const height=profile?relativeRoadHeight(track,profile,progress):0
  return new THREE.Vector3(point[0],point[1]+height,point[2]).applyAxisAngle(new THREE.Vector3(0,1,0),presentationAngle(track)).toArray()
}

export function createTrackCurve(track: TrackDefinition) {
  return new THREE.CatmullRomCurve3(
    track.centerline.map((point) => new THREE.Vector3(...point)),
    true,
    'catmullrom',
    0.48,
  )
}

const displayElevations = new WeakMap<TrackDefinition, ReturnType<typeof elevationProfileFor>>()
function displayElevationFor(track: TrackDefinition) {
  if (displayElevations.has(track)) return displayElevations.get(track)!
  const profile=elevationProfileFor(track.id,track.centerline.map(([x,,z])=>[x,-z]),track.lengthKm*1000)
  displayElevations.set(track,profile);return profile
}
function relativeRoadHeight(track:TrackDefinition,profile:NonNullable<ReturnType<typeof elevationProfileFor>>,progress:number) {
  const planarLength=createTrackCurve(track).getLength()
  return (elevationAt(profile,progress).elevationM-Math.min(...profile.elevationsM))*planarLength/(track.lengthKm*1000)
}
/** Display-only height: domain geometry, sector distances and planar stationing
 * remain unchanged. Sampling uses the original planar arc progress exactly. */
class ElevatedPresentationCurve extends THREE.CatmullRomCurve3 {
  private flat:THREE.CatmullRomCurve3
  private height:(p:number)=>number
  constructor(flat:THREE.CatmullRomCurve3,height:(p:number)=>number) {
    super(flat.points.map(p=>p.clone()),true,'catmullrom',0.48)
    this.flat=flat;this.height=height
  }
  override getPointAt(u:number,target=new THREE.Vector3()) {
    this.flat.getPointAt(u,target);target.y+=this.height(u);return target
  }
  override getTangentAt(u:number,target=new THREE.Vector3()) {
    this.flat.getTangentAt(u,target)
    const a=this.height((u+1-0.00001)%1),b=this.height((u+0.00001)%1)
    target.y+=(b-a)/(0.00002*this.flat.getLength())
    return target.normalize()
  }
}
/** Rotate the display alone: the control-line tangent runs left to right. */
export function createPresentationTrackCurve(track: TrackDefinition) {
  const flat = createTrackCurve(track)
  const angle = presentationAngle(track),axis = new THREE.Vector3(0, 1, 0)
  for (const point of flat.points) point.applyAxisAngle(axis, angle)
  flat.updateArcLengths()
  const profile=displayElevationFor(track)
  if (!profile) return flat
  const scale=flat.getLength()/(track.lengthKm*1000),datum=Math.min(...profile.elevationsM)
  return new ElevatedPresentationCurve(flat,p=>(elevationAt(profile,p).elevationM-datum)*scale)
}

export function poseOnTrack(
  curve: THREE.CatmullRomCurve3,
  progress: number,
  laneOffset = 0,
) {
  const wrappedProgress = ((progress % 1) + 1) % 1
  const position = curve.getPointAt(wrappedProgress)
  const tangent = curve.getTangentAt(wrappedProgress).normalize()
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()

  return {
    position: position.add(normal.clone().multiplyScalar(laneOffset)),
    tangent,
    normal,
  }
}

export function createTrackRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments = 192,
) {
  const vertices: number[] = []
  const indices: number[] = []

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments
    const center = curve.getPointAt(progress)
    const tangent = curve.getTangentAt(progress).normalize()
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
    const left = center.clone().add(normal.clone().multiplyScalar(width / 2))
    const right = center.clone().add(normal.clone().multiplyScalar(-width / 2))

    vertices.push(left.x, left.y + 0.02, left.z)
    vertices.push(right.x, right.y + 0.02, right.z)
  }

  for (let index = 0; index < segments; index += 1) {
    const a = index * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3

    indices.push(a, c, b, b, c, d)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return geometry
}

export function edgePoints(
  curve: THREE.CatmullRomCurve3,
  width: number,
  side: -1 | 1,
  segments = 192,
) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const progress = index / segments
    const center = curve.getPointAt(progress)
    const tangent = curve.getTangentAt(progress).normalize()
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()

    return center.add(normal.multiplyScalar((width / 2) * side)).add(new THREE.Vector3(0,0.06,0))
  })
}
