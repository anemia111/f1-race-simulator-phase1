/**
 * Shared shape of the air/track/wind read-out shown by the broadcast header
 * and the pit wall. Values arrive pre-formatted with a trailing provenance
 * suffix so the compact header can print them directly.
 */
export type EnvironmentReadout = {
  airLabel: string
  humidityLabel: string
  pressureLabel: string
  rainLabel: string
  source: string
  trackLabel: string
  windLabel: string
}

/**
 * Strips the trailing provenance suffix (` S` simulated, ` OBS` observed) so a
 * screen that renders its own source chip does not print the tag twice.
 */
export const cleanEnvironmentValue = (value: string) =>
  value.replace(/\s+(?:OBS|S)$/, '')
