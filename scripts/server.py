#!/usr/bin/env python

from flask import Flask, request, jsonify, send_from_directory, send_file
import threading
import os
import uuid
import base64
from pathlib import Path
import mimetypes
from utils.demTilesDownloader import download_dem_data
from utils.file_writer import FileWriter
from utils.utils import Utils
from utils.gazebo_world_generator import GazeboTerrianGenerator
from utils.maptile_utils import maptile_utiles
from utils.param import globalParam
from utils.model_scanner import scan_model_directory, get_default_model_paths
import requests
import json

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
lock = threading.Lock()

task_status = {"status": "idle"}
terrain_info_store = {}
current_model_name = None
outputdirectory = None


def random_string():
    return uuid.uuid4().hex.upper()[0:6]


def _resolve_model_uri(model_name):
    """Resolve the correct Gazebo URI for a model.

    For models in flat directories (model_name/model.config), returns model://model_name.
    For Fuel cache models, returns the Fuel HTTPS URI.
    """
    for base_path in globalParam.MODEL_LIBRARY_PATHS:
        # Flat layout: base_path/model_name/model.config -> model://model_name
        candidate = os.path.join(base_path, model_name, 'model.config')
        if os.path.isfile(candidate):
            return f'model://{model_name}'

        # Fuel layout: base_path/owner/models/model_name/version/model.config
        try:
            for owner in os.listdir(base_path):
                fuel_model_dir = os.path.join(base_path, owner, 'models', model_name)
                if not os.path.isdir(fuel_model_dir):
                    continue
                # Find latest version
                versions = []
                for v in os.listdir(fuel_model_dir):
                    v_path = os.path.join(fuel_model_dir, v)
                    if os.path.isdir(v_path) and os.path.isfile(os.path.join(v_path, 'model.config')):
                        try:
                            versions.append((int(v), v))
                        except ValueError:
                            versions.append((0, v))
                if versions:
                    versions.sort(reverse=True)
                    _, version = versions[0]
                    return f'https://fuel.gazebosim.org/1.0/{owner}/models/{model_name}'
        except OSError:
            continue

    # Fallback
    return f'model://{model_name}'


def _find_model_file(model_name, rel_path):
    """Search all model library paths for a file within a model directory.

    Handles both flat (model_name/file) and Fuel (owner/models/model_name/version/file) layouts.
    Returns the full path if found, None otherwise.
    """
    for base_path in globalParam.MODEL_LIBRARY_PATHS:
        # Flat layout: base_path/model_name/rel_path
        candidate = os.path.join(base_path, model_name, rel_path)
        real_candidate = os.path.realpath(candidate)
        real_base = os.path.realpath(os.path.join(base_path, model_name))
        if os.path.isfile(real_candidate) and real_candidate.startswith(real_base):
            return real_candidate

        # Fuel layout: base_path/*/models/model_name/*/rel_path
        try:
            for owner in os.listdir(base_path):
                models_dir = os.path.join(base_path, owner, 'models', model_name)
                if not os.path.isdir(models_dir):
                    continue
                # Find latest version
                versions = []
                for v in os.listdir(models_dir):
                    v_path = os.path.join(models_dir, v)
                    if os.path.isdir(v_path):
                        try:
                            versions.append((int(v), v_path))
                        except ValueError:
                            versions.append((0, v_path))
                if versions:
                    versions.sort(reverse=True)
                    _, version_dir = versions[0]
                    candidate = os.path.join(version_dir, rel_path)
                    real_candidate = os.path.realpath(candidate)
                    if os.path.isfile(real_candidate) and real_candidate.startswith(os.path.realpath(version_dir)):
                        return real_candidate
        except OSError:
            continue

    return None


