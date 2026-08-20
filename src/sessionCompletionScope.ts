import type { ApplicationMode } from './freeMode/types'

export type SessionCompletionDestination =
  | 'championship-weekend'
  | 'free-mode'

/** Keep completion writes inside the application mode that owns the session. */
export function sessionCompletionDestinationFor(
  applicationMode: ApplicationMode,
): SessionCompletionDestination {
  return applicationMode === 'championship'
    ? 'championship-weekend'
    : 'free-mode'
}
