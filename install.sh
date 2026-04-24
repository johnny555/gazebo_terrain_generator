#!/bin/bash
# Gazebo World Builder - Install Script
# Run this once after cloning the repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Gazebo World Builder - Install ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is required but not found."
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is required but not found."
    echo "Install it from https://nodejs.org/ (v18+ recommended)"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is required but not found."
    exit 1
fi

echo "Python: $(python3 --version)"
echo "Node:   $(node --version)"
echo "npm:    $(npm --version)"
echo ""

# Create Python virtual environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
else
    echo "Python venv already exists."
fi

# Hide the venv from colcon. Without this marker, a workspace-level
# `colcon build` descends into venv/lib/.../numpy/_core/tests/examples/
# and tries to parse numpy's Cython test stubs as ROS packages, which
# fails with ModuleNotFoundError: No module named 'Cython' and spams the
# build output with tracebacks.
touch venv/COLCON_IGNORE

echo "Installing Python dependencies..."
venv/bin/pip install -q -r requirements.txt

# Install and build frontend
echo "Installing frontend dependencies..."
cd frontend
npm install --silent
echo "Building frontend..."
npm run build
cd ..

echo ""
echo "=== Install complete ==="
echo ""
echo "To start the server, run:"
echo "  ./start.sh"
echo ""
echo "Optional: create a .env.local file with your Mapbox API key:"
echo "  echo 'MAPBOX_API_KEY=pk.your_key_here' > .env.local"
echo ""
