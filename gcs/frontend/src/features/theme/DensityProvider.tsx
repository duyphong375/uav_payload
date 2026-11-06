import React, { useEffect, useState } from 'react'
import { APP_CONFIG } from '@/config/appConfig'
import { DensityContext, isDensity, type DisplayDensity } from './densityContext'

export const DensityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [density, setDensityState] = useState<DisplayDensity>(() => {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.DISPLAY_DENSITY)
    return isDensity(saved) ? saved : APP_CONFIG.DEFAULT_DENSITY
  })

  // data-density đặt ở documentElement để mọi trang dùng chung token.
  useEffect(() => {
    window.document.documentElement.dataset.density = density
  }, [density])

  const setDensity = (next: DisplayDensity) => {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DISPLAY_DENSITY, next)
    setDensityState(next)
  }

  return (
    <DensityContext.Provider value={{ density, setDensity }}>{children}</DensityContext.Provider>
  )
}
