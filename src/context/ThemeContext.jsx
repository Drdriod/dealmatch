import React, { createContext, useContext, useState, useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    // Only use dark mode if user has explicitly chosen it before
    // Default is always light: ignore system preference
    return localStorage.getItem('dm-theme') === 'dark'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dm-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }

export function ThemeToggle({ className = '' }) {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-deep/8 ${className}`}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark
        ? <Sun size={16} className="text-gold" />
        : <Moon size={16} className="text-deep/50" />
      }
    </button>
  )
}
