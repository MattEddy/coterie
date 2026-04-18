import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './contexts/ThemeContext'
import { PillColorsProvider } from './contexts/PillColorsContext'
import App from './App'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PillColorsProvider>
        <App />
      </PillColorsProvider>
    </ThemeProvider>
  </StrictMode>,
)
