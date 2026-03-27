import { useState, useEffect } from 'react'
import { configure, getConfig } from '../lib/api'

export default function ConfigScreen({ onConfigured }) {
  const [mapboxKey, setMapboxKey] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [modelLibraryDir, setModelLibraryDir] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getConfig().then(config => {
      if (config.mapbox_key) setMapboxKey(config.mapbox_key)
      if (config.output_dir) setOutputDir(config.output_dir)
      if (config.model_library_dir) setModelLibraryDir(config.model_library_dir)
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await configure({
        mapbox_key: mapboxKey,
        output_dir: outputDir || undefined,
        model_library_dir: modelLibraryDir || undefined,
      })

      if (result.code === 200) {
        onConfigured(mapboxKey)
      } else {
        setError(result.errors?.join(', ') || 'Configuration failed')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Gazebo World Builder
        </h1>
        <p className="text-gray-500 mb-6">
          Configure your environment to get started.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mapbox API Key *
            </label>
            <input
              type="text"
              value={mapboxKey}
              onChange={(e) => setMapboxKey(e.target.value)}
              placeholder="pk.eyJ1..."
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Get a free key at{' '}
              <a
                href="https://account.mapbox.com/auth/signup/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 underline"
              >
                mapbox.com
              </a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Output Directory
            </label>
            <input
              type="text"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder="Leave blank for default (./output)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Library Directory
            </label>
            <input
              type="text"
              value={modelLibraryDir}
              onChange={(e) => setModelLibraryDir(e.target.value)}
              placeholder="/path/to/gazebo/models"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Directory containing Gazebo model folders (each with model.config)
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !mapboxKey}
            className="w-full py-3 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Validating...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  )
}
