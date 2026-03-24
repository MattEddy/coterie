import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type ThemePreference = 'light' | 'dark' | 'auto'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'auto',
  resolvedTheme: 'dark',
  setTheme: () => {},
})

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === 'auto' ? getSystemTheme() : pref
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    return (localStorage.getItem('coterie-theme') as ThemePreference) || 'auto'
  })
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme))

  const applyTheme = useCallback((pref: ThemePreference) => {
    const resolved = resolve(pref)
    setResolvedTheme(resolved)
    document.documentElement.dataset.theme = resolved
  }, [])

  const setTheme = useCallback((pref: ThemePreference) => {
    setThemeState(pref)
    localStorage.setItem('coterie-theme', pref)
    applyTheme(pref)
  }, [applyTheme])

  // Apply on mount
  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  // Listen for system preference changes when set to auto
  useEffect(() => {
    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme, applyTheme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
