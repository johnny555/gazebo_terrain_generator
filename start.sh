#!/bin/bash
# Gazebo World Builder - Start Script
# Starts the Flask server and opens the browser

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if installed
if [ ! -d "venv" ]; then
    echo "Not installed yet. Run ./install.sh first."
    exit 1
fi

if [ ! -d "frontend/dist" ]; then
    echo "Frontend not built. Run ./install.sh first."
    exit 1
fi

source venv/bin/activate

PORT="${PORT:-5000}"

echo "Starting Gazebo World Builder on http://localhost:$PORT"
echo "Press Ctrl+C to stop."
echo ""

# Try to open browser (non-blocking, ignore errors)
(sleep 1 && xdg-open "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" 2>/dev/null || true) &

cd scripts
exec python server.py
