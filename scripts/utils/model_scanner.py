import os
import xml.etree.ElementTree as ET


def scan_model_directory(base_path):
    """Scan a directory for Gazebo models.

    Handles two directory layouts:
    1. Flat: base_path/model_name/model.config
    2. Gazebo Fuel: base_path/owner/models/model_name/version/model.config

    Returns a list of model descriptors.
    """
    models = []
    if not base_path or not os.path.isdir(base_path):
        return models

    seen_names = set()

    # Strategy 1: Direct children (flat layout)
    for entry in sorted(os.listdir(base_path)):
        model_dir = os.path.join(base_path, entry)
        config_path = os.path.join(model_dir, 'model.config')

        if os.path.isdir(model_dir) and os.path.isfile(config_path):
            model = _build_model_descriptor(entry, model_dir, config_path)
            if model and model['name'] not in seen_names:
                models.append(model)
                seen_names.add(model['name'])

    # Strategy 2: Gazebo Fuel layout (owner/models/model_name/version/)
    # Walk up to 3 levels deep looking for model.config files
    for owner_entry in sorted(os.listdir(base_path)):
        models_dir = os.path.join(base_path, owner_entry, 'models')
        if not os.path.isdir(models_dir):
            continue

        for model_entry in sorted(os.listdir(models_dir)):
            model_parent = os.path.join(models_dir, model_entry)
            if not os.path.isdir(model_parent):
                continue

            # Find the latest version directory (highest number)
            version_dirs = []
            for v in os.listdir(model_parent):
                v_path = os.path.join(model_parent, v)
                if os.path.isdir(v_path) and os.path.isfile(os.path.join(v_path, 'model.config')):
                    try:
                        version_dirs.append((int(v), v_path))
                    except ValueError:
                        version_dirs.append((0, v_path))

            if not version_dirs:
                continue

            # Use the latest version
            version_dirs.sort(reverse=True)
            _, model_dir = version_dirs[0]
            config_path = os.path.join(model_dir, 'model.config')

            model = _build_model_descriptor(model_entry, model_dir, config_path)
            if model and model['name'] not in seen_names:
                models.append(model)
                seen_names.add(model['name'])

    models.sort(key=lambda m: m['display_name'].lower())
    return models


def _build_model_descriptor(dir_name, model_dir, config_path):
    """Build a model descriptor dict from a model directory."""
    model = {
        'name': dir_name,
        'display_name': dir_name,
        'description': '',
        'meshes': [],
        'thumbnail': None,
        'path': model_dir,
    }

    # Parse model.config for display name and description
    try:
        config_info = parse_model_config(config_path)
        model['display_name'] = config_info.get('name', dir_name)
        model['description'] = config_info.get('description', '')
    except (ET.ParseError, OSError) as e:
        print(f"Warning: Failed to parse model config {config_path}: {e}")

    # Find mesh references from model.sdf
    sdf_path = os.path.join(model_dir, 'model.sdf')
    if os.path.isfile(sdf_path):
        try:
            model['meshes'] = find_mesh_references(sdf_path, model_dir)
        except (ET.ParseError, OSError) as e:
            print(f"Warning: Failed to parse mesh references from {sdf_path}: {e}")

    # Extract collision bounds for extent visualization
    if os.path.isfile(sdf_path):
        try:
            model['bounds'] = extract_model_bounds(sdf_path)
        except (ET.ParseError, OSError) as e:
            print(f"Warning: Failed to extract bounds from {sdf_path}: {e}")
            model['bounds'] = None
    else:
        model['bounds'] = None

    # Check for thumbnail
    for thumb_name in ['thumbnails/default.png', 'thumbnails/1.png', 'thumbnail.png', 'thumb.png']:
        thumb_path = os.path.join(model_dir, thumb_name)
        if os.path.isfile(thumb_path):
            model['thumbnail'] = thumb_name
            break

    return model


def get_default_model_paths():
    """Return a list of common Gazebo model directories that exist on this system."""
    home = os.path.expanduser('~')
    candidates = [
        os.path.join(home, '.gz', 'fuel', 'fuel.gazebosim.org'),
        os.path.join(home, '.gazebo', 'models'),
        '/usr/share/gz/models',
        '/usr/share/gazebo/models',
    ]

    # Check GZ_SIM_RESOURCE_PATH
    gz_path = os.environ.get('GZ_SIM_RESOURCE_PATH', '')
    if gz_path:
        for p in gz_path.split(':'):
            p = p.strip()
            if p and p not in candidates:
                candidates.append(p)

    return [p for p in candidates if os.path.isdir(p)]


def parse_model_config(config_path):
    """Parse a Gazebo model.config XML file."""
    tree = ET.parse(config_path)
    root = tree.getroot()

    result = {}
    name_el = root.find('name')
    if name_el is not None and name_el.text:
        result['name'] = name_el.text.strip()

    desc_el = root.find('description')
    if desc_el is not None and desc_el.text:
        result['description'] = desc_el.text.strip()

    return result


