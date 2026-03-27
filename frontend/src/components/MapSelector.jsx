import { useState, useRef, useEffect, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { startDownload, downloadTile, endDownload, getTaskStatus } from '../lib/api'

const TILE_SOURCES = {
  "Bing Maps Satellite": "http://ecn.t0.tiles.virtualearth.net/tiles/a{quad}.jpeg?g=129&mkt=en&stl=H",
  "Google Maps Satellite": "https://mt0.google.com/vt?lyrs=s&x={x}&s=&y={y}&z={z}",
  "Google Maps Hybrid": "https://mt0.google.com/vt?lyrs=h&x={x}&s=&y={y}&z={z}",
  "Open Street Maps": "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "ESRI World Imagery": "http://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
}

function long2tile(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom))
}

function lat2tile(lat, zoom) {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))
}

function tile2long(x, z) {
  return x / Math.pow(2, z) * 360 - 180
}

function tile2lat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z)
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

function generateQuadKey(x, y, z) {
  const quadKey = []
  for (let i = z; i > 0; i--) {
    let digit = 0
    const mask = 1 << (i - 1)
    if ((x & mask) !== 0) digit++
    if ((y & mask) !== 0) digit += 2
    quadKey.push(digit.toString())
  }
  return quadKey.join('')
}

// Compute a tile-snapped square region centered on a lat/lng
function computeRegion(centerLng, centerLat, tileSize, zoom) {
  const centerTileX = long2tile(centerLng, zoom)
  const centerTileY = lat2tile(centerLat, zoom)

  const half = Math.floor(tileSize / 2)
  const startX = centerTileX - half
  const startY = centerTileY - half

  const west = tile2long(startX, zoom)
  const north = tile2lat(startY, zoom)
  const east = tile2long(startX + tileSize, zoom)
  const south = tile2lat(startY + tileSize, zoom)

  return {
    bounds: [west, south, east, north],  // [west, south, east, north]
    tileCount: tileSize * tileSize,
    tileStartX: startX,
    tileStartY: startY,
    tileSize,
  }
}

