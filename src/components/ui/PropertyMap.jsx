import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
  Circle,
} from '@react-google-maps/api'
import { Building2, GraduationCap, Landmark, Loader, Map, MapPin, Search, ShoppingBag } from 'lucide-react'
import clsx from 'clsx'

const LIBRARIES = ['places', 'geometry']

const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#F7F4ED' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#1F2B24' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7F4ED' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#C85F2D' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#647068' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E8F0E9' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7A9E7E' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#F5EFE8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F5EFE8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E8C4A0' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#F5EFE8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C5D8E8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#647068' }] },
]

const AMENITY_TYPES = [
  { type: 'school',        label: 'Schools',   icon: <GraduationCap size={14} className="text-white" />, color: '#7A9E7E' },
  { type: 'hospital',      label: 'Hospitals', icon: <Building2 size={14} className="text-white" />, color: '#C85F2D' },
  { type: 'shopping_mall', label: 'Shopping',  icon: <ShoppingBag size={14} className="text-white" />, color: '#D4A853' },
  { type: 'bank',          label: 'Banks',     icon: <Landmark size={14} className="text-white" />, color: '#1F2B24' },
]

const formatPrice = (n) => {
  if (!n) return ''
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  return `₦${(n / 1_000).toFixed(0)}K`
}

// ─── No API key fallback ──────────────────────────────────
function MapPlaceholder({ message = 'Map unavailable' }) {
  return (
    <div className="flex items-center justify-center bg-cream rounded-3xl border border-deep/8" style={{ height: '360px' }}>
      <div className="text-center text-deep/30">
        <div className="flex justify-center mb-3"><Map size={40} className="text-terracotta" /></div>
        <p className="text-sm font-medium">{message}</p>
        <p className="text-xs mt-1">Add VITE_GOOGLE_MAPS_API_KEY to enable maps</p>
      </div>
    </div>
  )
}