def process_end_download(bounds, zoom_level, outputDirectory, outputFile, filePath):
    global task_status, terrain_info_store, current_model_name
    try:
        task_status["status"] = "in_progress"
        FileWriter.close(lock, os.path.join(globalParam.OUTPUT_BASE_PATH, outputDirectory), filePath, zoom_level)
        true_boundaries = maptile_utiles.get_true_boundaries(bounds, zoom_level)
        download_dem_data(true_boundaries, os.path.join(globalParam.OUTPUT_BASE_PATH, "dem"))
        orthodir_path = os.path.join(globalParam.OUTPUT_BASE_PATH, outputDirectory)
        terrian_generator = GazeboTerrianGenerator(orthodir_path)
        terrian_generator.generate_gazebo_world()

        # Store terrain info for the world builder
        model_name = os.path.basename(orthodir_path)
        current_model_name = model_name
        size_x = terrian_generator.computed_size_x
        size_y = terrian_generator.computed_size_y
        size_z = terrian_generator.computed_size_z
        pose_x = terrian_generator.computed_pose_x
        pose_y = terrian_generator.computed_pose_y
        pose_z = terrian_generator.computed_pose_z
        origin = terrian_generator.get_true_origin()
        launch = terrian_generator.get_launch_location()

        terrain_info_store[model_name] = {
            "model_name": model_name,
            "size_x": float(size_x),
            "size_y": float(size_y),
            "size_z": float(size_z),
            "pose_x": float(pose_x),
            "pose_y": float(pose_y),
            "pose_z": float(pose_z),
            "origin": {k: float(v) for k, v in origin.items()},
            "launch_location": {k: float(v) for k, v in launch.items()},
            "boundaries": terrian_generator.boundaries,
            "zoom_level": int(terrian_generator.zoom_level),
            "heightmap_path": os.path.join(globalParam.GAZEBO_MODEL_PATH, model_name, 'textures', model_name + '_height_map.tif'),
            "aerial_path": os.path.join(globalParam.GAZEBO_MODEL_PATH, model_name, 'textures', model_name + '_aerial.png'),
            "max_height": float(terrian_generator.max_height),
            "min_height": float(terrian_generator.min_height),
        }

        task_status["status"] = "completed"
        print("Gazebo world generation completed successfully.")

    except Exception as e:
        task_status["status"] = "failed"
        task_status["error"] = str(e)
        print(f"Error during processing: {e}")
        import traceback
        traceback.print_exc()


