import { useState, useEffect } from 'react'
import { configure, listTerrains, loadTerrain } from '../lib/api'

export default function HomePage({ mapboxKey: initialKey, onCreateNew, onLoadExisting }) {
  const [mapboxKey, setMapboxKey] = useState(initialKey || '')
  const [modelName, setModelName] = useState('')
  const [terrains, setTerrains] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTerrain, setLoadingTerrain] = useState(null)
  const [error, setError] = useState('')
  const [configError, setConfigError] = useState('')

  useEffect(() => {
    listTerrains()
      .then(result => {
        if (result.code === 200) setTerrains(result.terrains)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCreateNew = async () => {
    if (!mapboxKey.trim()) {
      setConfigError('Mapbox API key is required')
      return
    }
    setConfigError('')

    // Configure the key if it changed
    if (mapboxKey !== initialKey) {
      const result = await configure({ mapbox_key: mapboxKey })
      if (result.code !== 200) {
        setConfigError(result.errors?.join(', ') || 'Invalid key')
        return
      }
    }

    onCreateNew(mapboxKey, modelName)
  }

  const handleLoadTerrain = async (name) => {
    setLoadingTerrain(name)
    setError('')
    try {
      const result = await loadTerrain(name)
      if (result.code === 200) {
        onLoadExisting(result.placed_models)
      } else {
        setError(result.error || 'Failed to load terrain')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoadingTerrain(null)
    }
  }

  return (
    <div className="h-full bg-gray-900 flex items-center justify-center">
      <div className="w-full max-w-2xl mx-4">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">
          Gazebo World Builder
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Generate Gazebo terrain from satellite imagery and place models
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create New */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Create New World</h2>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mapbox API Key</label>
                <input
                  type="text"
                  value={mapboxKey}
                  onChange={(e) => setMapboxKey(e.target.value)}
                  placeholder="pk.eyJ1..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get a free key at{' '}
                  <a href="https://account.mapbox.com/auth/signup/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">
                    mapbox.com
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">World Name</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="my_world (auto-generated if blank)"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {configError && (
              <p className="text-red-400 text-sm mb-3">{configError}</p>
            )}

            <button
              onClick={handleCreateNew}
              disabled={!mapboxKey.trim()}
              className="w-full py-3 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Select Map Region
            </button>
          </div>

          {/* Load Existing */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Open Existing World</h2>

            {error && (
              <p className="text-red-400 text-sm mb-3">{error}</p>
            )}

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {loading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : terrains.length === 0 ? (
                <p className="text-gray-500 text-sm">No existing worlds found. Create one first.</p>
              ) : (
                terrains.map(t => (
                  <button
                    key={t.name}
                    onClick={() => handleLoadTerrain(t.name)}
                    disabled={loadingTerrain !== null}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-gray-700 disabled:opacity-50 flex items-center justify-between group"
                  >
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{t.name}</div>
                      <div className="text-xs text-gray-500">
                        {t.has_world_sdf ? 'World SDF' : 'Terrain only'}
                      </div>
                    </div>
                    <span className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0 ml-2">
                      {loadingTerrain === t.name ? 'Loading...' : 'Open'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