// ─── Single property map ──────────────────────────────────
export function PropertyMap({ property, height = '360px', hasConfirmedInspection = false }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  })

  const [selected, setSelected]     = useState(null)
  const [amenities, setAmenities]   = useState([])
  const [activeType, setActiveType] = useState(null)
  const [loadingPOI, setLoadingPOI] = useState(false)
  const mapRef = useRef(null)

  const lat = property?.latitude  || 6.5244
  const lng = property?.longitude || 3.3792
  const center = { lat, lng }

  const onLoad = useCallback((map) => { mapRef.current = map }, [])

  const fetchAmenities = (type) => {
    if (!mapRef.current || !window.google) return
    if (activeType === type) { setAmenities([]); setActiveType(null); return }
    setLoadingPOI(true)
    setActiveType(type)
    const service = new window.google.maps.places.PlacesService(mapRef.current)
    service.nearbySearch(
      { location: center, radius: 2000, type },
      (results, status) => {
        setLoadingPOI(false)
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          setAmenities(results.slice(0, 8))
        }
      }
    )
  }

  if (!apiKey) return <MapPlaceholder />
  if (loadError) return <MapPlaceholder message="Map failed to load" />
  if (!isLoaded) return (
    <div className="flex items-center justify-center bg-cream rounded-3xl" style={{ height }}>
      <div className="flex flex-col items-center gap-3 text-deep/30">
        <Loader size={24} className="animate-spin" />
        <p className="text-sm">Loading map...</p>
      </div>
    </div>
  )

  const amenityConfig = AMENITY_TYPES.find(a => a.type === activeType)

  return (
    <div className="rounded-3xl overflow-hidden border border-deep/8 shadow-sm">
      {/* Filter buttons */}
      <div className="bg-white px-4 py-3 flex items-center gap-2 border-b border-deep/8 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}>
        <span className="text-xs font-bold text-deep/30 uppercase tracking-wider mr-1 flex-shrink-0">Nearby:</span>
        {AMENITY_TYPES.map(a => (
          <button key={a.type} onClick={() => fetchAmenities(a.type)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0',
              activeType === a.type ? 'bg-terracotta text-white' : 'bg-deep/5 text-deep/60 hover:bg-deep/10'
            )}>
            {loadingPOI && activeType === a.type
              ? <Loader size={10} className="animate-spin" />
              : <span>{a.icon}</span>}
            {a.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <GoogleMap
        mapContainerStyle={{ width: '100%', height }}
        center={center}
        zoom={hasConfirmedInspection ? 15 : 13}
        onLoad={onLoad}
        options={{
          styles: MAP_STYLES,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: hasConfirmedInspection,
          fullscreenControl: true,
          clickableIcons: false,
        }}
      >
      {/* Property pin - only shown after confirmed inspection */}
        {hasConfirmedInspection ? (
          <Marker
            position={center}
            onClick={() => setSelected('property')}
            icon={window.google ? {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#C85F2D',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
              scale: 14,
            } : undefined}
          />
        ) : (
          /* Masked: show only a broad area circle, no precise pin */
          <Circle center={center} radius={600} options={{
            fillColor: '#C85F2D', fillOpacity: 0.10,
            strokeColor: '#C85F2D', strokeOpacity: 0.35, strokeWeight: 2,
          }} />
        )}

        {/* Radius */}
        <Circle center={center} radius={2000} options={{
          fillColor: '#C85F2D', fillOpacity: 0.04,
          strokeColor: '#C85F2D', strokeOpacity: 0.2, strokeWeight: 1,
        }} />

        {/* Amenity markers */}
        {amenities.map((place, i) => (
          <Marker key={place.place_id || i}
            position={place.geometry.location}
            onClick={() => setSelected(place)}
            icon={window.google ? {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: amenityConfig?.color || '#7A9E7E',
              fillOpacity: 0.9,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
              scale: 8,
            } : undefined}
          />
        ))}

        {/* Property info window */}
        {selected === 'property' && (
          <InfoWindow position={center} onCloseClick={() => setSelected(null)}>
            <div className="p-1 max-w-[180px]">
              <p className="font-bold text-deep text-sm">{property?.title}</p>
              <p className="text-terracotta font-black text-base">{formatPrice(property?.price)}</p>
              <p className="text-deep/50 text-xs mt-1">{property?.city}, {property?.state}</p>
            </div>
          </InfoWindow>
        )}

        {/* Amenity info window */}
        {selected && selected !== 'property' && typeof selected === 'object' && (
          <InfoWindow
            position={selected.geometry.location}
            onCloseClick={() => setSelected(null)}
          >
            <div className="p-1 max-w-[160px]">
              <p className="font-semibold text-deep text-xs">{selected.name}</p>
              {selected.rating && (
                <p className="text-xs text-deep/50 mt-0.5">⭐ {selected.rating}</p>
              )}
              {selected.vicinity && (
                <p className="text-xs text-deep/40 mt-0.5">{selected.vicinity}</p>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Footer */}
      <div className="bg-white px-4 py-2.5 flex items-center justify-between border-t border-deep/8">
        <div className="flex items-center gap-1.5 text-xs text-deep/40">
          <div className="w-3 h-3 rounded-full bg-terracotta" />
          <span>{property?.city}, {property?.state}</span>
        </div>
        {!hasConfirmedInspection && (
          <p className="text-xs font-semibold" style={{color:'#C85F2D'}}>
            Exact address revealed after confirmed inspection
          </p>
        )}
        {activeType && amenities.length > 0 && hasConfirmedInspection && (
          <p className="text-xs text-deep/40">{amenities.length} {amenityConfig?.label} within 2km</p>
        )}
      </div>
    </div>
  )
}

// ─── Map Explorer: all listings ─────────────────────────
export function MapExplorer({ properties = [], onSelectProperty }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const navigate = useNavigate()

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  })

  const [selected, setSelected] = useState(null)
  const center = { lat: 9.0820, lng: 8.6753 } // Nigeria center

  if (!apiKey) return <MapPlaceholder message="Map Explorer unavailable: add Google Maps API key" />
  if (loadError) return <MapPlaceholder message="Map failed to load" />
  if (!isLoaded) return (
    <div className="flex items-center justify-center bg-cream rounded-3xl h-[400px]">
      <div className="flex flex-col items-center gap-3 text-deep/30">
        <Loader size={24} className="animate-spin" />
        <p className="text-sm">Loading map explorer...</p>
      </div>
    </div>
  )

  return (
    <div className="rounded-3xl overflow-hidden border border-deep/8 shadow-card">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '400px' }}
        center={center}
        zoom={6}
        options={{
          styles: MAP_STYLES,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        }}
      >
        {properties.map((property, i) => {
          const lat = property.latitude  || (6.5244 + (Math.random() - 0.5) * 8)
          const lng = property.longitude || (3.3792 + (Math.random() - 0.5) * 8)
          return (
            <Marker key={property.id || i}
              position={{ lat, lng }}
              onClick={() => setSelected(property)}
              icon={window.google ? {
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: '#C85F2D',
                fillOpacity: 0.9,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
                scale: 10,
              } : undefined}
            />
          )
        })}

        {selected && (
          <InfoWindow
            position={{
              lat: selected.latitude || 6.5244,
              lng: selected.longitude || 3.3792,
            }}
            onCloseClick={() => setSelected(null)}
          >
            <div className="p-2 max-w-[200px] cursor-pointer"
              onClick={() => {
                onSelectProperty?.(selected)
                setSelected(null)
                if (selected.id) navigate(`/property/${selected.id}`)
              }}>
              <p className="font-bold text-deep text-sm leading-tight">{selected.title}</p>
              <p className="text-terracotta font-black text-base mt-1">{formatPrice(selected.price)}</p>
              <p className="text-xs text-deep/50 mt-0.5">{selected.city}, {selected.state}</p>
              <div className="mt-2 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full" style={{backgroundColor:"#C85F2D", color:"#FFFFFF", display:"inline-flex"}}>
                View Property →
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  )
}

// ─── Location autocomplete input ─────────────────────────
export function LocationInput({ value, onChange, placeholder = 'Search location...' }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  })

  const [suggestions, setSuggestions]   = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleInput = (e) => {
    const val = e.target.value
    onChange(val)
    if (!isLoaded || !window.google || val.length < 3) { setSuggestions([]); return }
    const service = new window.google.maps.places.AutocompleteService()
    service.getPlacePredictions(
      { input: val, componentRestrictions: { country: 'ng' } },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          setSuggestions(predictions || [])
          setShowSuggestions(true)
        }
      }
    )
  }

  return (
    <div className="relative">
      <input
        className="input"
        type="text"
        value={value}
        onChange={handleInput}
        placeholder={placeholder}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-2xl shadow-card-hover overflow-hidden border border-deep/8">
          {suggestions.map(s => (
            <button key={s.place_id} type="button"
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cream transition-colors text-left border-b border-deep/5 last:border-0"
              onMouseDown={() => {
                onChange(s.description)
                setSuggestions([])
                setShowSuggestions(false)
              }}>
              <MapPin size={14} className="text-terracotta flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-deep">{s.structured_formatting.main_text}</p>
                <p className="text-xs text-deep/40">{s.structured_formatting.secondary_text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