def validate_mapbox_key(api_key):
    try:
        url = f"https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/0,0,1/1x1?access_token={api_key}"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            print("Mapbox API key is validated successfully.")
            return True
        elif response.status_code == 401:
            print("Invalid Mapbox API key.")
            return False
        else:
            print(f"Unexpected response: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("Cannot validate Mapbox API key - no internet connection.")
        return False
    except requests.exceptions.Timeout:
        print("Mapbox API validation timed out.")
        return False
    except Exception as e:
        print(f"Error validating Mapbox API key: {e}")
        return False


# ─── Existing endpoints (unchanged) ───────────────────────────────────────────

@app.route('/task-status', methods=['GET'])
def task_status_endpoint():
    global task_status
    result = {"code": 200, "message": task_status}
    return jsonify(result)


@app.route('/download-tile', methods=['POST'])
def download_tile():
    postvars = request.form
    x = int(postvars['x'])
    y = int(postvars['y'])
    z = int(postvars['z'])
    quad = str(postvars['quad'])
    timestamp = int(postvars['timestamp'])
    outputDirectory = str(postvars['outputDirectory'])
    outputFile = str(postvars['outputFile'])
    outputScale = 1
    source = str(postvars['source'])

    replaceMap = {
        "x": str(x),
        "y": str(y),
        "z": str(z),
        "quad": quad,
        "timestamp": str(timestamp),
    }
    for key, value in replaceMap.items():
        outputDirectory = outputDirectory.replace(f"{{{key}}}", value)
        outputFile = outputFile.replace(f"{{{key}}}", value)

    filePath = os.path.join(globalParam.OUTPUT_BASE_PATH, outputDirectory, outputFile)

    result = {}
    if FileWriter.exists(filePath, x, y, z):
        result["code"] = 200
        result["message"] = 'Tile already exists'
    else:
        tempFile = random_string() + ".jpg"
        tempFilePath = os.path.join(globalParam.TEMP_PATH, tempFile)
        result["code"] = Utils.downloadFileScaled(source, tempFilePath, x, y, z, outputScale)

        if os.path.isfile(tempFilePath):
            FileWriter.addTile(lock, filePath, tempFilePath, x, y, z, outputScale)
            with open(tempFilePath, "rb") as image_file:
                result["image"] = base64.b64encode(image_file.read()).decode("utf-8")
            os.remove(tempFilePath)
            result["message"] = 'Tile Downloaded'
        else:
            result["message"] = 'Download failed'

    return jsonify(result)


@app.route('/start-download', methods=['POST'])
def start_download():
    postvars = request.form
    outputScale = 1
    outputDirectory = postvars['outputDirectory']
    outputFile = postvars['outputFile']
    zoom_level = int(postvars['maxZoom'])
    timestamp = int(postvars['timestamp'])
    bounds = list(map(float, postvars['bounds'].split(",")))
    center = list(map(float, postvars['center'].split(",")))
    area_rect = postvars['area']
    launchLocation = list(map(float, postvars['launchLocation'].split(",")))

    outputDirectory = outputDirectory.replace("{timestamp}", str(timestamp))
    outputFile = outputFile.replace("{timestamp}", str(timestamp))
    filePath = os.path.join(globalParam.OUTPUT_BASE_PATH, outputDirectory, outputFile)

    FileWriter.addMetadata(
        lock, os.path.join(globalParam.OUTPUT_BASE_PATH, outputDirectory), filePath, outputFile,
        "Map Tiles Downloader via AliFlux", "jpg", bounds, center, area_rect,
        zoom_level, "mercator", 256 * outputScale, launchLocation=launchLocation
    )
    global task_status
    task_status = {"status": "idle"}
    return jsonify({"code": 200, "message": "Metadata written"})


@app.route('/end-download', methods=['POST'])
def end_download():
    postvars = request.form
    outputDirectory = postvars['outputDirectory']
    outputFile = postvars['outputFile']
    zoom_level = int(postvars['maxZoom'])
    timestamp = int(postvars['timestamp'])
    bounds = list(map(float, postvars['bounds'].split(",")))

    outputDirectory = outputDirectory.replace("{timestamp}", str(timestamp))
    outputFile = outputFile.replace("{timestamp}", str(timestamp))
    filePath = os.path.join(globalParam.OUTPUT_BASE_PATH, outputDirectory, outputFile)

    FileWriter.close(lock, os.path.join(globalParam.OUTPUT_BASE_PATH, outputDirectory), filePath, zoom_level)
    thread = threading.Thread(target=process_end_download, args=(bounds, zoom_level, outputDirectory, outputFile, filePath))
    thread.start()

    return jsonify({"code": 200, "message": "Download ended"})


# ─── New API endpoints ────────────────────────────────────────────────────────

@app.route('/api/configure', methods=['POST'])
def configure():
    data = request.get_json()

    mapbox_key = data.get('mapbox_key', '').strip()
    output_dir = data.get('output_dir', '').strip()
    model_library_dir = data.get('model_library_dir', '').strip()

    errors = []

    if mapbox_key:
        if not validate_mapbox_key(mapbox_key):
            errors.append('Invalid Mapbox API key')
    elif not globalParam.MAPBOX_API_KEY:
        errors.append('Mapbox API key is required')

    if output_dir and not os.path.isabs(output_dir):
        output_dir = os.path.abspath(output_dir)

    if model_library_dir:
        if not os.path.isdir(model_library_dir):
            errors.append(f'Model library directory does not exist: {model_library_dir}')

    if errors:
        return jsonify({"code": 400, "errors": errors}), 400

    globalParam.configure(
        mapbox_key=mapbox_key or None,
        output_dir=output_dir or None,
        model_library_dir=model_library_dir or None,
    )

    return jsonify({
        "code": 200,
        "message": "Configuration updated",
        "config": {
            "mapbox_key_set": bool(globalParam.MAPBOX_API_KEY),
            "output_dir": globalParam.OUTPUT_BASE_PATH,
            "model_library_dirs": globalParam.MODEL_LIBRARY_PATHS,
        }
    })


@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify({
        "mapbox_key": globalParam.MAPBOX_API_KEY or '',
        "output_dir": globalParam.OUTPUT_BASE_PATH,
        "model_library_dirs": globalParam.MODEL_LIBRARY_PATHS,
    })


@app.route('/api/model-paths', methods=['GET'])
def model_paths():
    """Return configured paths and auto-detected default paths."""
    defaults = get_default_model_paths()
    return jsonify({
        "code": 200,
        "configured": globalParam.MODEL_LIBRARY_PATHS,
        "detected": defaults,
    })


@app.route('/api/model-paths', methods=['POST'])
def update_model_paths():
    """Add or remove a model library path."""
    data = request.get_json()
    action = data.get('action', 'add')
    path = data.get('path', '').strip()

    if not path:
        return jsonify({"code": 400, "error": "Path is required"}), 400

    if action == 'add':
        if not os.path.isdir(path):
            return jsonify({"code": 400, "error": f"Directory does not exist: {path}"}), 400
        globalParam.add_model_path(path)
    elif action == 'remove':
        globalParam.remove_model_path(path)
    else:
        return jsonify({"code": 400, "error": "Invalid action"}), 400

    return jsonify({
        "code": 200,
        "model_library_dirs": globalParam.MODEL_LIBRARY_PATHS,
    })


@app.route('/api/browse-dirs', methods=['GET'])
def browse_dirs():
    """Browse directories for model library selection.

    Lists sibling packages in the ROS workspace and other useful directories.
    """
    project_root = str(Path(__file__).resolve().parents[1])
    workspace_src = str(Path(project_root).parent)  # ../  (ws/src/)

    dirs = []

    # Scan workspace siblings for directories containing models
    if os.path.isdir(workspace_src):
        for entry in sorted(os.listdir(workspace_src)):
            entry_path = os.path.join(workspace_src, entry)
            if not os.path.isdir(entry_path) or entry.startswith('.'):
                continue
            # Look for 'models' subdirectories up to 3 levels deep
            for root_dir, subdirs, files in os.walk(entry_path):
                depth = root_dir[len(entry_path):].count(os.sep)
                if depth > 2:
                    subdirs.clear()
                    continue
                if os.path.basename(root_dir) == 'models':
                    # Check if it actually contains model.config files
                    has_models = any(
                        os.path.isfile(os.path.join(root_dir, d, 'model.config'))
                        for d in os.listdir(root_dir)
                        if os.path.isdir(os.path.join(root_dir, d))
                    )
                    if has_models:
                        dirs.append({
                            "path": root_dir,
                            "label": os.path.relpath(root_dir, workspace_src),
                            "source": "workspace",
                        })

    # Add Fuel directories
    fuel_base = os.path.expanduser('~/.gz/fuel/fuel.gazebosim.org')
    if os.path.isdir(fuel_base):
        dirs.append({
            "path": fuel_base,
            "label": "~/.gz/fuel (Gazebo Fuel cache)",
            "source": "fuel",
        })

    # Add GZ_SIM_RESOURCE_PATH entries
    gz_path = os.environ.get('GZ_SIM_RESOURCE_PATH', '')
    for p in gz_path.split(':'):
        p = p.strip()
        if p and os.path.isdir(p):
            dirs.append({
                "path": p,
                "label": p,
                "source": "env",
            })

    return jsonify({"code": 200, "directories": dirs, "workspace": workspace_src})


@app.route('/api/models', methods=['GET'])
def list_models():
    if not globalParam.MODEL_LIBRARY_PATHS:
        return jsonify({"code": 200, "models": [], "paths": []})

    all_models = []
    seen_names = set()
    for path in globalParam.MODEL_LIBRARY_PATHS:
        for model in scan_model_directory(path):
            if model['name'] not in seen_names:
                all_models.append(model)
                seen_names.add(model['name'])

    all_models.sort(key=lambda m: m['display_name'].lower())
    return jsonify({"code": 200, "models": all_models, "paths": globalParam.MODEL_LIBRARY_PATHS})


@app.route('/api/models/<model_name>/mesh/<path:mesh_path>', methods=['GET'])
def serve_mesh(model_name, mesh_path):
    if not globalParam.MODEL_LIBRARY_PATHS:
        return jsonify({"code": 400, "error": "Model library not configured"}), 400

    # Search all model paths for this model
    full_path = _find_model_file(model_name, mesh_path)
    if not full_path:
        return jsonify({"code": 404, "error": "Mesh file not found"}), 404

    mime_types = {
        '.dae': 'model/vnd.collada+xml',
        '.stl': 'model/stl',
        '.obj': 'text/plain',
    }
    ext = os.path.splitext(full_path)[1].lower()
    mime = mime_types.get(ext, 'application/octet-stream')

    return send_file(full_path, mimetype=mime)


@app.route('/api/models/<model_name>/thumbnail', methods=['GET'])
def serve_thumbnail(model_name):
    if not globalParam.MODEL_LIBRARY_PATHS:
        return jsonify({"code": 404, "error": "Not configured"}), 404

    for thumb_name in ['thumbnails/default.png', 'thumbnails/1.png', 'thumbnail.png', 'thumb.png']:
        full_path = _find_model_file(model_name, thumb_name)
        if full_path:
            return send_file(full_path)

    return jsonify({"code": 404, "error": "No thumbnail"}), 404


@app.route('/api/terrains', methods=['GET'])
def list_terrains():
    """List existing generated terrains that can be opened in the world builder."""
    terrain_dir = globalParam.GAZEBO_MODEL_PATH
    terrains = []
    if os.path.isdir(terrain_dir):
        for entry in sorted(os.listdir(terrain_dir)):
            entry_path = os.path.join(terrain_dir, entry)
            if entry == 'worlds' or not os.path.isdir(entry_path):
                continue
            aerial_path = os.path.join(entry_path, 'textures', entry + '_aerial.png')
            heightmap_path = os.path.join(entry_path, 'textures', entry + '_height_map.tif')
            metadata_path = os.path.join(globalParam.OUTPUT_BASE_PATH, entry, 'metadata.json')
            world_sdf = os.path.join(entry_path, entry + '.sdf')
            if os.path.isfile(aerial_path) and os.path.isfile(heightmap_path):
                terrains.append({
                    "name": entry,
                    "has_metadata": os.path.isfile(metadata_path),
                    "has_world_sdf": os.path.isfile(world_sdf),
                })
    return jsonify({"code": 200, "terrains": terrains})


@app.route('/api/terrains/<name>/load', methods=['POST'])
def load_terrain(name):
    """Load an existing terrain into the world builder.

    Reads metadata.json to reconstruct terrain info and parses the world SDF
    for any existing placed models.
    """
    global current_model_name, terrain_info_store

    terrain_model_dir = os.path.join(globalParam.GAZEBO_MODEL_PATH, name)
    metadata_path = os.path.join(globalParam.OUTPUT_BASE_PATH, name, 'metadata.json')
    aerial_path = os.path.join(terrain_model_dir, 'textures', name + '_aerial.png')
    heightmap_path = os.path.join(terrain_model_dir, 'textures', name + '_height_map.tif')

    if not os.path.isfile(aerial_path):
        return jsonify({"code": 404, "error": f"Aerial image not found for '{name}'"}), 404
    if not os.path.isfile(heightmap_path):
        return jsonify({"code": 404, "error": f"Heightmap not found for '{name}'"}), 404

    # Read metadata
    if not os.path.isfile(metadata_path):
        return jsonify({"code": 404, "error": f"Metadata not found for '{name}'"}), 404

    with open(metadata_path) as f:
        metadata = json.load(f)

    # Reconstruct terrain info by re-running the generator's computations
    try:
        orthodir_path = os.path.join(globalParam.OUTPUT_BASE_PATH, name)
        gen = GazeboTerrianGenerator(orthodir_path)

        # We need to regenerate heightmap data to get dimensions
        # But the heightmap already exists, so just read it
        from PIL import Image
        import numpy as np

        hmap = Image.open(heightmap_path)

        bound_array = gen.boundaries.split(',')
        true_boundaries = maptile_utiles.get_true_boundaries(bound_array, gen.zoom_level)

        sw = true_boundaries["southwest"]
        se = true_boundaries["southeast"]
        ne = true_boundaries["northeast"]

        from geopy.distance import geodesic
        size_x = round(geodesic(sw, se).m, 2)
        size_y = round(geodesic(se, ne).m, 2)

        # Read heightmap to get height range
        hmap_array = np.array(hmap)
        # For the height range, we need the original DEM data
        # Since we don't have it, approximate from the model.sdf if it exists
        model_sdf_path = os.path.join(terrain_model_dir, 'model.sdf')
        size_z = 100.0  # default
        pose_x = 0.0
        pose_y = 0.0
        pose_z = 0.0

        if os.path.isfile(model_sdf_path):
            import xml.etree.ElementTree as ET
            tree = ET.parse(model_sdf_path)
            root = tree.getroot()
            # Extract size from <heightmap><size>
            size_el = root.find('.//heightmap/size')
            if size_el is not None and size_el.text:
                parts = size_el.text.strip().split()
                if len(parts) >= 3:
                    size_x = float(parts[0])
                    size_y = float(parts[1])
                    size_z = float(parts[2])
            # Extract pose
            pose_el = root.find('.//model/pose')
            if pose_el is not None and pose_el.text:
                parts = pose_el.text.strip().split()
                if len(parts) >= 3:
                    pose_x = float(parts[0])
                    pose_y = float(parts[1])
                    pose_z = float(parts[2])

        origin = gen.get_true_origin()
        launch = gen.get_launch_location()

        terrain_info_store[name] = {
            "model_name": name,
            "size_x": float(size_x),
            "size_y": float(size_y),
            "size_z": float(size_z),
            "pose_x": float(pose_x),
            "pose_y": float(pose_y),
            "pose_z": float(pose_z),
            "origin": {k: float(v) for k, v in origin.items()},
            "launch_location": {k: float(v) for k, v in launch.items()},
            "boundaries": gen.boundaries,
            "zoom_level": int(gen.zoom_level),
            "heightmap_path": heightmap_path,
            "aerial_path": aerial_path,
            "max_height": 0,
            "min_height": 0,
        }
        current_model_name = name

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"code": 500, "error": f"Failed to load terrain: {str(e)}"}), 500

    # Parse existing placed models from world SDF
    placed_models = []
    world_sdf = os.path.join(terrain_model_dir, name + '.sdf')
    if os.path.isfile(world_sdf):
        try:
            import xml.etree.ElementTree as ET
            tree = ET.parse(world_sdf)
            root = tree.getroot()
            for include_el in root.iter('include'):
                uri_el = include_el.find('uri')
                pose_el = include_el.find('pose')
                if uri_el is None or not uri_el.text:
                    continue
                uri = uri_el.text.strip()
                # Skip the terrain model itself
                if uri == f'model://{name}':
                    continue
                # Extract model name from uri
                model_name_from_uri = uri
                if uri.startswith('model://'):
                    model_name_from_uri = uri[8:]
                elif uri.startswith('https://'):
                    parts = uri.split('/models/')
                    if len(parts) > 1:
                        model_name_from_uri = parts[1].split('/')[0]

                pose = [0, 0, 0, 0, 0, 0]
                if pose_el is not None and pose_el.text:
                    try:
                        pose = [float(v) for v in pose_el.text.strip().split()]
                        while len(pose) < 6:
                            pose.append(0)
                    except ValueError:
                        pass

                placed_models.append({
                    "name": model_name_from_uri,
                    "x": pose[0],
                    "y": pose[1],
                    "z": pose[2],
                    "roll": pose[3],
                    "pitch": pose[4],
                    "yaw": -pose[5],  # Negate: SDF CCW -> UI CW
                })
        except (ET.ParseError, OSError) as e:
            print(f"Warning: Failed to parse placed models from {world_sdf}: {e}")

    return jsonify({
        "code": 200,
        "message": f"Loaded terrain '{name}'",
        "placed_models": placed_models,
    })


