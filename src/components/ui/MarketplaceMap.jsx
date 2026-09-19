import React, { useState } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import { Map as MapIcon } from 'lucide-react'

const LIBRARIES = ['places']

const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#FAF6F0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#2D2420' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FAF6F0' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8A7E78' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C5D8E8' }] },
]

/**
 * Multi-pin marketplace map. `listings` is any array with { id, lat, lng,
 * title, price_cents }, matching what match_category_listings now returns
 * explicitly (see the ADR-012-follow-up migration fixing the lat/lng
 * serialization). Pass a single-item array for a listing-detail preview.
 */
export function MarketplaceMap({ listings = [], height = '320px', zoom = 12 }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  })
  const [selected, setSelected] = useState(null)

  const pins = listings.filter(l => typeof l.lat === 'number' && typeof l.lng === 'number')

  if (!apiKey) {
    return (
      <div className="rounded-2xl border flex flex-col items-center justify-center gap-2 text-xs text-gray-400"
        style={{ height, borderColor: '#E8DDD2', backgroundColor: '#FAF6F0' }}>
        <MapIcon size={20} />
        <p>Add VITE_GOOGLE_MAPS_API_KEY to enable the map</p>
      </div>
    )
  }
  if (loadError) {
    return <div className="rounded-2xl border flex items-center justify-center text-xs text-gray-400" style={{ height, borderColor: '#E8DDD2' }}>Map failed to load</div>
  }
  if (!isLoaded) {
    return <div className="rounded-2xl border animate-pulse" style={{ height, borderColor: '#E8DDD2', backgroundColor: '#FAF6F0' }} />
  }
  if (pins.length === 0) {
    return (
      <div className="rounded-2xl border flex items-center justify-center text-xs text-gray-400" style={{ height, borderColor: '#E8DDD2', backgroundColor: '#FAF6F0' }}>
        No location data for these listings yet
      </div>
    )
  }

  const center = { lat: pins[0].lat, lng: pins[0].lng }

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ height, borderColor: '#E8DDD2' }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={zoom}
        options={{ styles: MAP_STYLES, disableDefaultUI: true, zoomControl: true }}
      >
        {pins.map(l => (
          <Marker key={l.id} position={{ lat: l.lat, lng: l.lng }} onClick={() => setSelected(l)} />
        ))}
        {selected && (
          <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
            <div style={{ fontSize: 12, maxWidth: 160 }}>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>{selected.title}</p>
              {selected.price_cents != null && <p style={{ color: '#C96A3A' }}>₦{(selected.price_cents / 100).toLocaleString()}</p>}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  )
}
