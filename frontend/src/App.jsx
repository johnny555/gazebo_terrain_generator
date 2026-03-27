import { useState, useEffect, useCallback } from 'react'
import HomePage from './components/HomePage'
import MapSelector from './components/MapSelector'
import WorldBuilder from './components/WorldBuilder'
import ExportPage from './components/ExportPage'
import { getConfig } from './lib/api'

function App() {
  const [view, setView] = useState('home') // 'home' | 'map' | 'builder' | 'export'
  const [mapboxKey, setMapboxKey] = useState('')
  const [builderKey, setBuilderKey] = useState(0)
  const [initialModels, setInitialModels] = useState([])
  const [configLoaded, setConfigLoaded] = useState(false)
  const [modelName, setModelName] = useState('')
  const [generateResult, setGenerateResult] = useState(null)

  useEffect(() => {
    getConfig().then(config => {
      if (config.mapbox_key) {
        setMapboxKey(config.mapbox_key)
      }
      setConfigLoaded(true)
    }).catch(() => setConfigLoaded(true))
  }, [])

  const handleCreateNew = useCallback((key, name) => {
    setMapboxKey(key)
    setModelName(name || '')
    setView('map')
  }, [])

  const handleLoadExisting = useCallback((placedModels) => {
    setInitialModels(placedModels || [])
    setBuilderKey(k => k + 1)
    setView('builder')
  }, [])

  const handleTerrainGenerated = useCallback(() => {
    setInitialModels([])
    setBuilderKey(k => k + 1)
    setView('builder')
  }, [])

  const handleExport = useCallback((result) => {
    setGenerateResult(result)
    setView('export')
  }, [])

  const handleBackToHome = useCallback(() => {
    setView('home')
  }, [])

  const handleBackToBuilder = useCallback(() => {
    setView('builder')
  }, [])

  if (!configLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="animate-spin w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      {view === 'home' && (
        <HomePage
          mapboxKey={mapboxKey}
          onCreateNew={handleCreateNew}
          onLoadExisting={handleLoadExisting}
        />
      )}
      {view === 'map' && (
        <MapSelector
          mapboxKey={mapboxKey}
          modelName={modelName}
          onTerrainGenerated={handleTerrainGenerated}
          onBack={handleBackToHome}
        />
      )}
      {view === 'builder' && (
        <WorldBuilder
          key={builderKey}
          initialModels={initialModels}
          onBack={handleBackToHome}
          onExport={handleExport}
        />
      )}
      {view === 'export' && (
        <ExportPage
          generateResult={generateResult}
          onBack={handleBackToBuilder}
          onBackToHome={handleBackToHome}
        />
      )}
    </div>
  )
}

export default App