@app.route('/api/terrain-info', methods=['GET'])
def terrain_info():
    global current_model_name
    if not current_model_name or current_model_name not in terrain_info_store:
        return jsonify({"code": 404, "error": "No terrain generated yet"}), 404

    info = terrain_info_store[current_model_name]
    # Don't expose server file paths to the frontend
    safe_info = {k: v for k, v in info.items() if k not in ('heightmap_path', 'aerial_path')}
    return jsonify({"code": 200, "terrain": safe_info})


@app.route('/api/terrain-image', methods=['GET'])
def terrain_image():
    global current_model_name
    if not current_model_name or current_model_name not in terrain_info_store:
        return jsonify({"code": 404, "error": "No terrain generated yet"}), 404

    info = terrain_info_store[current_model_name]
    aerial_path = info['aerial_path']

    if not os.path.isfile(aerial_path):
        return jsonify({"code": 404, "error": "Aerial image not found"}), 404

    return send_file(aerial_path, mimetype='image/png')


@app.route('/api/heightmap-elevation', methods=['GET'])
def heightmap_elevation():
    global current_model_name
    if not current_model_name or current_model_name not in terrain_info_store:
        return jsonify({"code": 404, "error": "No terrain generated"}), 404

    x = float(request.args.get('x', 0))
    y = float(request.args.get('y', 0))

    info = terrain_info_store[current_model_name]

    # Convert world coords to normalized position on heightmap
    terrain_x = x - info['pose_x']
    terrain_y = y - info['pose_y']

    norm_x = terrain_x / info['size_x'] + 0.5
    norm_y = 0.5 - terrain_y / info['size_y']

    from PIL import Image
    hmap = Image.open(info['heightmap_path'])
    px = max(0, min(int(norm_x * hmap.width), hmap.width - 1))
    py = max(0, min(int(norm_y * hmap.height), hmap.height - 1))

    pixel_val = hmap.getpixel((px, py))
    z = pixel_val / 255.0 * info['size_z'] + info['pose_z']

    return jsonify({"code": 200, "z": round(z, 2)})