export default function MapSelector({ mapboxKey, modelName: initialModelName, onTerrainGenerated, onBack }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  const [zoomLevel, setZoomLevel] = useState(17)
  const [tileSize, setTileSize] = useState(4)
  const [source, setSource] = useState(Object.values(TILE_SOURCES)[0])
  const [modelName, setModelName] = useState(initialModelName || '')
  const [threads, setThreads] = useState(4)
  const [regionPlaced, setRegionPlaced] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [logs, setLogs] = useState([])
  const [generationStatus, setGenerationStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('UK')
  const [tileInfo, setTileInfo] = useState('')

  const regionRef = useRef(null) // { bounds, center }
  const launchLocationRef = useRef(null)

  const addLog = useCallback((msg) => {
    setLogs(prev => [...prev, msg])
  }, [])

  // Update the rectangle overlay on the map
  const updateRegionOverlay = useCallback((bounds) => {
    const map = mapRef.current
    if (!map) return

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [bounds[0], bounds[1]], // SW
          [bounds[2], bounds[1]], // SE
          [bounds[2], bounds[3]], // NE
          [bounds[0], bounds[3]], // NW
          [bounds[0], bounds[1]], // close
        ]],
      },
    }

    const source = map.getSource('region')
    if (source) {
      source.setData(geojson)
    } else {
      map.addSource('region', { type: 'geojson', data: geojson })
      map.addLayer({
        id: 'region-fill',
        type: 'fill',
        source: 'region',
        paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'region-outline',
        type: 'line',
        source: 'region',
        paint: { 'line-color': '#06b6d4', 'line-width': 2 },
      })
    }

    // Also show tile grid
    const zoom = zoomLevel
    const TY = lat2tile(bounds[3], zoom)
    const LX = long2tile(bounds[0], zoom)
    const BY = lat2tile(bounds[1], zoom)
    const RX = long2tile(bounds[2], zoom)

    const gridLines = { type: 'FeatureCollection', features: [] }
    // Vertical lines
    for (let x = LX; x <= RX + 1; x++) {
      const lng = tile2long(x, zoom)
      gridLines.features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[lng, bounds[1]], [lng, bounds[3]]] },
      })
    }
    // Horizontal lines
    for (let y = TY; y <= BY + 1; y++) {
      const lat = tile2lat(y, zoom)
      gridLines.features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[bounds[0], lat], [bounds[2], lat]] },
      })
    }

    const gridSource = map.getSource('tile-grid')
    if (gridSource) {
      gridSource.setData(gridLines)
    } else {
      map.addSource('tile-grid', { type: 'geojson', data: gridLines })
      map.addLayer({
        id: 'tile-grid-lines',
        type: 'line',
        source: 'tile-grid',
        paint: { 'line-color': '#f97316', 'line-width': 1, 'line-opacity': 0.5 },
      })
    }
  }, [zoomLevel])

  // Place/update region at a point
  const placeRegion = useCallback((lng, lat) => {
    const region = computeRegion(lng, lat, tileSize, zoomLevel)
    regionRef.current = { bounds: region.bounds, center: [lng, lat] }
    launchLocationRef.current = [
      (region.bounds[0] + region.bounds[2]) / 2,
      (region.bounds[1] + region.bounds[3]) / 2,
    ]

    updateRegionOverlay(region.bounds)
    setRegionPlaced(true)
    setTileInfo(`${region.tileCount} tiles (${tileSize}x${tileSize})`)

    // Update or create launch marker
    const map = mapRef.current
    if (markerRef.current) {
      markerRef.current.setLngLat(launchLocationRef.current)
    } else {
      const el = document.createElement('div')
      el.style.cssText = 'width:32px;height:32px;background:#ef4444;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;cursor:move;box-shadow:0 2px 8px rgba(0,0,0,0.3)'
      el.textContent = 'H'

      const marker = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat(launchLocationRef.current)
        .addTo(map)

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat()
        const b = regionRef.current.bounds
        const newLng = Math.min(Math.max(lngLat.lng, b[0]), b[2])
        const newLat = Math.min(Math.max(lngLat.lat, b[1]), b[3])
        marker.setLngLat([newLng, newLat])
        launchLocationRef.current = [newLng, newLat]
      })

      markerRef.current = marker
    }
  }, [tileSize, zoomLevel, updateRegionOverlay])

  // Initialize map
  useEffect(() => {
    mapboxgl.accessToken = mapboxKey
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [-1.5, 54.0],
      zoom: 6,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-left')
    mapRef.current = map

    // Click to place region
    map.on('click', (e) => {
      placeRegion(e.lngLat.lng, e.lngLat.lat)
    })

    return () => map.remove()
  }, [mapboxKey]) // placeRegion intentionally excluded - we use the ref pattern

  // Re-place region when tile size or zoom changes (if region already placed)
  useEffect(() => {
    if (regionRef.current) {
      placeRegion(regionRef.current.center[0], regionRef.current.center[1])
    }
  }, [tileSize, zoomLevel, placeRegion])

  const handleSearch = (e) => {
    e.preventDefault()
    const map = mapRef.current
    if (!map) return

    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxKey}`)
      .then(r => r.json())
      .then(data => {
        if (data.features?.[0]) {
          const [lng, lat] = data.features[0].center
          map.flyTo({ center: [lng, lat], zoom: 14 })
        }
      })
  }

  const handleGenerate = async () => {
    if (!regionRef.current) return

    const name = modelName || Date.now().toString()
    setDownloading(true)
    setLogs([])
    setProgress({ current: 0, total: 0 })
    setGenerationStatus('')

    const bounds = regionRef.current.bounds
    const zoom = zoomLevel

    const TY = lat2tile(bounds[3], zoom) // north
    const LX = long2tile(bounds[0], zoom) // west
    const BY = lat2tile(bounds[1], zoom)  // south
    const RX = long2tile(bounds[2], zoom) // east

    const tiles = []
    for (let y = TY; y <= BY; y++) {
      for (let x = LX; x <= RX; x++) {
        tiles.push({ x, y, z: zoom })
      }
    }

    setProgress({ current: 0, total: tiles.length })

    const timestamp = Date.now().toString()
    const outputDirectory = name
    const outputFile = '{z}/{x}/{y}.png'
    const boundsArray = [[bounds[0], bounds[1]], [bounds[2], bounds[3]]]
    const centerArray = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    const launchLocation = launchLocationRef.current || centerArray

    const startData = new FormData()
    startData.append('maxZoom', zoom)
    startData.append('outputDirectory', outputDirectory)
    startData.append('outputFile', outputFile)
    startData.append('outputType', 'png')
    startData.append('outputScale', '1')
    startData.append('source', source)
    startData.append('timestamp', timestamp)
    startData.append('bounds', boundsArray.flat().join(','))
    startData.append('center', centerArray.join(','))
    startData.append('launchLocation', launchLocation.join(','))
    startData.append('area', '0')

    await startDownload(startData)

    let completed = 0
    const concurrency = threads

    const downloadNext = async (index) => {
      if (index >= tiles.length) return
      const tile = tiles[index]

      const data = new FormData()
      data.append('x', tile.x)
      data.append('y', tile.y)
      data.append('z', tile.z)
      data.append('quad', generateQuadKey(tile.x, tile.y, tile.z))
      data.append('outputDirectory', outputDirectory)
      data.append('outputFile', outputFile)
      data.append('outputType', 'png')
      data.append('outputScale', '1')
      data.append('timestamp', timestamp)
      data.append('source', source)
      data.append('bounds', boundsArray.flat().join(','))
      data.append('center', centerArray.join(','))
      data.append('launchLocation', launchLocation.join(','))
      data.append('area', '0')

      try {
        const result = await downloadTile(data)
        completed++
        setProgress({ current: completed, total: tiles.length })
        addLog(`${tile.x},${tile.y},${tile.z} : ${result.message}`)
      } catch {
        addLog(`${tile.x},${tile.y},${tile.z} : Error`)
      }
    }

    const queue = [...Array(tiles.length).keys()]
    const workers = Array(Math.min(concurrency, tiles.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const idx = queue.shift()
        if (idx !== undefined) await downloadNext(idx)
      }
    })
    await Promise.all(workers)

    addLog('Starting world generation...')
    setGenerationStatus('generating')

    const endData = new FormData()
    endData.append('outputDirectory', outputDirectory)
    endData.append('outputFile', outputFile)
    endData.append('maxZoom', zoom)
    endData.append('timestamp', timestamp)
    endData.append('bounds', boundsArray.flat().join(','))

    await endDownload(endData)

    const poll = async () => {
      try {
        const status = await getTaskStatus()
        if (status.message?.status === 'completed') {
          addLog('Terrain generation complete!')
          setGenerationStatus('completed')
        } else if (status.message?.status === 'failed') {
          addLog('Generation failed: ' + (status.message?.error || 'Unknown error'))
          setGenerationStatus('failed')
        } else {
          addLog('Generating...')
          setTimeout(poll, 3000)
        }
      } catch {
        setTimeout(poll, 3000)
      }
    }
    poll()
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className="h-full flex">
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />
        <div className="absolute top-4 left-4 z-10 text-white text-2xl font-bold uppercase tracking-wide drop-shadow-lg">
          Gazebo World Builder
        </div>
        {!downloading && !regionPlaced && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-gray-800/80 text-white px-4 py-2 rounded-lg text-sm">
            Click on the map to place a region
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-80 bg-white h-full overflow-y-auto p-5 flex flex-col">
        {!downloading ? (
          <>
            {/* Back */}
            <button
              onClick={onBack}
              className="text-sm text-gray-400 hover:text-gray-600 mb-3"
            >
              &larr; Back to Home
            </button>

            {/* Step 1: Search */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 bg-cyan-500 rounded-full text-white text-sm font-bold flex items-center justify-center">1</span>
                <span className="font-semibold">Search an Area</span>
              </div>
              <form onSubmit={handleSearch} className="ml-9">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter a location"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </form>
            </div>

            {/* Step 2: Region */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 bg-cyan-500 rounded-full text-white text-sm font-bold flex items-center justify-center">2</span>
                <span className="font-semibold">Select Region</span>
              </div>
              <div className="ml-9 space-y-3">
                <p className="text-xs text-gray-500">Click the map to place the region center, then adjust the size below.</p>
                <div>
                  <label className="text-xs text-gray-500">Region Size (tiles per side)</label>
                  <input
                    type="range"
                    min={1}
                    max={16}
                    value={tileSize}
                    onChange={(e) => setTileSize(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>1</span>
                    <span className="font-medium text-gray-600">{tileSize}x{tileSize} = {tileSize * tileSize} tiles</span>
                    <span>16</span>
                  </div>
                </div>
                {tileInfo && (
                  <div className="text-xs text-cyan-600 font-medium">{tileInfo}</div>
                )}
              </div>
            </div>

            {/* Step 3: Configure */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 bg-cyan-500 rounded-full text-white text-sm font-bold flex items-center justify-center">3</span>
                <span className="font-semibold">Configure</span>
              </div>
              <div className="ml-9 space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Zoom Level</label>
                  <input
                    id="zoom-input"
                    type="number"
                    value={zoomLevel}
                    onChange={(e) => setZoomLevel(parseInt(e.target.value) || 17)}
                    min={1}
                    max={20}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Tile Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {Object.entries(TILE_SOURCES).map(([name, url]) => (
                      <option key={name} value={url}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Step 4: Output */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 bg-cyan-500 rounded-full text-white text-sm font-bold flex items-center justify-center">4</span>
                <span className="font-semibold">Settings</span>
              </div>
              <div className="ml-9 space-y-3">
                {modelName && (
                  <div className="text-xs text-gray-500">
                    World name: <span className="font-medium text-gray-700">{modelName}</span>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500">Parallel Downloads</label>
                  <input
                    type="number"
                    value={threads}
                    onChange={(e) => setThreads(parseInt(e.target.value) || 4)}
                    min={1}
                    max={16}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Generate button */}
            <div className="mt-auto">
              <button
                onClick={handleGenerate}
                disabled={!regionPlaced}
                className="w-full py-3 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Terrain
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Download progress */}
            <div className="flex items-center gap-2 mb-4">
              <span className="w-7 h-7 bg-cyan-500 rounded-full text-white text-sm font-bold flex items-center justify-center">5</span>
              <span className="font-semibold">Generating World</span>
            </div>

            <div className="text-center mb-4">
              <div className="relative w-24 h-24 mx-auto">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#eee" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="45" fill="none"
                    stroke="#20bf6b" strokeWidth="8"
                    strokeDasharray={`${progressPercent * 2.83} 283`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xl font-bold">
                  {progressPercent}%
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {progress.current} of {progress.total} tiles
              </p>
            </div>

            <div className="flex-1 min-h-0 mb-4">
              <textarea
                readOnly
                value={logs.join('\n')}
                className="w-full h-full border rounded-lg p-2 text-xs font-mono resize-none"
                ref={(el) => el && (el.scrollTop = el.scrollHeight)}
              />
            </div>

            {generationStatus === 'completed' ? (
              <button
                onClick={onTerrainGenerated}
                className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700"
              >
                Open World Builder
              </button>
            ) : generationStatus === 'failed' ? (
              <button
                onClick={() => setDownloading(false)}
                className="w-full py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600"
              >
                Back
              </button>
            ) : (
              <button
                onClick={() => setDownloading(false)}
                className="w-full py-3 bg-red-100 text-red-700 font-semibold rounded-lg hover:bg-red-200"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
