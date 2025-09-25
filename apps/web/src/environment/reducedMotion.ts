const MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

type Listener = (prefersReducedMotion: boolean) => void

let mediaQueryList: MediaQueryList | null = null
let mediaQueryHandler: ((event: MediaQueryListEvent) => void) | null = null
const listeners = new Set<Listener>()
let currentPreference = false
let overridePreference: boolean | null = null

const notifyListeners = (value: boolean) => {
  for (const listener of listeners) {
    listener(value)
  }
}

const resolvePreference = (): boolean => overridePreference ?? currentPreference

const setupMediaQuery = () => {
  if (mediaQueryList || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }

  const query = window.matchMedia(MEDIA_QUERY)
  currentPreference = query.matches
  const handler = (event: MediaQueryListEvent) => {
    currentPreference = event.matches
    notifyListeners(resolvePreference())
  }

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler)
    mediaQueryHandler = handler
  } else if (typeof query.addListener === 'function') {
    query.addListener(handler)
    mediaQueryHandler = handler
  }

  mediaQueryList = query
}

const teardownMediaQuery = () => {
  if (!mediaQueryList || !mediaQueryHandler) return

  if (typeof mediaQueryList.removeEventListener === 'function') {
    mediaQueryList.removeEventListener('change', mediaQueryHandler)
  } else if (typeof mediaQueryList.removeListener === 'function') {
    mediaQueryList.removeListener(mediaQueryHandler)
  }

  mediaQueryList = null
  mediaQueryHandler = null
}

export const getPrefersReducedMotion = (): boolean => {
  setupMediaQuery()
  return resolvePreference()
}

export const subscribeToReducedMotion = (listener: Listener): (() => void) => {
  setupMediaQuery()
  listeners.add(listener)
  listener(resolvePreference())

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      teardownMediaQuery()
    }
  }
}

export const setReducedMotionOverride = (value: boolean | null): void => {
  overridePreference = value
  notifyListeners(resolvePreference())
}
