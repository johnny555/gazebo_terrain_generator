export default function RotationControl({ yaw, onRotate }) {
  const degrees = Math.round(yaw * 180 / Math.PI)

  return (
    <div className="p-3 border-t">
      <h3 className="font-bold text-sm text-gray-700 mb-2">Rotation</h3>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-500">Yaw (degrees)</label>
          <input
            type="range"
            min={0}
            max={360}
            value={degrees}
            onChange={(e) => onRotate(parseInt(e.target.value) * Math.PI / 180)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>0°</span>
            <span className="font-medium text-gray-600">{degrees}°</span>
            <span>360°</span>
          </div>
        </div>

        {/* Quick rotation buttons */}
        <div className="flex gap-1">
          {[0, 45, 90, 135, 180, 270].map(deg => (
            <button
              key={deg}
              onClick={() => onRotate(deg * Math.PI / 180)}
              className={`flex-1 py-1 text-xs rounded ${
                degrees === deg
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