@app.route('/api/generate-world', methods=['POST'])
def generate_world():
    global current_model_name
    if not current_model_name or current_model_name not in terrain_info_store:
        return jsonify({"code": 404, "error": "No terrain generated"}), 404

    data = request.get_json()
    models = data.get('models', [])

    info = terrain_info_store[current_model_name]
    model_name = info['model_name']

    # Resolve correct URIs for each model
    for m in models:
        m['uri'] = _resolve_model_uri(m['name'])

    # Generate model include XML
    model_includes = FileWriter.generate_model_includes(models)

    # Regenerate world file with model includes
    template = FileWriter.read_template(os.path.join(globalParam.TEMPLATE_DIR_PATH, 'gazebo_world.txt'))
    launch = info['launch_location']

    # Do template replacements
    template = template.replace("$MODELNAME$", model_name)
    template = template.replace("$ORIGIN_LAT$", str(launch["latitude"]))
    template = template.replace("$ORIGIN_LONG$", str(launch["longitude"]))
    template = template.replace("$ORIGIN_ELEVATION$", str(launch["altitude"]))
    template = template.replace("$MODEL_INCLUDES$", model_includes)

    # Write world files
    world_path_model = os.path.join(globalParam.GAZEBO_MODEL_PATH, model_name, model_name + ".sdf")
    world_path_worlds = os.path.join(globalParam.GAZEBO_WORLD_PATH, model_name + ".sdf")

    os.makedirs(os.path.dirname(world_path_model), exist_ok=True)
    os.makedirs(os.path.dirname(world_path_worlds), exist_ok=True)

    for path in [world_path_model, world_path_worlds]:
        with open(path, 'w') as f:
            f.write(template)

    # Collect required GZ_SIM_RESOURCE_PATH entries
    resource_paths = set()
    resource_paths.add(globalParam.GAZEBO_MODEL_PATH)  # for terrain model

    # Find parent dirs for each placed model
    for m in models:
        for lib_path in globalParam.MODEL_LIBRARY_PATHS:
            # Flat layout: lib_path/model_name/
            candidate = os.path.join(lib_path, m['name'])
            if os.path.isdir(candidate) and os.path.isfile(os.path.join(candidate, 'model.config')):
                resource_paths.add(lib_path)
                break
            # Fuel layout: lib_path/owner/models/model_name/version/
            try:
                for owner in os.listdir(lib_path):
                    fuel_model = os.path.join(lib_path, owner, 'models', m['name'])
                    if os.path.isdir(fuel_model):
                        resource_paths.add(lib_path)
                        break
            except OSError:
                pass

    resource_paths_list = sorted(resource_paths)
    gz_export = 'export GZ_SIM_RESOURCE_PATH=' + ':'.join(resource_paths_list) + ':${GZ_SIM_RESOURCE_PATH}'

    return jsonify({
        "code": 200,
        "message": "World SDF generated with {} models".format(len(models)),
        "world_file": world_path_model,
        "models_count": len(models),
        "resource_paths": resource_paths_list,
        "gz_export_cmd": gz_export,
        "launch_cmd": f"gz sim {world_path_model}",
    })


