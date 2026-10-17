import type { TrackDefinition, WeatherState } from '../types'
import { hashChance } from './random'

export const weatherTuning = {
  segmentSeconds: 240,
  forecastHorizonSeconds: 480,
  lightRainGrip: 0.82,
  heavyRainGrip: 0.62,
  wettingTransitionSeconds: 90,
  dryingTransitionSeconds: 180,
} as const

export type WeatherForecast = {
  weather: WeatherState
  weatherLabel: string
  trackGrip: number
  secondsAhead: number
  confidence: number
  willChange: boolean
  label: string
}

export type WeatherTrackState = {
  rainIntensityMmH: number
  rainLabel: string
  trackWetnessPercent: number
}

export type SimulatedTemperatures = {
  airTemperatureC: number
  trackTemperatureC: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const rainLevelForState = (weather: WeatherState) =>
  weather === 'heavy-rain' ? 1 : weather === 'light-rain' ? 0.45 : 0

export function simulatedTemperaturesFor(
  seed: string,
  track: Pick<TrackDefinition, 'id' | 'rainProbability'>,
  weather: WeatherState,
): SimulatedTemperatures {
  const coolOff = weather === 'heavy-rain' ? 7 : weather === 'light-rain' ? 4 : 0
  const airTemperatureC =
    22 +
    (1 - track.rainProbability) * 8 +
    hashChance(`${seed}:air:${track.id}`) * 5 -
    coolOff
  const trackTemperatureC =
    airTemperatureC +
    (weather === 'clear' ? 15 : weather === 'light-rain' ? 7 : 3)

  return { airTemperatureC, trackTemperatureC }
}

export function simulatedHumidityPercentFor(
  track: Pick<TrackDefinition, 'rainProbability'>,
  weather: WeatherState,
) {
  return Math.round(
    Math.min(
      96,
      42 + track.rainProbability * 46 + (weather === 'clear' ? 0 : 18),
    ),
  )
}

/** NOAA Rothfusz regression, returned in Celsius for B1.5.10 declarations. */
export function heatIndexCFor(
  airTemperatureC: number,
  relativeHumidityPercent: number,
) {
  if (airTemperatureC < 26.7 || relativeHumidityPercent < 40) {
    return airTemperatureC
  }

  const temperatureF = (airTemperatureC * 9) / 5 + 32
  const humidity = Math.min(100, Math.max(0, relativeHumidityPercent))
  let heatIndexF =
    -42.379 +
    2.04901523 * temperatureF +
    10.14333127 * humidity -
    0.22475541 * temperatureF * humidity -
    0.00683783 * temperatureF * temperatureF -
    0.05481717 * humidity * humidity +
    0.00122874 * temperatureF * temperatureF * humidity +
    0.00085282 * temperatureF * humidity * humidity -
    0.00000199 * temperatureF * temperatureF * humidity * humidity

  if (humidity < 13 && temperatureF >= 80 && temperatureF <= 112) {
    heatIndexF -=
      ((13 - humidity) / 4) *
      Math.sqrt((17 - Math.abs(temperatureF - 95)) / 17)
  } else if (humidity > 85 && temperatureF >= 80 && temperatureF <= 87) {
    heatIndexF +=
      ((humidity - 85) / 10) * ((87 - temperatureF) / 5)
  }

  return ((heatIndexF - 32) * 5) / 9
}

export function heatHazardMassIncreaseKgFor(options: {
  competitionDeclared: boolean
  sessionDeclared: boolean
}) {
  return options.sessionDeclared ? 5 : options.competitionDeclared ? 2 : 0
}

function weatherForSegment(
  seed: string,
  track: TrackDefinition,
  segment: number,
): WeatherState {
  const normalizedSegment = Math.max(0, segment)
  const baseRainChance = Math.max(0, Math.min(0.75, track.rainProbability))
  const pattern = hashChance(`${seed}:weather-pattern:${track.id}`)
  const segmentRoll = hashChance(`${seed}:weather:${track.id}:${normalizedSegment}`)
  const stormRoll = hashChance(`${seed}:storm:${track.id}:${normalizedSegment}`)
  const rainChance = baseRainChance * (0.45 + pattern * 0.75)

  if (stormRoll < rainChance * 0.18) {
    return 'heavy-rain'
  }

  if (segmentRoll < rainChance) {
    return 'light-rain'
  }

  return 'clear'
}

export function rainIntensityLevelFor(
  seed: string,
  track: TrackDefinition,
  elapsedSeconds: number,
): number {
  const segment = Math.max(0, Math.floor(elapsedSeconds / weatherTuning.segmentSeconds))
  const current = rainLevelForState(weatherForSegment(seed, track, segment))

  if (segment === 0) {
    return current
  }

  const previous = rainLevelForState(weatherForSegment(seed, track, segment - 1))
  const secondsIntoSegment = elapsedSeconds - segment * weatherTuning.segmentSeconds
  const transitionSeconds =
    current >= previous
      ? weatherTuning.wettingTransitionSeconds
      : weatherTuning.dryingTransitionSeconds
  const linearProgress = clamp01(secondsIntoSegment / transitionSeconds)
  const smoothProgress = linearProgress * linearProgress * (3 - 2 * linearProgress)

  return previous + (current - previous) * smoothProgress
}

export function weatherFor(
  seed: string,
  track: TrackDefinition,
  elapsedSeconds: number,
): WeatherState {
  const rainLevel = rainIntensityLevelFor(seed, track, elapsedSeconds)

  if (rainLevel >= 0.72) {
    return 'heavy-rain'
  }

  if (rainLevel >= 0.08) {
    return 'light-rain'
  }

  return 'clear'
}

/**
 * A shower can be weaker in one sector while preserving the global forecast.
 * The result is seed-deterministic, so replaying a session remains stable.
 */
export function weatherForSector(
  seed: string,
  track: TrackDefinition,
  elapsedSeconds: number,
  sector: number,
): WeatherState {
  const globalWeather = weatherFor(seed, track, elapsedSeconds)

  if (globalWeather === 'clear') {
    return globalWeather
  }

  const segment = Math.max(0, Math.floor(elapsedSeconds / weatherTuning.segmentSeconds))
  const localRoll = hashChance(`${seed}:sector-weather:${track.id}:${segment}:${sector}`)

  if (globalWeather === 'heavy-rain' && localRoll < 0.24) {
    return 'light-rain'
  }

  if (globalWeather === 'light-rain' && localRoll < 0.2) {
    return 'clear'
  }

  return globalWeather
}

export function weatherLabelFor(weather: WeatherState): string {
  switch (weather) {
    case 'clear':
      return 'CLEAR'
    case 'light-rain':
      return 'LIGHT RAIN'
    case 'heavy-rain':
      return 'HEAVY RAIN'
    default:
      return 'CLEAR'
  }
}

export function trackGripForWeather(
  seed: string,
  track: TrackDefinition,
  elapsedSeconds: number,
): number {
  const rainLevel = rainIntensityLevelFor(seed, track, elapsedSeconds)

  if (rainLevel <= 0.45) {
    return 1 - (1 - weatherTuning.lightRainGrip) * (rainLevel / 0.45)
  }

  const heavyProgress = (rainLevel - 0.45) / 0.55
  return (
    weatherTuning.lightRainGrip -
    (weatherTuning.lightRainGrip - weatherTuning.heavyRainGrip) * heavyProgress
  )
}

export function trackGripForSector(
  seed: string,
  track: TrackDefinition,
  elapsedSeconds: number,
  sector: number,
): number {
  const globalWeather = weatherFor(seed, track, elapsedSeconds)
  const localWeather = weatherForSector(seed, track, elapsedSeconds, sector)
  const globalGrip = trackGripForWeather(seed, track, elapsedSeconds)

  if (globalWeather === localWeather) {
    return globalGrip
  }

  if (localWeather === 'clear') {
    return Math.min(0.96, globalGrip + 0.12)
  }

  if (localWeather === 'light-rain') {
    return Math.max(0.76, globalGrip + 0.07)
  }

  return globalGrip
}

export function weatherTrackStateFor(
  seed: string,
  track: TrackDefinition,
  elapsedSeconds: number,
): WeatherTrackState {
  const trackGrip = trackGripForWeather(seed, track, elapsedSeconds)
  const rainLevel = rainIntensityLevelFor(seed, track, elapsedSeconds)
  const segment = Math.max(0, Math.floor(elapsedSeconds / weatherTuning.segmentSeconds))
  const pulse = hashChance(`${seed}:rain-intensity:${track.id}:${segment}`)
  const lightPeak = 0.7 + pulse * 2.8
  const heavyPeak = 4.2 + pulse * 9.4
  const rainIntensityMmH =
    rainLevel <= 0
      ? 0
      : rainLevel <= 0.45
        ? lightPeak * (rainLevel / 0.45)
        : lightPeak + (heavyPeak - lightPeak) * ((rainLevel - 0.45) / 0.55)
  const trackWetnessPercent = Math.round(clamp01((1 - trackGrip) / 0.46) * 100)
  const rainLabel =
    rainIntensityMmH === 0
      ? '0.0 mm/h'
      : `${rainIntensityMmH.toFixed(1)} mm/h`

  return {
    rainIntensityMmH,
    rainLabel,
    trackWetnessPercent,
  }
}

export function weatherForecastFor(
  seed: string,
  track: TrackDefinition,
  elapsedSeconds: number,
  horizonSeconds: number = weatherTuning.forecastHorizonSeconds,
): WeatherForecast {
  const currentWeather = weatherFor(seed, track, elapsedSeconds)
  const currentGrip = trackGripForWeather(seed, track, elapsedSeconds)
  const sampleStep = 60
  let secondsAhead: number = horizonSeconds
  let forecastWeather = currentWeather
  let forecastGrip = currentGrip
  let willChange = false

  for (let ahead = sampleStep; ahead <= horizonSeconds; ahead += sampleStep) {
    const sampleTime = elapsedSeconds + ahead
    const sampleWeather = weatherFor(seed, track, sampleTime)
    const sampleGrip = trackGripForWeather(seed, track, sampleTime)

    if (sampleWeather !== currentWeather || Math.abs(sampleGrip - currentGrip) > 0.08) {
      secondsAhead = ahead
      forecastWeather = sampleWeather
      forecastGrip = sampleGrip
      willChange = true
      break
    }
  }

  const confidence = willChange
    ? clamp01(0.56 + (1 - secondsAhead / horizonSeconds) * 0.34)
    : clamp01(0.62 + (1 - track.rainProbability) * 0.18)
  const weatherLabel = weatherLabelFor(forecastWeather)
  const minutes = Math.max(1, Math.round(secondsAhead / 60))
  const label = willChange
    ? `${weatherLabel} in ${minutes}m (${Math.round(confidence * 100)}%)`
    : `${weatherLabel} stable (${Math.round(confidence * 100)}%)`

  return {
    weather: forecastWeather,
    weatherLabel,
    trackGrip: forecastGrip,
    secondsAhead,
    confidence,
    willChange,
    label,
  }
}
