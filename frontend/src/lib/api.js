const API_BASE = '';

export async function configure(config) {
  const res = await fetch(`${API_BASE}/api/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function getConfig() {
  const res = await fetch(`${API_BASE}/api/config`);
  return res.json();
}

export async function getModels() {
  const res = await fetch(`${API_BASE}/api/models`);
  return res.json();
}

export async function getTerrainInfo() {
  const res = await fetch(`${API_BASE}/api/terrain-info`);
  return res.json();
}

export async function getHeightmapElevation(x, y) {
  const res = await fetch(`${API_BASE}/api/heightmap-elevation?x=${x}&y=${y}`);
  return res.json();
}

export async function generateWorld(models) {
  const res = await fetch(`${API_BASE}/api/generate-world`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models }),
  });
  return res.json();
}

export async function startDownload(formData) {
  const res = await fetch(`${API_BASE}/start-download`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function downloadTile(formData) {
  const res = await fetch(`${API_BASE}/download-tile`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function endDownload(formData) {
  const res = await fetch(`${API_BASE}/end-download`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function getTaskStatus() {
  const res = await fetch(`${API_BASE}/task-status`);
  return res.json();
}

export function getTerrainImageUrl() {
  return `${API_BASE}/api/terrain-image?t=${Date.now()}`;
}

export function getThumbnailUrl(modelName) {
  return `${API_BASE}/api/models/${modelName}/thumbnail`;
}

export async function getModelPaths() {
  const res = await fetch(`${API_BASE}/api/model-paths`);
  return res.json();
}

export async function updateModelPath(path, action = 'add') {
  const res = await fetch(`${API_BASE}/api/model-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, action }),
  });
  return res.json();
}

export async function launchGazebo() {
  const res = await fetch(`${API_BASE}/api/launch-gazebo`, { method: 'POST' });
  return res.json();
}

export async function getExportTargets() {
  const res = await fetch(`${API_BASE}/api/export-targets`);
  return res.json();
}

export async function exportWorld(worldsDir, modelsDir) {
  const res = await fetch(`${API_BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worlds_dir: worldsDir, models_dir: modelsDir }),
  });
  return res.json();
}

export async function browseDirs() {
  const res = await fetch(`${API_BASE}/api/browse-dirs`);
  return res.json();
}

export async function listTerrains() {
  const res = await fetch(`${API_BASE}/api/terrains`);
  return res.json();
}

export async function loadTerrain(name) {
  const res = await fetch(`${API_BASE}/api/terrains/${encodeURIComponent(name)}/load`, {
    method: 'POST',
  });
  return res.json();
}