@app.route('/api/launch-gazebo', methods=['POST'])
def launch_gazebo():
    """Launch Gazebo with the correct GZ_SIM_RESOURCE_PATH."""
    global current_model_name
    if not current_model_name or current_model_name not in terrain_info_store:
        return jsonify({"code": 404, "error": "No terrain loaded"}), 404

    info = terrain_info_store[current_model_name]
    model_name = info['model_name']
    world_file = os.path.join(globalParam.GAZEBO_MODEL_PATH, model_name, model_name + ".sdf")

    if not os.path.isfile(world_file):
        return jsonify({"code": 404, "error": "World SDF not found. Generate it first."}), 404

    # Build resource paths
    resource_paths = set()
    resource_paths.add(globalParam.GAZEBO_MODEL_PATH)
    for lib_path in globalParam.MODEL_LIBRARY_PATHS:
        resource_paths.add(lib_path)

    # Build environment
    import subprocess
    env = os.environ.copy()
    existing = env.get('GZ_SIM_RESOURCE_PATH', '')
    new_paths = ':'.join(sorted(resource_paths))
    env['GZ_SIM_RESOURCE_PATH'] = new_paths + (':' + existing if existing else '')

    # Remove venv paths that inject OpenCV's Qt plugins, which conflict with Gazebo's Qt
    env.pop('QT_PLUGIN_PATH', None)
    env.pop('QT_QPA_PLATFORM_PLUGIN_PATH', None)
    venv_prefix = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'venv')
    if 'LD_LIBRARY_PATH' in env:
        env['LD_LIBRARY_PATH'] = ':'.join(
            p for p in env['LD_LIBRARY_PATH'].split(':') if venv_prefix not in p
        )

    try:
        log_path = os.path.join(globalParam.GAZEBO_MODEL_PATH, 'gazebo_launch.log')
        log_file = open(log_path, 'w')
        proc = subprocess.Popen(
            ['gz', 'sim', world_file],
            env=env,
            stdout=log_file,
            stderr=log_file,
            start_new_session=True,
        )
        return jsonify({
            "code": 200,
            "message": f"Gazebo launched (PID {proc.pid})",
            "pid": proc.pid,
        })
    except FileNotFoundError:
        return jsonify({"code": 500, "error": "gz command not found. Is Gazebo Sim installed?"}), 500
    except Exception as e:
        return jsonify({"code": 500, "error": str(e)}), 500


