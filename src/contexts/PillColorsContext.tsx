import { createContext, useCallback, useContext, useState } from 'react'
import { ORG_PALETTE, PERSON_PALETTE } from '../constants/palettes'

interface PillColorsContextType {
  defaultOrgColor: string
  defaultPersonColor: string
  setDefaultOrgColor: (hex: string) => void
  setDefaultPersonColor: (hex: string) => void
}

const FALLBACK_ORG = ORG_PALETTE[0].hex
const FALLBACK_PERSON = PERSON_PALETTE[0].hex

const PillColorsContext = createContext<PillColorsContextType>({
  defaultOrgColor: FALLBACK_ORG,
  defaultPersonColor: FALLBACK_PERSON,
  setDefaultOrgColor: () => {},
  setDefaultPersonColor: () => {},
})

// Guard against stale localStorage values if the palette ever changes
function validate(hex: string | null, palette: { hex: string }[], fallback: string): string {
  if (!hex) return fallback
  return palette.some(p => p.hex.toLowerCase() === hex.toLowerCase()) ? hex : fallback
}

export function PillColorsProvider({ children }: { children: React.ReactNode }) {
  const [defaultOrgColor, setOrgState] = useState<string>(() =>
    validate(localStorage.getItem('coterie-default-org-color'), ORG_PALETTE, FALLBACK_ORG)
  )
  const [defaultPersonColor, setPersonState] = useState<string>(() =>
    validate(localStorage.getItem('coterie-default-person-color'), PERSON_PALETTE, FALLBACK_PERSON)
  )

  const setDefaultOrgColor = useCallback((hex: string) => {
    setOrgState(hex)
    localStorage.setItem('coterie-default-org-color', hex)
  }, [])

  const setDefaultPersonColor = useCallback((hex: string) => {
    setPersonState(hex)
    localStorage.setItem('coterie-default-person-color', hex)
  }, [])

  return (
    <PillColorsContext.Provider value={{ defaultOrgColor, defaultPersonColor, setDefaultOrgColor, setDefaultPersonColor }}>
      {children}
    </PillColorsContext.Provider>
  )
}

export function usePillColors() {
  return useContext(PillColorsContext)
}

export function useDefaultColorFor(objectClass: string): string {
  const ctx = useContext(PillColorsContext)
  return objectClass === 'person' ? ctx.defaultPersonColor : ctx.defaultOrgColor
}

// Given a class and the user's default, return the palette ordered with the
// default first. Used by the color picker to keep the "default" slot on the left.
export function orderPaletteByDefault(
  palette: { name: string; hex: string }[],
  defaultHex: string
): { name: string; hex: string }[] {
  const defaultEntry = palette.find(p => p.hex.toLowerCase() === defaultHex.toLowerCase()) ?? palette[0]
  const others = palette.filter(p => p.hex.toLowerCase() !== defaultEntry.hex.toLowerCase())
  return [defaultEntry, ...others]
}
