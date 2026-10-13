import { FreeModeHeader, FreeModeSearch } from '../components/SessionChrome'
import { createSeededRandom } from '../simulation/random'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Download, Play, Plus, Save, Trash2, Upload, RotateCcw, Shuffle, Equal } from 'lucide-react'
import { createMotorsportConfig, motorsportChampionships } from './packages'
import { createMotorsportRace } from './race'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'
import { buildFreeRace, freeCourses, freeDrivers, freeVehicles, matchingQualifying, MOTORSPORT_FREE_PRESET_KEY, resizeFreeField } from './freeMode'
import type { FreeGrid, MotorsportQualifyingResult } from './freeMode'
import type { ChampionshipId, MotorsportEntry, MotorsportRaceConfig } from './types'

type Preset = { name: string; save: string; grid: FreeGrid; equalCars: boolean }
function loadPresets(): Preset[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MOTORSPORT_FREE_PRESET_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is Preset => !!item && typeof item.name === 'string' && typeof item.save === 'string' && ['manual','random','qualifying-result'].includes(item.grid) && typeof item.equalCars === 'boolean' && !!parseMotorsportSave(item.save)).slice(0,20) : []
  } catch { return [] }
}

export function MotorsportFreeModeBuilder({ initialConfig, qualifying, onClose, onStart, onBaseCategory }: {
  initialConfig: MotorsportRaceConfig; qualifying: MotorsportQualifyingResult | null
  onClose: () => void; onStart: (config: MotorsportRaceConfig) => void
  onBaseCategory: (id: 'f1-custom'|'super-formula') => void
}) {
  const [draft, setDraft] = useState(() => structuredClone(initialConfig))
  const [grid, setGrid] = useState<FreeGrid>(initialConfig.freeSettings?.grid ?? 'manual')
  const [equalCars, setEqualCars] = useState(initialConfig.freeSettings?.equalCars ?? false)
  const [count, setCount] = useState(initialConfig.entries.length)
  const [search, setSearch] = useState('')
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [bulkVehicle, setBulkVehicle] = useState(initialConfig.entries[0].id)
  const [bulkCount, setBulkCount] = useState(5)
  const [selectedPreset, setSelectedPreset] = useState('')
  const [presetName, setPresetName] = useState('My session')
  const [presets, setPresets] = useState(loadPresets)
  const [error, setError] = useState('')
  const close = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null)
  const courses = useMemo(freeCourses, [])
  const vehicles = useMemo(() => freeVehicles(draft.championship), [draft.championship])
  useEffect(() => {
    if (!vehicles.some(vehicle => vehicle.id === bulkVehicle)) setBulkVehicle(vehicles[0].id)
  }, [vehicles, bulkVehicle])
  const drivers = freeDrivers.filter(driver => driver.name.toLowerCase().includes(search.toLowerCase()))
  let validation = ''
  try { buildFreeRace(draft, grid, equalCars, qualifying) } catch (cause) { validation = String(cause instanceof Error ? cause.message : cause) }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    close.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? [])].filter(element => element.offsetParent !== null)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [onClose])
  const update = (index: number, change: Partial<MotorsportEntry>) => setDraft(current => ({ ...current, entries: current.entries.map((entry, i) => i === index ? { ...entry, ...change } : entry) }))
  const move = (index: number, delta: number) => setDraft(current => {
    const entries = [...current.entries], next = index + delta
    if (next >= 0 && next < entries.length) [entries[index], entries[next]] = [entries[next], entries[index]]
    return { ...current, entries }
  })
  const saveText = () => { const config = {...draft,applicationMode:'free' as const,freeSettings:{grid,equalCars}}; return serializeMotorsportSave(config, createMotorsportRace(config)) }
  const applySave = (raw: string) => {
    const saved = parseMotorsportSave(raw)
    if (!saved) throw new Error('Invalid Free Mode configuration')
    setDraft(saved.config); setCount(saved.config.entries.length); setError('')
    setGrid(saved.config.freeSettings?.grid ?? 'manual'); setEqualCars(saved.config.freeSettings?.equalCars ?? false)
  }
  const safely = (action: () => void) => { try { action(); setError('') } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)) } }
  return <div className="free-mode-backdrop" role="dialog" aria-label="Free Mode session builder" aria-modal="true" ref={dialog}>
    <section className="free-mode-builder">
      <FreeModeHeader onClose={onClose} closeRef={close}/>
      <div className="free-mode-settings">
        <label><span>Race start (SIM)</span><select aria-label="Race start mode" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value as 'standing' | 'rolling' })}><option value="standing">Standing</option><option value="rolling">Rolling</option></select></label>
        <label><span>Category</span><select aria-label="Free Mode category" value={draft.championship} onChange={event => { if(event.target.value === 'f1-custom' || event.target.value === 'super-formula') { onBaseCategory(event.target.value); return } const next = createMotorsportConfig(event.target.value as ChampionshipId); setDraft(next); setCount(next.entries.length); setGrid('manual') }}><option value="f1-custom">F1</option><option value="super-formula">SUPER FORMULA</option>{motorsportChampionships.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="free-mode-track-select"><span>Track</span><select aria-label="Free Mode track" value={draft.course.id} onChange={event => setDraft({ ...draft, course: courses.find(course => course.id === event.target.value)! })}>{courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
        <label><span>Session</span><select aria-label="Free Mode session" value={draft.sessionKind ?? 'race'} onChange={event => { const sessionKind = event.target.value as 'race' | 'practice' | 'qualifying'; setDraft({ ...draft, sessionKind, format: sessionKind === 'race' ? { kind:'laps',laps:10,basis:'User SIM distance' } : { kind:'time',seconds:1200,basis:'User SIM timed session; best-lap classification' } }) }}><option value="practice">Practice</option><option value="qualifying">Qualifying</option><option value="race">Race</option></select></label>
        <label><span>Cars</span><div className="free-mode-inline-input"><input aria-label="Free Mode cars" type="number" min="1" max="100" value={count} onChange={event => setCount(Number(event.target.value))}/><button onClick={() => safely(() => setDraft({ ...draft, entries:resizeFreeField(draft.entries.length ? draft.entries : vehicles.slice(0,1),count) }))}>Apply</button></div></label>
        <label><span>{draft.format.kind === 'laps' ? 'Race laps' : 'Duration (minutes)'}</span><input aria-label="Free Mode distance" type="number" min="1" max={draft.format.kind === 'laps' ? 1000 : 1440} value={draft.format.kind === 'laps' ? draft.format.laps : draft.format.seconds / 60} onChange={event => setDraft({ ...draft, format:draft.format.kind === 'laps' ? { kind:'laps',laps:Number(event.target.value),basis:'User SIM distance' } : { kind:'time',seconds:Number(event.target.value)*60,basis:'User SIM timed session' } })}/></label>
        <label><span>Weather</span><select aria-label="Free Mode weather" value={draft.weather} onChange={event => setDraft({ ...draft, weather:event.target.value as 'dry'|'wet' })}><option value="dry">Dry</option><option value="wet">Wet</option></select></label>
        <label><span>Seed</span><input aria-label="Free Mode seed" maxLength={128} value={draft.seed} onChange={event => setDraft({ ...draft,seed:event.target.value })}/></label>
        <label><span>Grid</span><select aria-label="Free Mode grid" value={grid} onChange={event => setGrid(event.target.value as FreeGrid)}><option value="manual">Manual</option><option value="random">Random (seeded)</option><option value="qualifying-result" disabled={!matchingQualifying(draft, qualifying)}>Qualifying result</option></select></label>
        <label><span>Starting fuel (%)</span><input aria-label="Free Mode fuel" type="number" min="1" max="100" value={Math.round(draft.startFuelFraction*100)} onChange={event => setDraft({ ...draft,startFuelFraction:Number(event.target.value)/100 })}/></label>
      </div>
      <div className="free-mode-tools">
        <div className="free-mode-bulk-add"><select aria-label="Vehicle to add" value={bulkVehicle} onChange={event=>setBulkVehicle(event.target.value)}>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.team}</option>)}</select><input aria-label="Number of cars to add" type="number" min="1" max="100" value={bulkCount} onChange={event=>setBulkCount(Number(event.target.value))}/><button disabled={draft.entries.length>=100} onClick={()=>safely(()=>{if(!Number.isInteger(bulkCount)||bulkCount<1||bulkCount>100)throw new Error('Choose 1-100 cars');const template=vehicles.find(vehicle=>vehicle.id===bulkVehicle)??vehicles[0];const next=[...draft.entries,...resizeFreeField([template],Math.min(100-draft.entries.length,bulkCount))];const used=new Set<string>();next.forEach((entry,index)=>{entry.id=`free:${index}:${entry.id}`;let number=Number(entry.number)||1;while(used.has(`${entry.classId}:${number}`))number++;entry.number=String(number);used.add(`${entry.classId}:${number}`)});setDraft({...draft,entries:next});setCount(next.length)})}><Plus size={15}/>Add multiple</button></div>
        <button onClick={()=>{const next=createMotorsportConfig(draft.championship);setDraft({...draft,entries:next.entries});setCount(next.entries.length);setGrid('manual')}}><RotateCcw size={15}/>Category grid</button>
        <button onClick={()=>{const random=createSeededRandom(`${draft.seed}:drivers`);setDraft({...draft,entries:draft.entries.map(entry=>{const pool=[...freeDrivers];return {...entry,drivers:entry.drivers.map(()=>pool.splice(Math.floor(random()*pool.length),1)[0])}})})}}><Shuffle size={15}/>Drivers</button>
        <button onClick={()=>{const random=createSeededRandom(`${draft.seed}:cars`);setDraft({...draft,entries:draft.entries.map(entry=>{const pool=vehicles.filter(vehicle=>vehicle.classId===entry.classId);const vehicle=pool[Math.floor(random()*pool.length)];return {...entry,machine:structuredClone(vehicle.machine),team:vehicle.team,color:vehicle.color,sourceUrl:vehicle.sourceUrl}})})}}><Shuffle size={15}/>Cars</button>
        <button title="Equal machine performance within each class" aria-pressed={equalCars} onClick={()=>setEqualCars(value=>!value)}><Equal size={15}/>Equal cars</button>
        <button onClick={()=>{setDraft({...draft,entries:[]});setCount(0)}}><Trash2 size={15}/>Clear</button>
        <button onClick={()=>{const next=structuredClone(initialConfig);setDraft(next);setCount(next.entries.length);setGrid('manual');setEqualCars(false)}}><RotateCcw size={15}/>Reset</button>
      </div>
      <FreeModeSearch driverSearch={search} vehicleSearch={vehicleSearch} onDriverSearch={setSearch} onVehicleSearch={setVehicleSearch} cars={draft.entries.length} mean={draft.entries.length ? (draft.entries.reduce((sum,entry)=>sum+(entry.drivers[0].overall??0),0)/draft.entries.length).toFixed(1) : '—'} equalCars={equalCars} meanLabel="driver mean"/>
      <div className="free-mode-entry-table" role="region" aria-label="Entries"><div className="free-mode-entry-head"><span>Grid</span><span>Driver</span><span>Vehicle</span><span>No.</span><span>DRV</span><span>CLASS</span><span>Actions</span></div><div className="free-mode-entry-scroll">
        {draft.entries.map((entry,index) => <div className="free-mode-entry-row" key={entry.id}><strong>{index+1}</strong><div className="free-mode-driver-cell"><label><span className="sr-only">Driver for grid {index+1} crew 1</span><select aria-label={`Driver for grid ${index+1} crew 1`} value={entry.drivers[0].id} onChange={event=>update(index,{drivers:[freeDrivers.find(person=>person.id===event.target.value)!,...entry.drivers.slice(1)]})}>{[entry.drivers[0],...drivers.filter(person=>person.id!==entry.drivers[0].id)].map(person=><option key={person.id} value={person.id}>{person.name} · {person.overall??'—'}</option>)}</select></label><details className="free-mode-crew"><summary aria-label={`Edit crew for grid ${index+1}`}>{entry.drivers.length} DRV</summary><div>{entry.drivers.slice(1).map((driver,offset)=><label key={offset}><span>Crew {offset+2}</span><select aria-label={`Driver for grid ${index+1} crew ${offset+2}`} value={driver.id} onChange={event=>update(index,{drivers:entry.drivers.map((person,i)=>i===offset+1?freeDrivers.find(person=>person.id===event.target.value)!:person)})}>{[driver,...drivers.filter(person=>person.id!==driver.id)].map(person=><option key={person.id} value={person.id}>{person.name} · {person.overall??'—'}</option>)}</select></label>)}<button aria-label={`Add crew for grid ${index+1}`} disabled={entry.drivers.length>=4} onClick={()=>{const driver=freeDrivers.find(person=>!entry.drivers.some(crew=>crew.id===person.id))!;update(index,{drivers:[...entry.drivers,driver]})}}>+ Crew</button><button aria-label={`Remove crew for grid ${index+1}`} disabled={entry.drivers.length<=1} onClick={()=>update(index,{drivers:entry.drivers.slice(0,-1)})}>− Crew</button></div></details></div>
          <label className="free-mode-vehicle-cell"><i style={{background:entry.color}}/><span className="sr-only">Vehicle for grid {index+1}</span><select aria-label={`Vehicle for grid ${index+1}`} value={vehicles.find(vehicle => vehicle.machine.name === entry.machine.name && vehicle.classId === entry.classId)?.id ?? ''} onChange={event => { const vehicle = vehicles.find(vehicle => vehicle.id === event.target.value)!; update(index,{machine:structuredClone(vehicle.machine),classId:vehicle.classId,team:vehicle.team,color:vehicle.color,sourceUrl:vehicle.sourceUrl}) }}>{vehicles.filter(vehicle=>vehicle.machine.name===entry.machine.name||`${vehicle.team} ${vehicle.machine.name} ${vehicle.number}`.toLowerCase().includes(vehicleSearch.toLowerCase())).map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.classId.toUpperCase()} · {vehicle.team} · {vehicle.machine.name}</option>)}</select></label>
          <input aria-label={`Car number for grid ${index+1}`} value={entry.number} maxLength={6} onChange={event => update(index,{number:event.target.value})}/><strong>{entry.drivers[0].overall ?? '—'}</strong><span>{entry.classId.toUpperCase()}</span><div className="free-mode-row-actions"><button aria-label={`Move grid ${index+1} up`} disabled={index===0} onClick={() => move(index,-1)}><ArrowUp size={13}/></button><button aria-label={`Move grid ${index+1} down`} disabled={index===draft.entries.length-1} onClick={() => move(index,1)}><ArrowDown size={13}/></button><button aria-label={`Duplicate vehicle at grid ${index+1}`} disabled={draft.entries.length>=100} onClick={() => { const entries = resizeFreeField([entry],2); const copy = entries[1]; const used = new Set(draft.entries.map(car=>car.number)); let number = 1; while(used.has(String(number))) number++; copy.number=String(number); copy.id=`free:${crypto.randomUUID()}`; setDraft({ ...draft,entries:[...draft.entries,copy] }); setCount(draft.entries.length+1) }}><Copy size={13}/></button><button aria-label={`Delete grid ${index+1}`} disabled={draft.entries.length<=1} onClick={() => { setDraft({ ...draft,entries:draft.entries.filter((_,i) => i!==index) }); setCount(draft.entries.length-1) }}><Trash2 size={13}/></button></div></div>)}
      </div></div>
      <div className="free-mode-presets"><label><span>Preset name</span><input aria-label="Free Mode preset name" value={presetName} onChange={event => setPresetName(event.target.value)} maxLength={80}/></label><button onClick={() => safely(() => { const next = [...presets.filter(item=>item.name!==presetName),{name:presetName,save:saveText(),grid,equalCars}].slice(-20); localStorage.setItem(MOTORSPORT_FREE_PRESET_KEY,JSON.stringify(next)); setPresets(next);setSelectedPreset(presetName) })}><Save size={13}/>Save preset</button><select aria-label="Saved Free Mode preset" value={selectedPreset} onChange={event => safely(() => { setSelectedPreset(event.target.value);const preset = presets.find(item=>item.name===event.target.value)!; applySave(preset.save); setGrid(preset.grid); setEqualCars(preset.equalCars); setPresetName(preset.name) })}><option value="" disabled>Load preset...</option>{presets.map(preset=><option key={preset.name} value={preset.name}>{preset.name}</option>)}</select><button disabled={!selectedPreset} onClick={()=>{const next=presets.map(preset=>preset.name===selectedPreset?{...preset,name:presetName}:preset);if(presets.some(preset=>preset.name===presetName&&preset.name!==selectedPreset)){setError('Preset name already exists');return}localStorage.setItem(MOTORSPORT_FREE_PRESET_KEY,JSON.stringify(next));setPresets(next);setSelectedPreset(presetName)}}>Rename</button><button disabled={!selectedPreset} onClick={()=>{const preset=presets.find(item=>item.name===selectedPreset)!;let name=`${preset.name} copy`;while(presets.some(item=>item.name===name))name+=' copy';const next=[...presets,{...preset,name}].slice(-20);localStorage.setItem(MOTORSPORT_FREE_PRESET_KEY,JSON.stringify(next));setPresets(next);setSelectedPreset(name);setPresetName(name)}}><Copy size={15}/>Duplicate</button><button disabled={!selectedPreset} onClick={()=>{const next=presets.filter(item=>item.name!==selectedPreset);localStorage.setItem(MOTORSPORT_FREE_PRESET_KEY,JSON.stringify(next));setPresets(next);setSelectedPreset('')}}><Trash2 size={15}/>Delete</button><button onClick={() => safely(() => { const raw=saveText(); const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})); const link=document.createElement('a'); link.href=url; link.download='motorsport-free-mode.json'; link.click(); URL.revokeObjectURL(url) })}><Download size={13}/>Export JSON</button><button onClick={()=>file.current?.click()}><Upload size={13}/>Import JSON</button><input hidden ref={file} aria-label="Import Free Mode configuration" type="file" accept=".json" onChange={async event=>{const selected=event.target.files?.[0];if(!selected)return;try{if(selected.size>4_000_000)throw new Error('File too large');applySave(await selected.text())}catch(cause){setError(String(cause))}event.target.value=''}}/></div>
      <footer className="free-mode-footer"><div>{(error||validation)&&<p className="free-mode-error" role="alert">{error||validation}</p>}<p>Ready: {motorsportChampionships.find(item=>item.id===draft.championship)?.label} · {draft.entries.length} cars · SIM only</p></div><button className="free-mode-start" disabled={!!validation} onClick={()=>safely(()=>onStart(buildFreeRace(draft,grid,equalCars,qualifying)))}><Play size={15}/>Start session</button></footer>
    </section>
  </div>
}