@app.route('/api/export-targets', methods=['GET'])
def export_targets():
    """List candidate export directories (worlds/ and models/ folders in workspace)."""
    project_root = str(Path(__file__).resolve().parents[1])
    workspace_src = str(Path(project_root).parent)

    targets = []
    if os.path.isdir(workspace_src):
        for entry in sorted(os.listdir(workspace_src)):
            entry_path = os.path.join(workspace_src, entry)
            if not os.path.isdir(entry_path) or entry.startswith('.'):
                continue
            # Look for 'worlds' subdirectories up to 3 levels deep
            for root_dir, subdirs, files in os.walk(entry_path):
                depth = root_dir[len(entry_path):].count(os.sep)
                if depth > 2:
                    subdirs.clear()
                    continue
                basename = os.path.basename(root_dir)
                if basename == 'worlds':
                    has_sdf = any(f.endswith('.sdf') for f in files)
                    targets.append({
                        "path": root_dir,
                        "label": os.path.relpath(root_dir, workspace_src),
                        "type": "worlds",
                        "has_existing": has_sdf,
                    })
                elif basename == 'models':
                    targets.append({
                        "path": root_dir,
                        "label": os.path.relpath(root_dir, workspace_src),
                        "type": "models",
                    })

    return jsonify({"code": 200, "targets": targets, "workspace": workspace_src})


