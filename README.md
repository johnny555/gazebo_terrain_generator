# Gazebo World Builder

Visual tool for generating Gazebo simulation worlds from satellite imagery with drag-and-drop model placement.

**Features:**
- Select any region on a satellite map and generate a Gazebo terrain with heightmap and aerial texture
- Drag and drop Gazebo models from your local model library onto the satellite view
- Rotate models to set their orientation (yaw)
- Generates complete SDF world files with terrain and all placed models
- Configurable output and model library directories from the web UI

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- **ROS 2 Humble or later** (for Gazebo Sim integration)
- **Gazebo Sim** (gz-sim) - tested with [Gazebo Harmonic](https://gazebosim.org/docs/harmonic/install_ubuntu/)
- A **Mapbox API key** (free tier works fine)

### Getting a Mapbox API Key

1. Go to [https://account.mapbox.com/auth/signup/](https://account.mapbox.com/auth/signup/)
2. Create a free account (no credit card required for the free tier)
3. From your [account dashboard](https://account.mapbox.com/), copy your **Default public token**
4. You'll paste this into the app's configuration screen on first launch

## Installation

### 1. Clone into your ROS 2 workspace

```bash
cd ~/ros2_ws/src
git clone https://github.com/johnny555/gazebo_terrain_generator.git gazebo_world_builder
cd gazebo_world_builder
git checkout world-builder
```

### 2. Quick Install

```bash
./install.sh
```

This creates a Python virtual environment, installs all Python and Node.js dependencies,
and builds the frontend. Requires Python 3.10+ and Node.js 18+.

### 3. Start

```bash
./start.sh
```

Opens the app at [http://localhost:5000](http://localhost:5000).

### Manual Install (if you prefer)

<details>
<summary>Click to expand manual steps</summary>

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

# Start the server
cd scripts
python server.py
```

> **Note:** Run `source venv/bin/activate` each time you open a new terminal.

</details>

### 5. (Optional) Create a `.env.local` file

To avoid entering your Mapbox key every time, create a `.env.local` file in the project root:

```bash
echo "MAPBOX_API_KEY=pk.your_key_here" > .env.local
```

This file is gitignored and will be loaded automatically on server startup. If a valid key is found in `.env.local`, the configuration screen is skipped and you go straight to the home page.

Supported variables:
- `MAPBOX_API_KEY` - Your Mapbox public access token

## Usage

### Start the server

```bash
source venv/bin/activate   # if not already activated
cd scripts
python server.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

### Workflow

1. **Configure** - Enter your Mapbox API key, set the output directory and model library path
2. **Select Region** - Search for a location, draw a rectangular region on the map, set the launch pad position, choose zoom level and tile source
3. **Generate Terrain** - Click "Generate Terrain" and wait for tile download and heightmap generation
4. **Place Models** - In the World Builder view, select models from the toolbar and click on the map to place them. Adjust rotation (yaw) as needed.
5. **Generate SDF** - Click "Generate World SDF" to create the final world file with all placed models

### Launch in Gazebo

Gazebo uses `GZ_SIM_RESOURCE_PATH` to find models referenced by `model://` URIs.
You need to include the output directory (for the terrain model) and any model library
directories containing placed models.

After generating a world SDF, the app shows the exact commands to run. They look like:

```bash
export GZ_SIM_RESOURCE_PATH=/path/to/output/gazebo_terrain:/path/to/your/models:${GZ_SIM_RESOURCE_PATH}
gz sim /path/to/output/gazebo_terrain/<model_name>/<model_name>.sdf
```

You can copy these directly from the World Builder UI after clicking "Generate World SDF".

> **Tip:** If you're running Gazebo in a container, make sure the model directories
> are mounted into the container and the `GZ_SIM_RESOURCE_PATH` points to the
> container-side paths.

### Model Library

Point the "Model Library Directory" to any directory containing Gazebo model folders. Each model folder should have:

```
my_model/
  model.config    (required - XML with model name and description)
  model.sdf       (required - SDF with geometry)
  meshes/         (optional - .dae, .stl, or .obj mesh files)
  thumbnails/     (optional - thumbnail images)
```

Common sources for Gazebo models:
- [Gazebo Fuel](https://app.gazebosim.org/fuel/models) - download models and extract to your library directory
- Your own custom models

### File Structure

Generated worlds follow this structure:
```
<output_dir>/gazebo_terrain/
  <model_name>/
    model.sdf              # Gazebo model definition (heightmap)
    model.config           # Model configuration
    <model_name>.sdf       # Gazebo world file (includes terrain + placed models)
    textures/
      <model_name>_height_map.tif    # Elevation heightmap
      <model_name>_aerial.png        # Satellite imagery texture
  worlds/
    <model_name>.sdf       # Copy of world file
```

## Development

For development with hot-reload:

**Terminal 1 - Backend:**
```bash
cd scripts
python server.py
```

**Terminal 2 - Frontend dev server:**
```bash
cd frontend
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies API requests to the Flask backend on port 5000.

## Tech Stack

- **Backend**: Python Flask
- **Frontend**: React + Vite + Tailwind CSS
- **Map**: Mapbox GL JS (via react-map-gl)
- **3D Rendering**: Three.js (via @react-three/fiber)
- **Image Processing**: OpenCV, Pillow, NumPy
- **Geodesic Math**: geopy

## Important Disclaimer

Downloading map tiles is subject to the terms and conditions of the tile provider. Some providers such as Google Maps have restrictions in place to avoid abuse, therefore before downloading any tiles make sure you understand their TOCs. I recommend not using Google, Bing, and ESRI tiles in any commercial application without their consent.

## License

This project is licensed under the **BSD 3-Clause License**.
See the [LICENSE](LICENSE) file for full details.

Portions of this project are derived from **MapTilesDownloader** by [Ali Ashraf](https://github.com/AliFlux/MapTilesDownloader),
which is licensed under the **MIT License**. The MIT-licensed components remain under their original terms.

## Credits

Forked from [gazebo_terrain_generator](https://github.com/saiaravind19/gazebo_terrain_generator) by saiaravind19.

## Reference
- [Gazebo Heightmap](https://github.com/AS4SR/general_info/wiki/Creating-Heightmaps-for-Gazebo)
- [Mapbox DEM](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-dem-v1/)
