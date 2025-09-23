import { useEffect, useState } from 'react'

export const useMediaQuery = (query: string, defaultValue = false): boolean => {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return defaultValue
    }
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQueryList = window.matchMedia(query)
    const updateMatch = (event: MediaQueryListEvent | MediaQueryList) => {
      setMatches(event.matches)
    }

    updateMatch(mediaQueryList)

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', updateMatch)
      return () => mediaQueryList.removeEventListener('change', updateMatch)
    }

    if (typeof mediaQueryList.addListener === 'function') {
      mediaQueryList.addListener(updateMatch)
      return () => mediaQueryList.removeListener(updateMatch)
    }

    return undefined
  }, [query])

  return matches
}

export default useMediaQuery
