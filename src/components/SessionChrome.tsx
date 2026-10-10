import { X } from 'lucide-react'
import type { RefObject } from 'react'

export function SetupPanelHeader({ teams, cars, onClose, closeLabel = 'Close panel' }: { teams: number; cars: number; onClose: () => void; closeLabel?: string }) {
  return <div className="setup-header"><div><span>Weekend engineering</span><strong>{teams} teams / {cars} cars</strong></div><button type="button" className="plain-icon-button" aria-label={closeLabel} title="Close setup" onClick={onClose}><X aria-hidden="true" size={18}/></button></div>
}
export function FreeModeHeader({ onClose, closeRef }: { onClose: () => void; closeRef: RefObject<HTMLButtonElement | null> }) {
  return <header className="free-mode-header"><div><span>INDEPENDENT SIM SESSION</span><h1>Free Mode Builder</h1><p>Championship points, calendar progress and OpenF1 sessions stay untouched.</p></div><button type="button" className="free-mode-icon-button" aria-label="Close Free Mode Builder" title="Close" ref={closeRef} onClick={onClose}><X size={19}/></button></header>
}
export function FreeModeSearch({ driverSearch, vehicleSearch, onDriverSearch, onVehicleSearch, cars, mean, equalCars, meanLabel }: { driverSearch: string; vehicleSearch: string; onDriverSearch: (text: string) => void; onVehicleSearch: (text: string) => void; cars: number; mean: string; equalCars: boolean; meanLabel?: string }) {
  return <div className="free-mode-search"><label><span>Find driver</span><input aria-label="Search Free Mode drivers" placeholder="Name, code, nationality, rating, history" value={driverSearch} onChange={event => onDriverSearch(event.target.value)}/></label><label><span>Find vehicle</span><input aria-label="Search Free Mode vehicles" placeholder="Team name or car number" value={vehicleSearch} onChange={event => onVehicleSearch(event.target.value)}/></label><div className="free-mode-field-summary"><strong>{cars}</strong><span>cars</span><strong>{mean}</strong><span>{meanLabel ?? (equalCars ? 'equal rating' : 'field mean')}</span></div></div>
}
