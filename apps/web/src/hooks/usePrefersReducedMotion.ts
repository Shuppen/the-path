import { useEffect, useState } from 'react'

import { getPrefersReducedMotion, subscribeToReducedMotion } from '../environment/reducedMotion'

export const usePrefersReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => getPrefersReducedMotion())

  useEffect(() => {
    const unsubscribe = subscribeToReducedMotion(setPrefersReducedMotion)
    return () => unsubscribe()
  }, [])

  return prefersReducedMotion
}
