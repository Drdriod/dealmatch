import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Loads all platform_settings rows into a flat { key: value } object.
 * Used by the public Footer to render live social links, and by the
 * admin Settings tab to edit them. Single source of truth - no more
 * hardcoded URLs in component files.
 */
export function usePlatformSettings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
      if (error) throw error
      const map = {}
      for (const row of data || []) map[row.key] = row.value
      setSettings(map)
    } catch (err) {
      console.error('usePlatformSettings load error:', err.message)
      setSettings({})
    }
    setLoading(false)
  }

  return { settings, loading, reload: load }
}
