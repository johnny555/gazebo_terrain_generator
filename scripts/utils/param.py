import os
from pathlib import Path


class globalParam:

    TEMP_PATH = str(Path(__file__).resolve().parents[2] / 'temp')
    OUTPUT_BASE_PATH = str(Path(__file__).resolve().parents[2] / 'output')

    GAZEBO_MODEL_PATH = os.path.join(OUTPUT_BASE_PATH, 'gazebo_terrain')
    GAZEBO_WORLD_PATH = os.path.join(OUTPUT_BASE_PATH, 'gazebo_terrain', 'worlds')
    DEM_RESOLUTION = 13

    DEM_PATH = os.path.join(OUTPUT_BASE_PATH, 'dem')
    HELIPAD_MODEL = "https://fuel.gazebosim.org/1.0/saiaravind19/models/helipad"
    TEMPORARY_SATELLITE_IMAGE = os.path.join(TEMP_PATH, 'gazebo_terrian')
    TEMPLATE_DIR_PATH = str(Path(__file__).resolve().parents[2] / 'templates')

    # Configured at runtime via /api/configure
    MAPBOX_API_KEY = None
    MODEL_LIBRARY_PATHS = []  # List of directories to scan for models

    @classmethod
    def configure(cls, mapbox_key=None, output_dir=None, model_library_dir=None, model_library_dirs=None):
        """Configure runtime parameters."""
        if mapbox_key:
            cls.MAPBOX_API_KEY = mapbox_key
        if output_dir:
            cls.OUTPUT_BASE_PATH = os.path.abspath(output_dir)
            cls.GAZEBO_MODEL_PATH = os.path.join(cls.OUTPUT_BASE_PATH, 'gazebo_terrain')
            cls.GAZEBO_WORLD_PATH = os.path.join(cls.OUTPUT_BASE_PATH, 'gazebo_terrain', 'worlds')
            cls.DEM_PATH = os.path.join(cls.OUTPUT_BASE_PATH, 'dem')
            cls.TEMP_PATH = os.path.join(cls.OUTPUT_BASE_PATH, 'temp')
            cls.TEMPORARY_SATELLITE_IMAGE = os.path.join(cls.TEMP_PATH, 'gazebo_terrian')
        if model_library_dirs:
            cls.MODEL_LIBRARY_PATHS = [os.path.abspath(d) for d in model_library_dirs]
        elif model_library_dir:
            cls.MODEL_LIBRARY_PATHS = [os.path.abspath(model_library_dir)]

    @classmethod
    def add_model_path(cls, path):
        """Add a model library path if not already present."""
        abs_path = os.path.abspath(path)
        if abs_path not in cls.MODEL_LIBRARY_PATHS:
            cls.MODEL_LIBRARY_PATHS.append(abs_path)

    @classmethod
    def remove_model_path(cls, path):
        """Remove a model library path."""
        abs_path = os.path.abspath(path)
        cls.MODEL_LIBRARY_PATHS = [p for p in cls.MODEL_LIBRARY_PATHS if p != abs_path]

    @classmethod
    def load_env(cls):
        """Load configuration from .env.local file if present."""
        env_path = Path(__file__).resolve().parents[2] / '.env.local'
        if env_path.is_file():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        if key == 'MAPBOX_API_KEY' and value:
                            cls.MAPBOX_API_KEY = value
