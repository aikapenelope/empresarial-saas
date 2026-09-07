"use client"

import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Variante del hook oficial de shadcn ajustada al patrón canónico de React
 * (sin setState síncrono dentro del efecto, que el compiler lint rechaza):
 * el estado inicial se calcula en el primer render del cliente y el efecto
 * sólo se suscribe a los cambios posteriores del media query.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