def find_mesh_references(sdf_path, model_dir):
    """Find mesh file references in a model.sdf file."""
    tree = ET.parse(sdf_path)
    root = tree.getroot()

    meshes = []
    seen = set()

    # Search for all <mesh> elements under <visual> or <collision>
    for mesh_el in root.iter('mesh'):
        uri_el = mesh_el.find('uri')
        if uri_el is None or not uri_el.text:
            continue

        uri = uri_el.text.strip()

        # Handle model:// URIs - extract relative path
        if uri.startswith('model://'):
            # model://model_name/meshes/file.dae -> meshes/file.dae
            parts = uri.split('/', 3)
            if len(parts) >= 4:
                rel_path = parts[3]
            else:
                continue
        elif uri.startswith('file://'):
            rel_path = uri[7:]
        # Handle Fuel HTTPS URIs
        # https://fuel.gazebosim.org/1.0/owner/models/name/version/files/path
        elif uri.startswith('https://fuel.gazebosim.org/'):
            # Extract path after 'files/'
            if '/files/' in uri:
                rel_path = uri.split('/files/', 1)[1]
            else:
                continue
        else:
            rel_path = uri

        if rel_path in seen:
            continue
        seen.add(rel_path)

        # Determine file type
        ext = os.path.splitext(rel_path)[1].lower()
        mesh_type = {'.dae': 'dae', '.stl': 'stl', '.obj': 'obj', '.glb': 'glb'}.get(ext)
        if not mesh_type:
            continue

        # Check file actually exists
        full_path = os.path.join(model_dir, rel_path)
        if not os.path.isfile(full_path):
            continue

        # Get scale if present
        scale = [1, 1, 1]
        scale_el = mesh_el.find('scale')
        if scale_el is not None and scale_el.text:
            try:
                scale = [float(v) for v in scale_el.text.strip().split()]
            except ValueError:
                pass

        meshes.append({
            'path': rel_path,
            'type': mesh_type,
            'scale': scale,
        })

    return meshes



def extract_model_bounds(sdf_path):
    """Extract overall bounding box from SDF collision geometry.

    Returns dict with x, y, z dimensions in meters, or None if not determinable.
    """
    try:
        tree = ET.parse(sdf_path)
        root = tree.getroot()
    except (ET.ParseError, OSError) as e:
        print(f"Warning: Failed to parse SDF {sdf_path}: {e}")
        return None

    min_coords = [float('inf')] * 3
    max_coords = [float('-inf')] * 3
    found_any = False

    for link_el in root.iter('link'):
        # Get link pose offset
        link_pose = _parse_pose(link_el.find('pose'))

        for collision_el in link_el.iter('collision'):
            # Get collision pose offset
            collision_pose = _parse_pose(collision_el.find('pose'))

            box_el = collision_el.find('.//box/size')
            if box_el is not None and box_el.text:
                try:
                    sx, sy, sz = [float(v) for v in box_el.text.strip().split()]
                except (ValueError, IndexError):
                    continue

                # Center of this box in model frame
                cx = link_pose[0] + collision_pose[0]
                cy = link_pose[1] + collision_pose[1]
                cz = link_pose[2] + collision_pose[2]

                # Min/max corners
                for i, (c, s) in enumerate([(cx, sx), (cy, sy), (cz, sz)]):
                    min_coords[i] = min(min_coords[i], c - s / 2)
                    max_coords[i] = max(max_coords[i], c + s / 2)
                found_any = True

            # Also check for cylinder
            cyl_radius = collision_el.find('.//cylinder/radius')
            cyl_length = collision_el.find('.//cylinder/length')
            if cyl_radius is not None and cyl_length is not None:
                try:
                    r = float(cyl_radius.text.strip())
                    l = float(cyl_length.text.strip())
                except ValueError:
                    continue
                cx = link_pose[0] + collision_pose[0]
                cy = link_pose[1] + collision_pose[1]
                cz = link_pose[2] + collision_pose[2]
                min_coords[0] = min(min_coords[0], cx - r)
                max_coords[0] = max(max_coords[0], cx + r)
                min_coords[1] = min(min_coords[1], cy - r)
                max_coords[1] = max(max_coords[1], cy + r)
                min_coords[2] = min(min_coords[2], cz - l / 2)
                max_coords[2] = max(max_coords[2], cz + l / 2)
                found_any = True

    if not found_any:
        return None

    return {
        "x": round(max_coords[0] - min_coords[0], 2),
        "y": round(max_coords[1] - min_coords[1], 2),
        "z": round(max_coords[2] - min_coords[2], 2),
    }


def _parse_pose(pose_el):
    """Parse a <pose> element, returning [x, y, z, roll, pitch, yaw]."""
    if pose_el is None or not pose_el.text:
        return [0, 0, 0, 0, 0, 0]
    try:
        vals = [float(v) for v in pose_el.text.strip().split()]
        while len(vals) < 6:
            vals.append(0)
        return vals
    except ValueError:
        return [0, 0, 0, 0, 0, 0]
