import { createContext, useContext } from 'react'
import { APP_CONFIG } from '@/config/appConfig'

export type DisplayDensity = 'comfortable' | 'compact'

export interface DensityContextValue {
  density: DisplayDensity
  setDensity: (density: DisplayDensity) => void
}

export const DensityContext = createContext<DensityContextValue>({
  density: APP_CONFIG.DEFAULT_DENSITY,
  setDensity: () => null,
})

export const isDensity = (value: unknown): value is DisplayDensity =>
  value === 'comfortable' || value === 'compact'

export function useDensity(): DensityContextValue {
  return useContext(DensityContext)
}
