import { useState, useEffect, useRef, useCallback } from 'react'
import ModelToolbar from './ModelToolbar'
import PlacedModelsList from './PlacedModelsList'
import { getTerrainInfo, getHeightmapElevation, generateWorld, getTerrainImageUrl, getModels } from '../lib/api'
import { pixelToWorld, worldToPixel } from '../lib/coordinateMapping'

export default function WorldBuilder({ onBack, onExport, initialModels = [] }) {
  const [terrainInfo, setTerrainInfo] = useState(null)
  const [placedModels, setPlacedModels] = useState(initialModels)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [activeModelName, setActiveModelName] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)
  const [modelCatalog, setModelCatalog] = useState({}) // name -> {bounds, ...}

  // Pan/zoom state
  const containerRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const load = async () => {
      try {
        const [terrainResult, modelsResult] = await Promise.all([
          getTerrainInfo(),
          getModels(),
        ])
        if (terrainResult.code === 200) {
          setTerrainInfo(terrainResult.terrain)
          // Add helipad at origin for fresh worlds (not loading existing)
          if (initialModels.length === 0) {
            setPlacedModels([{
              name: 'helipad',
              x: 0, y: 0, z: 0,
              roll: 0, pitch: 0, yaw: 0,
              bounds: null,
            }])
          }
        } else {
          setError('Failed to load terrain info: ' + (terrainResult.error || 'unknown'))
        }
        if (modelsResult.code === 200) {
          const catalog = {}
          for (const m of modelsResult.models) {
            catalog[m.name] = { bounds: m.bounds, display_name: m.display_name }
          }
          setModelCatalog(catalog)
        }
      } catch (err) {
        setError('Failed to connect to server: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleImageLoad = useCallback((e) => {
    const img = e.target
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight })

    const container = containerRef.current
    if (container) {
      const scaleX = container.clientWidth / img.naturalWidth
      const scaleY = container.clientHeight / img.naturalHeight
      const fitScale = Math.min(scaleX, scaleY) * 0.9
      setTransform({
        x: (container.clientWidth - img.naturalWidth * fitScale) / 2,
        y: (container.clientHeight - img.naturalHeight * fitScale) / 2,
        scale: fitScale,
      })
    }
  }, [])

  // Rotation drag state
  const [isRotating, setIsRotating] = useState(false)
  const rotateRef = useRef({ centerX: 0, centerY: 0 })

  // Model drag state
  const [isDraggingModel, setIsDraggingModel] = useState(false)

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y }
      return
    }

    if (e.button === 0 && activeModelName && terrainInfo && imageSize.width > 0) {
      const rect = containerRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const imgX = (mx - transform.x) / transform.scale
      const imgY = (my - transform.y) / transform.scale

      if (imgX < 0 || imgX > imageSize.width || imgY < 0 || imgY > imageSize.height) return

      const world = pixelToWorld(imgX, imgY, terrainInfo, imageSize.width, imageSize.height)

      const bounds = modelCatalog[activeModelName]?.bounds || null

      getHeightmapElevation(world.x, world.y).then(result => {
        const elevation = result.code === 200 ? result.z : 0
        const newModel = {
          name: activeModelName,
          x: Math.round(world.x * 100) / 100,
          y: Math.round(world.y * 100) / 100,
          z: Math.round(elevation * 100) / 100,
          roll: 0,
          pitch: 0,
          yaw: 0,
          bounds,
        }
        setPlacedModels(prev => {
          setSelectedIndex(prev.length)
          return [...prev, newModel]
        })
      }).catch(() => {
        const newModel = {
          name: activeModelName,
          x: Math.round(world.x * 100) / 100,
          y: Math.round(world.y * 100) / 100,
          z: 0,
          roll: 0,
          pitch: 0,
          yaw: 0,
          bounds,
        }
        setPlacedModels(prev => {
          setSelectedIndex(prev.length)
          return [...prev, newModel]
        })
      })
    }
  }, [activeModelName, terrainInfo, imageSize, transform, modelCatalog])

  const handleMouseMove = useCallback((e) => {
    if (isRotating && selectedIndex >= 0) {
      const dx = e.clientX - rotateRef.current.centerX
      const dy = e.clientY - rotateRef.current.centerY
      const angle = Math.atan2(dy, dx)
      setPlacedModels(prev => {
        const updated = [...prev]
        updated[selectedIndex] = { ...updated[selectedIndex], yaw: angle }
        return updated
      })
      return
    }
    if (isDraggingModel && selectedIndex >= 0 && terrainInfo && imageSize.width > 0) {
      const rect = containerRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const imgX = (mx - transform.x) / transform.scale
      const imgY = (my - transform.y) / transform.scale

      if (imgX >= 0 && imgX <= imageSize.width && imgY >= 0 && imgY <= imageSize.height) {
        const world = pixelToWorld(imgX, imgY, terrainInfo, imageSize.width, imageSize.height)
        setPlacedModels(prev => {
          const updated = [...prev]
          updated[selectedIndex] = {
            ...updated[selectedIndex],
            x: Math.round(world.x * 100) / 100,
            y: Math.round(world.y * 100) / 100,
          }
          return updated
        })
      }
      return
    }
    if (!isPanning) return
    setTransform(prev => ({
      ...prev,
      x: panStart.current.tx + (e.clientX - panStart.current.x),
      y: panStart.current.ty + (e.clientY - panStart.current.y),
    }))
  }, [isPanning, isRotating, isDraggingModel, selectedIndex, terrainInfo, imageSize, transform])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    setIsRotating(false)
    setIsDraggingModel(false)
  }, [])

  // Wheel zoom - attach directly to container div
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setTransform(prev => {
        const newScale = Math.max(0.01, Math.min(200, prev.scale * delta))
        const rect = container.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const ratio = newScale / prev.scale
        return {
          scale: newScale,
          x: mx - (mx - prev.x) * ratio,
          y: my - (my - prev.y) * ratio,
        }
      })
    }
    container.addEventListener('wheel', handler, { passive: false })
    return () => container.removeEventListener('wheel', handler)
  }, []) // no deps - setTransform is stable

  const handleRotate = useCallback((yaw) => {
    if (selectedIndex < 0) return
    setPlacedModels(prev => {
      const updated = [...prev]
      updated[selectedIndex] = { ...updated[selectedIndex], yaw }
      return updated
    })
  }, [selectedIndex])

  const handleDelete = useCallback((index) => {
    setPlacedModels(prev => prev.filter((_, i) => i !== index))
    setSelectedIndex(-1)
  }, [])

  const handleUpdateModel = useCallback((index, updates) => {
    setPlacedModels(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ...updates }
      return updated
    })
  }, [])

  const handleSnapToTerrain = async () => {
    const updated = [...placedModels]
    for (let i = 0; i < updated.length; i++) {
      try {
        const result = await getHeightmapElevation(updated[i].x, updated[i].y)
        if (result.code === 200) {
          updated[i] = { ...updated[i], z: Math.round(result.z * 100) / 100 }
        }
      } catch {}
    }
    setPlacedModels(updated)
  }

  const handleGenerateSDF = async () => {
    setGenerating(true)
    setGenerateResult(null)
    try {
      // Strip bounds from models before sending (not part of SDF)
      const modelsForSdf = placedModels.map(({ bounds, ...rest }) => rest)
      const result = await generateWorld(modelsForSdf)
      if (result.code === 200 && onExport) {
        onExport(result)
      } else {
        setGenerateResult(result)
      }
    } catch (err) {
      setGenerateResult({ code: 500, message: 'Failed to connect to server' })
    } finally {
      setGenerating(false)
    }
  }

  // Convert world coords to screen position + scale for model extent rendering
  const getMarkerProps = (model) => {
    if (!terrainInfo || imageSize.width === 0) return null
    const { px, py } = worldToPixel(model.x, model.y, terrainInfo, imageSize.width, imageSize.height)

    const screenX = transform.x + px * transform.scale
    const screenY = transform.y + py * transform.scale

    // Meters per pixel on the image
    const metersPerPixelX = terrainInfo.size_x / imageSize.width
    const metersPerPixelY = terrainInfo.size_y / imageSize.height

    return { screenX, screenY, metersPerPixelX, metersPerPixelY }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p>Loading terrain data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={onBack} className="px-6 py-2 bg-gray-700 rounded-lg">Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Left: Model Toolbar */}
      <ModelToolbar
        activeModelName={activeModelName}
        onSelectModel={setActiveModelName}
        onModelsLoaded={(models) => {
          const catalog = {}
          for (const m of models) {
            catalog[m.name] = { bounds: m.bounds, display_name: m.display_name }
          }
          setModelCatalog(catalog)
        }}
      />

      {/* Center: Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-gray-900 overflow-hidden select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: activeModelName ? 'crosshair' : isPanning ? 'grabbing' : 'grab' }}
      >
        {/* Satellite image */}
        {terrainInfo && (
          <img
            src={getTerrainImageUrl()}
            alt="Satellite terrain"
            draggable={false}
            onLoad={handleImageLoad}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: '0 0',
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              imageRendering: transform.scale > 2 ? 'pixelated' : 'auto',
            }}
          />
        )}

        {/* Model markers with extent rectangles */}
        {placedModels.map((model, idx) => {
          const props = getMarkerProps(model)
          if (!props) return null
          const { screenX, screenY, metersPerPixelX, metersPerPixelY } = props
          const isSelected = idx === selectedIndex
          // Use stored bounds, or look up from catalog as fallback
          const bounds = model.bounds || modelCatalog[model.name]?.bounds
          const hasBounds = bounds && bounds.x > 0 && bounds.y > 0

          // Size of extent rectangle in screen pixels
          let rectW = 12, rectH = 12
          if (hasBounds) {
            rectW = (bounds.x / metersPerPixelX) * transform.scale
            rectH = (bounds.y / metersPerPixelY) * transform.scale
            // Minimum visible size
            rectW = Math.max(rectW, 8)
            rectH = Math.max(rectH, 8)
          }

          return (
            <div
              key={idx}
              className="absolute pointer-events-auto"
              style={{
                left: screenX,
                top: screenY,
                zIndex: isSelected ? 20 : 10,
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                e.preventDefault()
                setSelectedIndex(idx)
                setIsDraggingModel(true)
              }}
            >
              {/* Extent rectangle (rotated by yaw) */}
              <div
                style={{
                  transform: `translate(-50%, -50%) rotate(${model.yaw * 180 / Math.PI}deg)`,
                  width: rectW,
                  height: rectH,
                }}
                className={`border-2 ${
                  isSelected
                    ? 'border-red-400 bg-red-500/30 cursor-move'
                    : 'border-cyan-400 bg-cyan-500/30 cursor-pointer'
                }`}
              >
                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow" />
                {/* Direction arrow */}
                <div
                  className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-0 h-0
                    border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px]"
                  style={{ borderLeftColor: isSelected ? '#f87171' : '#22d3ee' }}
                />
              </div>

              {/* Rotation handle line - only for selected model */}
              {isSelected && (() => {
                const lineLen = 40
                const endX = Math.cos(model.yaw) * lineLen
                const endY = Math.sin(model.yaw) * lineLen
                return (
                  <svg
                    style={{
                      position: 'absolute',
                      left: -lineLen - 4,
                      top: -lineLen - 4,
                      width: lineLen * 2 + 8,
                      height: lineLen * 2 + 8,
                      pointerEvents: 'none',
                      overflow: 'visible',
                    }}
                  >
                    {/* The line itself */}
                    <line
                      x1={lineLen + 4}
                      y1={lineLen + 4}
                      x2={lineLen + 4 + endX}
                      y2={lineLen + 4 + endY}
                      stroke="#facc15"
                      strokeWidth={3}
                      strokeLinecap="round"
                      style={{ pointerEvents: 'stroke', cursor: 'grab' }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setIsRotating(true)
                        rotateRef.current = { centerX: screenX, centerY: screenY }
                      }}
                    />
                    {/* Tip circle for easier grabbing */}
                    <circle
                      cx={lineLen + 4 + endX}
                      cy={lineLen + 4 + endY}
                      r={5}
                      fill="#facc15"
                      stroke="white"
                      strokeWidth={2}
                      style={{ pointerEvents: 'all', cursor: 'grab' }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setIsRotating(true)
                        rotateRef.current = { centerX: screenX, centerY: screenY }
                      }}
                    />
                  </svg>
                )
              })()}

              {/* Label */}
              <div
                className={`absolute whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded shadow pointer-events-none
                  ${isSelected ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-200'}`}
                style={{
                  top: Math.max(rectH / 2, 10) + 4,
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                {model.name}
                {hasBounds && <span className="text-gray-300 ml-1">({bounds.x}x{bounds.y}m)</span>}
              </div>
            </div>
          )
        })}

        {/* Active model placement hint */}
        {activeModelName && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-cyan-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
            Click on the map to place: <strong>{activeModelName}</strong>
            {modelCatalog[activeModelName]?.bounds && (
              <span className="ml-2 text-cyan-200">
                ({modelCatalog[activeModelName].bounds.x}m x {modelCatalog[activeModelName].bounds.y}m)
              </span>
            )}
            <button
              onClick={() => setActiveModelName(null)}
              className="ml-3 text-cyan-200 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Controls hint */}
        <div className="absolute bottom-16 left-4 z-10 text-gray-400 text-xs">
          Scroll to zoom | Right-drag to pan | Left-click to place
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm"
          >
            Back
          </button>

          <button
            onClick={handleSnapToTerrain}
            disabled={placedModels.length === 0}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
            title="Re-compute Z height for all models from the terrain heightmap"
          >
            Snap to Terrain
          </button>

          <div className="flex items-center gap-3">
            {generateResult && generateResult.code !== 200 && (
              <span className="text-sm text-red-400">{generateResult.message}</span>
            )}
            <button
              onClick={handleGenerateSDF}
              disabled={placedModels.length === 0 || generating}
              className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {generating ? 'Generating...' : `Generate World SDF (${placedModels.length} models)`}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Placed Models + Rotation */}
      <div className="w-72 bg-white h-full overflow-y-auto flex flex-col border-l">
        <PlacedModelsList
          models={placedModels}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onDelete={handleDelete}
          onUpdate={handleUpdateModel}
        />
        {selectedIndex >= 0 && selectedIndex < placedModels.length && (
          <div className="p-3 border-t">
            <div className="text-xs text-gray-500">
              Yaw: {Math.round(placedModels[selectedIndex].yaw * 180 / Math.PI)}°
              <span className="text-gray-400 ml-1">(drag yellow handle to rotate)</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
