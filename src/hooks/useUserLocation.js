import { useState, useCallback } from 'react'

/**
 * Thin wrapper around navigator.geolocation, following the same pattern
 * already used for GPS capture in AgentDashboardPage.jsx. Location is
 * opt-in only - nothing here calls getCurrentPosition until the caller
 * explicitly invokes requestLocation() (e.g. a "Search near me" button),
 * so no page silently prompts for location on load.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState(null) // { lat, lng, accuracy } | null
  const [status, setStatus] = useState('idle') // idle | requesting | granted | denied | unsupported
  const [error, setError] = useState(null)

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unsupported')
      setError('Geolocation is not available on this device')
      return
    }
    setStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setStatus('granted')
        setError(null)
      },
      (err) => {
        setStatus('denied')
        setError(err.message || 'Location permission denied')
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  return { coords, status, error, requestLocation }
}
