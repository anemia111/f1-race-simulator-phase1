import importedJson from '../data/importedDriverRatings2026.json'
import type { DriverPoolRecord, CompactDriverRatings } from './driverPool'
import type { DriverSourceSeriesId } from './seriesIds'

export type ImportedDriverRating = {
  id: string
  name: string
  code: string
  nationality: string
  overall: number
  potential: number | null
  ratings: CompactDriverRatings
  seriesIds: DriverSourceSeriesId[]
  sourceRow: number
  raw: Record<string, string>
}

export const importedDriverRatings = importedJson as {
  schemaVersion: number
  sourceFile: string
  sourceDate: string
  sha256: string
  existingRatingPolicy: string
  missingPotentialPolicy: string
  drivers: ImportedDriverRating[]
}

/** No rating comparison, rebase, averaging or random axis split on import. */
export function appendImportedDriverRatings(existing: readonly DriverPoolRecord[]): DriverPoolRecord[] {
  const pool = new Map(existing.map((driver) => [driver.id, driver]))
  for (const row of importedDriverRatings.drivers) {
    const current = pool.get(row.id)
    const provenance = row.seriesIds.map((seriesId) => ({
      id: `user-csv:${importedDriverRatings.sha256}:${row.sourceRow}:${seriesId}`,
      sourceType: 'editorial' as const,
      sourceSeason: 2026,
      sourceSeriesId: seriesId,
      sourceRole: 'regular' as const,
      sourceFile: importedDriverRatings.sourceFile,
      sourceDate: importedDriverRatings.sourceDate,
      sourceIds: [row.raw['Source URL'] || 'user-authored-custom-driver'],
      methodVersion: row.raw.Methodology,
      // CSV uncertainty is preserved verbatim in raw. Do not promote n/a to high.
      confidence: row.raw.Confidence === 'high' ? 'high' as const :
        row.raw.Confidence === 'medium' ? 'medium' as const : 'low' as const,
    })) as DriverPoolRecord['provenance']
    const careerHistory = row.seriesIds.map((seriesId) => ({
      season: 2026, seriesId, role: 'regular' as const,
      sourceIds: [row.raw['Source URL'] || 'user-authored-custom-driver'],
    })) as DriverPoolRecord['careerHistory']
    pool.set(row.id, current ? {
      ...current,
      provenance: [...current.provenance, ...provenance],
      careerHistory: [...current.careerHistory, ...careerHistory],
    } : {
      id: row.id, code: row.code, name: row.name, nationality: row.nationality,
      overall: row.overall, potential: row.potential ?? row.overall,
      ratings: { ...row.ratings }, ratingSourceProvenanceId: provenance[0].id,
      provenance, careerHistory,
    })
  }
  return [...pool.values()]
}

export const importedDriverRatingById = new Map(importedDriverRatings.drivers.map((row) => [row.id, row]))
