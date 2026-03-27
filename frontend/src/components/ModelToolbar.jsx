import { useState, useEffect, useCallback, useRef } from 'react'
import { getModels, getThumbnailUrl, getModelPaths, updateModelPath, browseDirs } from '../lib/api'

export default function ModelToolbar({ activeModelName, onSelectModel, onModelsLoaded }) {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showPaths, setShowPaths] = useState(false)
  const [configuredPaths, setConfiguredPaths] = useState([])
  const [browsedDirs, setBrowsedDirs] = useState([])
  const [newPath, setNewPath] = useState('')
  const [pathError, setPathError] = useState('')
  const autoAddedRef = useRef(false)

  const loadModels = useCallback(() => {
    setLoading(true)
    getModels()
      .then(result => {
        if (result.code === 200) {
          setModels(result.models)
          if (onModelsLoaded) onModelsLoaded(result.models)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [onModelsLoaded])

  const loadPaths = useCallback(() => {
    getModelPaths().then(result => {
      if (result.code === 200) {
        setConfiguredPaths(result.configured)
      }
    }).catch(() => {})
  }, [])

  // On mount: auto-add all detected paths, then load models
  useEffect(() => {
    if (autoAddedRef.current) return
    autoAddedRef.current = true

    const init = async () => {
      // Get current state
      const pathsResult = await getModelPaths().catch(() => null)
      const configured = pathsResult?.configured || []
      const detected = pathsResult?.detected || []

      // Get workspace directories
      const browseResult = await browseDirs().catch(() => null)
      const workspaceDirs = browseResult?.directories || []
      setBrowsedDirs(workspaceDirs)

      // Auto-add any detected paths + workspace model dirs that aren't already configured
      const toAdd = []
      for (const p of detected) {
        if (!configured.includes(p)) toAdd.push(p)
      }
      for (const d of workspaceDirs) {
        if (!configured.includes(d.path) && !toAdd.includes(d.path)) toAdd.push(d.path)
      }

      for (const p of toAdd) {
        await updateModelPath(p, 'add').catch(() => {})
      }

      // Now load the final state
      loadPaths()
      loadModels()
    }
    init()
  }, [loadModels, loadPaths])

  const handleAddPath = async (path) => {
    setPathError('')
    const result = await updateModelPath(path, 'add')
    if (result.code === 200) {
      setConfiguredPaths(result.model_library_dirs)
      setNewPath('')
      loadModels()
    } else {
      setPathError(result.error || 'Failed to add path')
    }
  }

  const handleRemovePath = async (path) => {
    const result = await updateModelPath(path, 'remove')
    if (result.code === 200) {
      setConfiguredPaths(result.model_library_dirs)
      loadModels()
    }
  }

  const filtered = models.filter(m =>
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  // Dirs not yet added
  const unadded = browsedDirs.filter(d => !configuredPaths.includes(d.path))

  return (
    <div className="w-64 bg-gray-50 h-full overflow-y-auto border-r flex flex-col">
      <div className="p-3 border-b bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm text-gray-700">Model Library</h2>
          <button
            onClick={() => setShowPaths(!showPaths)}
            className="text-xs text-cyan-600 hover:text-cyan-800"
            title="Manage model directories"
          >
            {showPaths ? 'Hide' : 'Dirs'}
          </button>
        </div>

        {showPaths && (
          <div className="mb-2 p-2 bg-gray-100 rounded text-xs space-y-2">
            <div className="font-medium text-gray-600">Active directories:</div>
            {configuredPaths.length === 0 ? (
              <p className="text-gray-400 italic">None configured</p>
            ) : (
              configuredPaths.map(p => (
                <div key={p} className="flex items-center justify-between gap-1">
                  <span className="truncate text-gray-700" title={p}>
                    {p.split('/').slice(-2).join('/')}
                  </span>
                  <button
                    onClick={() => handleRemovePath(p)}
                    className="text-red-400 hover:text-red-600 shrink-0"
                  >
                    x
                  </button>
                </div>
              ))
            )}

            {/* Available directories not yet added */}
            {unadded.length > 0 && (
              <>
                <div className="font-medium text-gray-600 mt-2">Available:</div>
                {unadded.map(d => (
                  <div key={d.path} className="flex items-center justify-between gap-1">
                    <span className="truncate text-gray-500" title={d.path}>
                      {d.label}
                    </span>
                    <button
                      onClick={() => handleAddPath(d.path)}
                      className="text-green-500 hover:text-green-700 shrink-0 font-bold"
                    >
                      +
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Manual path entry */}
            <div className="flex gap-1 mt-1">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/path/to/models"
                className="flex-1 min-w-0 px-1.5 py-1 border rounded text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPath.trim()) handleAddPath(newPath.trim())
                }}
              />
              <button
                onClick={() => newPath.trim() && handleAddPath(newPath.trim())}
                className="px-2 py-1 bg-cyan-500 text-white rounded text-xs hover:bg-cyan-600 shrink-0"
              >
                Add
              </button>
            </div>
            {pathError && <p className="text-red-500">{pathError}</p>}
          </div>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models..."
          className="w-full px-2 py-1.5 border rounded text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-sm text-gray-400 p-2">Loading models...</p>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-gray-400 p-2">
            {models.length === 0 ? (
              <>
                <p>No models found.</p>
                <p className="mt-1">
                  Click <button onClick={() => setShowPaths(true)} className="text-cyan-600 underline">Dirs</button> above
                  to add a model directory.
                </p>
              </>
            ) : (
              'No matches.'
            )}
          </div>
        ) : (
          filtered.map(model => (
            <button
              key={model.name}
              onClick={() => onSelectModel(activeModelName === model.name ? null : model.name)}
              className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                activeModelName === model.name
                  ? 'bg-cyan-100 border-2 border-cyan-500'
                  : 'hover:bg-gray-100 border-2 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                {model.thumbnail ? (
                  <img
                    src={getThumbnailUrl(model.name)}
                    alt=""
                    className="w-10 h-10 rounded object-cover bg-gray-200"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                    3D
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">{model.display_name}</div>
                  {model.bounds && (
                    <div className="text-xs text-gray-400">
                      {model.bounds.x}m x {model.bounds.y}m
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="p-2 border-t text-xs text-gray-400 text-center">
        {models.length} models from {configuredPaths.length} dirs
      </div>
    </div>
  )
}
