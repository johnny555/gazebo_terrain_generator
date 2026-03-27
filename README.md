# Gazebo World Builder

Visual tool for generating Gazebo simulation worlds from satellite imagery with drag-and-drop model placement.

**Features:**
- Select any region on a satellite map and generate a Gazebo terrain with heightmap and aerial texture
- Drag and drop Gazebo models from your model library onto the satellite view
- Visualise model extents (collision bounds) as rectangles on the canvas
- Rotate, reposition, and adjust roll/pitch/yaw of placed models
- Auto-discovers model directories in your ROS 2 workspace and Gazebo Fuel cache
- Load and edit previously generated worlds
- Export worlds directly to your workspace folders
- Launch Gazebo with the correct resource paths from the UI
- Snap models to terrain height

## Quick Start

```bash
git clone git@github.com:johnny555/gazebo_terrain_generator.git gazebo_world_builder
cd gazebo_world_builder
git checkout world-builder
./install.sh
./start.sh
```

Requires **Python 3.10+**, **Node.js 18+**, and a **Mapbox API key** (free).

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- **Gazebo Sim** (gz-sim) - tested with [Gazebo Harmonic](https://gazebosim.org/docs/harmonic/install_ubuntu/)
- A **Mapbox API key** (free tier is fine)

### Getting a Mapbox API Key

1. Go to [https://account.mapbox.com/auth/signup/](https://account.mapbox.com/auth/signup/)
2. Create a free account (no credit card required)
3. Copy your **Default public token** from the dashboard
4. Either paste it into the app on first launch, or save it to `.env.local` (see below)

## Installation

### Quick Install

```bash
./install.sh
```

Creates a Python virtual environment, installs all dependencies, and builds the frontend.

### Manual Install

<details>
<summary>Click to expand</summary>

```bash
# Create Python venv (required on Ubuntu 23.04+ due to PEP 668)
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Build frontend (requires Node.js 18+)
cd frontend
npm install
npm run build
cd ..
```

</details>

### Configuration

Create a `.env.local` file in the project root to save your Mapbox key:

```bash
echo "MAPBOX_API_KEY=pk.your_key_here" > .env.local
```

This file is gitignored. When present, the app skips the key entry screen on startup.

## Usage

### Start the server

```bash
./start.sh
```

Opens the app at [http://localhost:5000](http://localhost:5000).

### Workflow

The app has a 4-page workflow:

#### 1. Home
Choose **Create New World** (enter a name and your Mapbox key) or **Open Existing World** to edit a previously generated terrain.

#### 2. Map Selector
- **Search** for a location by name
- **Click** the map to place a region - it snaps to the satellite tile grid
- **Adjust** the region size with the slider (1-16 tiles per side)
- **Drag** the red spawn marker to set the simulation origin (where robots spawn at 0,0,0)
- **Configure** the zoom level (17 is good for most areas) and tile source
- Click **Generate Terrain** to download tiles and build the heightmap

#### 3. World Builder
- **Model library** (left panel) auto-discovers models from your ROS 2 workspace and Gazebo Fuel cache. Click "Dirs" to add/remove directories.
- **Click a model** in the library, then **click the map** to place it
- **Drag** placed models to reposition them
- **Rotate** by dragging the yellow line handle on the selected model
- **Adjust roll/pitch/yaw** numerically in the right panel (useful for models like warehouses that need a roll correction)
- **Snap to Terrain** re-computes Z height for all models from the heightmap
- Models with collision geometry show their true extent as a scaled rectangle
- Click **Generate World SDF** when done

#### 4. Export
- **Export to workspace** - click a detected `worlds/` or `models/` folder to copy the SDF and terrain there
- **Copy terminal commands** - the exact `export GZ_SIM_RESOURCE_PATH=...` and `gz sim ...` commands
- **Launch Gazebo** directly from the server (if display is available)

### Launch in Gazebo

After generating, the export page shows the exact commands. They look like:

```bash
export GZ_SIM_RESOURCE_PATH=/path/to/output/gazebo_terrain:/path/to/models:${GZ_SIM_RESOURCE_PATH}
gz sim /path/to/output/gazebo_terrain/<world_name>/<world_name>.sdf
```

> **Tip:** In a container, ensure model directories are mounted and `GZ_SIM_RESOURCE_PATH` uses container-side paths.

### Model Library

The app auto-discovers models from:
- Sibling packages in your ROS 2 workspace (any `models/` directory containing `model.config` files)
- Gazebo Fuel cache (`~/.gz/fuel/fuel.gazebosim.org/`)
- `GZ_SIM_RESOURCE_PATH` directories

You can also manually add any directory via the "Dirs" panel in the model toolbar.

Each model folder should have:
```
my_model/
  model.config    # required - model name and description
  model.sdf       # required - geometry definition
  meshes/         # optional - .dae, .stl, .obj, .glb mesh files
  thumbnails/     # optional - preview images
```

## Development

For development with hot-reload:

```bash
# Terminal 1 - Backend
source venv/bin/activate
cd scripts
python server.py

# Terminal 2 - Frontend (hot-reload)
cd frontend
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies API requests to Flask on port 5000.

## Tech Stack

- **Backend**: Python Flask
- **Frontend**: React + Vite + Tailwind CSS
- **Map**: Mapbox GL JS
- **Image Processing**: OpenCV, Pillow, NumPy
- **Geodesic Math**: geopy

## Important Disclaimer

Downloading map tiles is subject to the terms and conditions of the tile provider. Some providers such as Google Maps have restrictions in place to avoid abuse. Do not use Google, Bing, or ESRI tiles in commercial applications without their consent.

## License

BSD 3-Clause License. See [LICENSE](LICENSE) for details.

Portions derived from [MapTilesDownloader](https://github.com/AliFlux/MapTilesDownloader) by Ali Ashraf (MIT License).

## Credits

Forked from [gazebo_terrain_generator](https://github.com/saiaravind19/gazebo_terrain_generator) by saiaravind19.
