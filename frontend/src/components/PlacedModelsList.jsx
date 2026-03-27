export default function PlacedModelsList({ models, selectedIndex, onSelect, onDelete, onUpdate }) {
  const toDeg = (rad) => Math.round((rad || 0) * 180 / Math.PI)
  const toRad = (deg) => deg * Math.PI / 180

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 border-b">
        <h2 className="font-bold text-sm text-gray-700">
          Placed Models ({models.length})
        </h2>
      </div>

      {models.length === 0 ? (
        <p className="text-sm text-gray-400 p-3">
          Select a model from the toolbar, then click on the map to place it.
        </p>
      ) : (
        <div className="p-2 space-y-1">
          {models.map((model, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <div key={idx}>
                <div
                  onClick={() => onSelect(idx)}
                  className={`p-2 rounded-lg cursor-pointer text-sm flex items-center justify-between group ${
                    isSelected
                      ? 'bg-cyan-50 border border-cyan-300'
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{model.name}</div>
                    <div className="text-xs text-gray-400">
                      x:{model.x} y:{model.y} z:{model.z}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(idx) }}
                    className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-lg px-1"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>

                {/* Expanded controls for selected model */}
                {isSelected && onUpdate && (
                  <div className="ml-2 mr-2 mb-1 p-2 bg-gray-50 rounded text-xs space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-gray-400">Roll°</label>
                        <input
                          type="number"
                          value={toDeg(model.roll)}
                          onChange={(e) => onUpdate(idx, { roll: toRad(parseInt(e.target.value) || 0) })}
                          className="w-full px-1.5 py-1 border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-gray-400">Pitch°</label>
                        <input
                          type="number"
                          value={toDeg(model.pitch)}
                          onChange={(e) => onUpdate(idx, { pitch: toRad(parseInt(e.target.value) || 0) })}
                          className="w-full px-1.5 py-1 border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-gray-400">Yaw°</label>
                        <input
                          type="number"
                          value={toDeg(model.yaw)}
                          onChange={(e) => onUpdate(idx, { yaw: toRad(parseInt(e.target.value) || 0) })}
                          className="w-full px-1.5 py-1 border rounded text-xs"
                        />
                      </div>
                    </div>
                    {/* Quick roll presets for models that need uprighting */}
                    <div className="flex gap-1">
                      <span className="text-gray-400 self-center">Roll:</span>
                      {[0, 90, -90, 180].map(deg => (
                        <button
                          key={deg}
                          onClick={() => onUpdate(idx, { roll: toRad(deg) })}
                          className={`px-2 py-0.5 rounded text-xs ${
                            toDeg(model.roll) === deg
                              ? 'bg-cyan-500 text-white'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
