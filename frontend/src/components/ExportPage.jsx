import { useState } from 'react'
import { launchGazebo } from '../lib/api'

export default function ExportPage({ generateResult, onBack, onBackToHome }) {
  const [launching, setLaunching] = useState(false)
  const [launchResult, setLaunchResult] = useState(null)
  const [copied, setCopied] = useState(false)

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
    <div className="h-full bg-gray-900 flex items-center justify-center">
      <div className="w-full max-w-xl mx-4">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          World Ready
        </h1>
        <p className="text-gray-400 text-center mb-8">
          {generateResult.models_count} model{generateResult.models_count !== 1 ? 's' : ''} placed
        </p>

        {/* Launch commands - primary action */}
        <div className="bg-gray-800 rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Paste into your terminal</h2>
          <p className="text-xs text-gray-500 mb-3">Run these in a terminal with display access (e.g. your host machine or a GUI-enabled container)</p>
          <div className="bg-gray-900 text-green-400 text-xs font-mono p-3 rounded overflow-x-auto whitespace-pre select-all leading-relaxed">
{generateResult.gz_export_cmd}{'\n'}{generateResult.launch_cmd}</div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700"
            >
              {copied ? 'Copied!' : 'Copy Commands'}
            </button>
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              title="Launches gz sim from the server process - may not show GUI if display is not available"
            >
              {launching ? 'Launching...' : 'Launch Gazebo (server-side)'}
            </button>
          </div>
          {launchResult && (
            <p className={`mt-2 text-xs ${launchResult.code === 200 ? 'text-green-400' : 'text-red-400'}`}>
              {launchResult.code === 200
                ? `${launchResult.message}. If no GUI appeared, paste the commands above into a terminal with display access.`
                : (launchResult.error || 'Failed')}
            </p>
          )}
        </div>

        {/* World file path */}
        <div className="bg-gray-800 rounded-xl p-4 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 mb-1">World SDF</h2>
          <div className="text-gray-200 text-xs font-mono select-all break-all">
            {generateResult.world_file}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600"
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
