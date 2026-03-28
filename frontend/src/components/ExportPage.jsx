import { useState, useEffect } from 'react'
import { launchGazebo, getExportTargets, exportWorld } from '../lib/api'

export default function ExportPage({ generateResult, onBack, onBackToHome }) {
  const [launching, setLaunching] = useState(false)
  const [launchResult, setLaunchResult] = useState(null)
  const [copied, setCopied] = useState(false)

  // Export state
  const [targets, setTargets] = useState([])
  const [worldsDir, setWorldsDir] = useState('')
  const [modelsDir, setModelsDir] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState(null)
  const [customWorldsDir, setCustomWorldsDir] = useState('')

  useEffect(() => {
    getExportTargets().then(result => {
      if (result.code === 200) {
        setTargets(result.targets)
      }
    }).catch((err) => console.warn('Failed to load export targets:', err))
  }, [])

  const worldsTargets = targets.filter(t => t.type === 'worlds')
  const modelsTargets = targets.filter(t => t.type === 'models')

  const handleLaunch = async () => {
    setLaunching(true)
    setLaunchResult(null)
    try {
      const result = await launchGazebo()
      setLaunchResult(result)
    } catch (err) {
      setLaunchResult({ code: 500, error: 'Failed to connect to server' })
    } finally {
      setLaunching(false)
    }
  }

  const handleCopy = () => {
    const text = generateResult.gz_export_cmd + '\n' + generateResult.launch_cmd
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = async () => {
    const dir = worldsDir || customWorldsDir
    if (!dir) return
    setExporting(true)
    setExportResult(null)
    try {
      const result = await exportWorld(dir, modelsDir)
      setExportResult(result)
    } catch (err) {
      setExportResult({ code: 500, error: 'Failed to connect to server' })
    } finally {
      setExporting(false)
    }
  }

  if (!generateResult || generateResult.code !== 200) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-red-400 mb-4">No world generated yet.</p>
          <button onClick={onBack} className="px-6 py-2 bg-gray-700 rounded-lg">Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-900 overflow-y-auto">
      <div className="w-full max-w-xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          World Ready
        </h1>
        <p className="text-gray-400 text-center mb-8">
          {generateResult.models_count} model{generateResult.models_count !== 1 ? 's' : ''} placed
        </p>

        {/* Export to folder */}
        <div className="bg-gray-800 rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Export to Workspace</h2>

          {/* Worlds directory */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1 block">World SDF destination</label>
            {worldsTargets.length > 0 ? (
              <div className="space-y-1 mb-2">
                {worldsTargets.map(t => (
                  <button
                    key={t.path}
                    onClick={() => { setWorldsDir(t.path); setCustomWorldsDir(''); }}
                    className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                      worldsDir === t.path
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              type="text"
              value={worldsDir || customWorldsDir}
              onChange={(e) => { setCustomWorldsDir(e.target.value); setWorldsDir(''); }}
              placeholder="/path/to/worlds/"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Models directory */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 mb-1 block">Terrain model destination (optional)</label>
            {modelsTargets.length > 0 ? (
              <div className="space-y-1 mb-2">
                {modelsTargets.map(t => (
                  <button
                    key={t.path}
                    onClick={() => setModelsDir(modelsDir === t.path ? '' : t.path)}
                    className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                      modelsDir === t.path
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              type="text"
              value={modelsDir}
              onChange={(e) => setModelsDir(e.target.value)}
              placeholder="/path/to/models/ (optional)"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || (!worldsDir && !customWorldsDir)}
            className="w-full py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>

          {exportResult && (
            <div className={`mt-2 text-xs ${exportResult.code === 200 ? 'text-green-400' : 'text-red-400'}`}>
              {exportResult.code === 200 ? (
                <ul className="space-y-0.5">
                  {exportResult.exported.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              ) : (exportResult.error || 'Failed')}
            </div>
          )}
        </div>

        {/* Launch commands */}
        <div className="bg-gray-800 rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Terminal Commands</h2>
          <p className="text-xs text-gray-500 mb-3">Or run manually in a terminal with display access</p>
          <div className="bg-gray-900 text-green-400 text-xs font-mono p-3 rounded overflow-x-auto whitespace-pre select-all leading-relaxed">
{generateResult.gz_export_cmd}{'\n'}{generateResult.launch_cmd}</div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {launching ? 'Launching...' : 'Launch Gazebo'}
            </button>
          </div>
          {launchResult && (
            <p className={`mt-2 text-xs ${launchResult.code === 200 ? 'text-green-400' : 'text-red-400'}`}>
              {launchResult.code === 200
                ? `${launchResult.message}. If no GUI appeared, use the terminal commands above.`
                : (launchResult.error || 'Failed')}
            </p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700"
          >
            Back to Editor
          </button>
          <button
            onClick={onBackToHome}
            className="flex-1 py-3 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