@app.route('/api/export', methods=['POST'])
def export_world():
    """Export the world SDF and terrain model to a target directory."""
    global current_model_name
    if not current_model_name or current_model_name not in terrain_info_store:
        return jsonify({"code": 404, "error": "No terrain loaded"}), 404

    data = request.get_json()
    worlds_dir = data.get('worlds_dir', '').strip()
    models_dir = data.get('models_dir', '').strip()

    if not worlds_dir:
        return jsonify({"code": 400, "error": "worlds_dir is required"}), 400

    info = terrain_info_store[current_model_name]
    model_name = info['model_name']

    import shutil
    exported = []

    # Export world SDF to worlds directory
    world_src = os.path.join(globalParam.GAZEBO_MODEL_PATH, model_name, model_name + '.sdf')
    if os.path.isfile(world_src):
        os.makedirs(worlds_dir, exist_ok=True)
        world_dst = os.path.join(worlds_dir, model_name + '.sdf')
        shutil.copy2(world_src, world_dst)
        exported.append(f"World SDF → {world_dst}")

    # Export terrain model to models directory (if provided)
    if models_dir:
        model_src_dir = os.path.join(globalParam.GAZEBO_MODEL_PATH, model_name)
        model_dst_dir = os.path.join(models_dir, model_name)
        if os.path.isdir(model_src_dir):
            if os.path.exists(model_dst_dir):
                shutil.rmtree(model_dst_dir)
            shutil.copytree(model_src_dir, model_dst_dir)
            exported.append(f"Terrain model → {model_dst_dir}")

    return jsonify({
        "code": 200,
        "message": f"Exported {len(exported)} items",
        "exported": exported,
    })


# ─── Static file serving ──────────────────────────────────────────────────────

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    dist_dir = os.path.join(str(Path(__file__).resolve().parent), '..', 'frontend', 'dist')
    if path and os.path.isfile(os.path.join(dist_dir, path)):
        return send_from_directory(dist_dir, path)
    return send_from_directory(dist_dir, 'index.html')


if __name__ == '__main__':
    # Load .env.local if present
    globalParam.load_env()

    if globalParam.MAPBOX_API_KEY:
        print(f"Mapbox API key loaded from .env.local")
    else:
        print("No Mapbox API key configured. Set it via the web UI.")

    print("Starting Flask server on port 5000...")
    app.run(host='0.0.0.0', port=5000, threaded=True)
