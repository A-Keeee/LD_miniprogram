import { PetStatus, VideoProvider } from '../types.js';
import request from '../../api/request';
import { cloudConfig } from '../../config/index.js';
import { getActiveDeviceId } from './deviceService.js';

// WeChat <video> component requires network URLs or temp file paths from wx APIs
// Local package paths like /static/video/xxx.mp4 are NOT supported

// Package paths to local bundled video files (used to copy to temp storage)
const PACKAGE_VIDEO_FILES = {
  [PetStatus.SLEEPING]: '/static/video/sleeping.mp4',
  [PetStatus.WALKING]: '/static/video/walking.mp4',
  [PetStatus.EATING]: '/static/video/eating.mp4',
  [PetStatus.WAITING]: '/static/video/waiting.mp4',
  [PetStatus.GROOMING]: '/static/video/grooming.mp4',
  [PetStatus.SHAKING]: '/static/video/shaking.mp4',
  [PetStatus.OBSERVING]: '/static/video/waiting.mp4',
};

const USER_PHONE_STORAGE_KEY = 'user_phone';
const GENERATED_VIDEO_CACHE_KEY = 'generated_video_cache_v4';
const GENERATED_VIDEO_DIR_NAME = 'generated-video';

// Cache of copied file paths (package → temp user storage)
const videoPathCache = {};
const generatedVideoPathCache = {};
const generatedVideoDownloadTasks = {};
let _currentAccountPhone = '';

const getCurrentDeviceKey = (deviceId) => String(deviceId || getActiveDeviceId() || '').trim();

const memoryCacheKey = (phone, deviceId, status) => `${phone}::${deviceId}::${status}`;

const getGeneratedVideoDir = () => `${wx.env.USER_DATA_PATH}/${GENERATED_VIDEO_DIR_NAME}`;

const safeFileNamePart = (value) => {
  const safe = String(value || '').trim().replace(/[^A-Za-z0-9._-]/g, '_');
  return safe || 'unknown';
};

const hashString = (value) => {
  const raw = String(value || '');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 1000000007;
  }
  return String(hash);
};

const getGeneratedVideoFilePath = (phone, deviceId, status) => {
  const key = memoryCacheKey(phone, deviceId, status);
  const fileName = [
    safeFileNamePart(phone),
    safeFileNamePart(deviceId),
    safeFileNamePart(status),
    hashString(key),
  ].join('-');
  return `${getGeneratedVideoDir()}/${fileName}.mp4`;
};

const getCacheEntryPath = (entry) => {
  if (!entry) {
    return '';
  }
  if (typeof entry === 'string') {
    return entry;
  }
  return String(entry.path || '').trim();
};

const ensureDirectory = (dirPath) => {
  const fs = wx.getFileSystemManager();
  try {
    fs.accessSync(dirPath);
    return true;
  } catch (e) {
    try {
      fs.mkdirSync(dirPath, true);
      return true;
    } catch (mkdirErr) {
      console.warn('[Video] Failed to create cache dir:', mkdirErr);
      return false;
    }
  }
};

const removeLocalFile = (path) => {
  const p = String(path || '').trim();
  if (!p) {
    return;
  }
  try {
    wx.getFileSystemManager().unlinkSync(p);
  } catch (e) {
    // Ignore missing files and failed cleanup; cache will be retried later.
  }
};

const cancelGeneratedVideoDownload = (phone, deviceId, status) => {
  const memKey = memoryCacheKey(phone, deviceId, status);
  const task = generatedVideoDownloadTasks[memKey];
  if (!task) {
    return;
  }
  task.canceled = true;
  if (task.downloadTask && typeof task.downloadTask.abort === 'function') {
    task.downloadTask.abort();
  }
  delete generatedVideoDownloadTasks[memKey];
};

export const setCurrentAccountPhone = (phone) => {
  const p = String(phone || '').trim();
  if (p === _currentAccountPhone) {
    return;
  }
  _currentAccountPhone = p;
  Object.keys(generatedVideoPathCache).forEach((k) => {
    delete generatedVideoPathCache[k];
  });
  try {
    if (p) {
      wx.setStorageSync(USER_PHONE_STORAGE_KEY, p);
    } else {
      wx.removeStorageSync(USER_PHONE_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('[Video] Failed to persist account phone:', e);
  }
};

const getCurrentAccountKey = () => {
  if (_currentAccountPhone) {
    return _currentAccountPhone;
  }
  try {
    const p = String(wx.getStorageSync(USER_PHONE_STORAGE_KEY) || '').trim();
    if (p) {
      _currentAccountPhone = p;
    }
    return p;
  } catch (e) {
    return '';
  }
};

const readAllGeneratedVideoCache = () => {
  try {
    const saved = wx.getStorageSync(GENERATED_VIDEO_CACHE_KEY);
    if (saved && typeof saved === 'object') {
      return saved;
    }
  } catch (e) {
    // Ignore malformed cache metadata; the file can be downloaded again.
  }
  return {};
};

const writeAllGeneratedVideoCache = (map) => {
  try {
    wx.setStorageSync(GENERATED_VIDEO_CACHE_KEY, map || {});
  } catch (e) {
    console.warn('[Video] Failed to persist generated cache map:', e);
  }
};

const readDeviceGeneratedVideoCache = (phone, deviceId) => {
  const p = String(phone || '').trim();
  const d = getCurrentDeviceKey(deviceId);
  if (!p || !d) {
    return {};
  }
  const all = readAllGeneratedVideoCache();
  const accountMap = all[p];
  if (!accountMap || typeof accountMap !== 'object') {
    return {};
  }
  const deviceMap = accountMap[d];
  return deviceMap && typeof deviceMap === 'object' ? deviceMap : {};
};

const writeGeneratedVideoCacheEntry = (phone, deviceId, status, path) => {
  const p = String(phone || '').trim();
  const d = getCurrentDeviceKey(deviceId);
  const s = String(status || '').trim();
  const filePath = String(path || '').trim();
  if (!p || !d || !s || !filePath) {
    return;
  }
  const all = readAllGeneratedVideoCache();
  if (!all[p] || typeof all[p] !== 'object') {
    all[p] = {};
  }
  if (!all[p][d] || typeof all[p][d] !== 'object') {
    all[p][d] = {};
  }
  all[p][d][s] = filePath;
  writeAllGeneratedVideoCache(all);
};

const removeGeneratedCacheEntry = (phone, status, deviceId, options = {}) => {
  const p = String(phone || '').trim();
  const s = String(status || '').trim();
  if (!p || !s) {
    return;
  }
  const targetDevice = getCurrentDeviceKey(deviceId);
  const deleteFile = options.deleteFile !== false;
  const all = readAllGeneratedVideoCache();
  const accountMap = all[p] && typeof all[p] === 'object' ? all[p] : {};
  const deviceIds = targetDevice ? [targetDevice] : Object.keys(accountMap);
  let changed = false;

  deviceIds.forEach((d) => {
    cancelGeneratedVideoDownload(p, d, s);
    const deviceMap = accountMap[d];
    if (
      !deviceMap ||
      typeof deviceMap !== 'object' ||
      !Object.prototype.hasOwnProperty.call(deviceMap, s)
    ) {
      return;
    }
    const path = getCacheEntryPath(deviceMap[s]);
    if (deleteFile) {
      removeLocalFile(path);
    }
    delete deviceMap[s];
    delete generatedVideoPathCache[memoryCacheKey(p, d, s)];
    if (Object.keys(deviceMap).length === 0) {
      delete accountMap[d];
    }
    changed = true;
  });

  if (Object.keys(accountMap).length === 0) {
    delete all[p];
  }
  if (changed) {
    writeAllGeneratedVideoCache(all);
  }
};

const verifyLocalVideoFile = (path) => {
  const p = String(path || '').trim();
  if (!p) {
    return '';
  }
  try {
    wx.getFileSystemManager().accessSync(p);
    return p;
  } catch (e) {
    return '';
  }
};

const getGeneratedVideoPath = (status, deviceId) => {
  const phone = getCurrentAccountKey();
  const deviceKey = getCurrentDeviceKey(deviceId);
  const s = String(status || '').trim();
  if (!s || !phone || !deviceKey) {
    return '';
  }
  const memKey = memoryCacheKey(phone, deviceKey, s);
  if (generatedVideoPathCache[memKey]) {
    const cached = verifyLocalVideoFile(generatedVideoPathCache[memKey]);
    if (cached) {
      return cached;
    }
    delete generatedVideoPathCache[memKey];
  }
  const map = readDeviceGeneratedVideoCache(phone, deviceKey);
  const path = getCacheEntryPath(map[s]);
  if (!path) {
    return '';
  }
  const verified = verifyLocalVideoFile(path);
  if (verified) {
    generatedVideoPathCache[memKey] = verified;
    return verified;
  }
  removeGeneratedCacheEntry(phone, s, deviceKey);
  return '';
};

const packageVideoPath = (status) => {
  const raw = PACKAGE_VIDEO_FILES[status];
  if (!raw) {
    return '';
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const packageVideoExists = (status) => {
  const path = packageVideoPath(status);
  if (!path) {
    return false;
  }
  try {
    wx.getFileSystemManager().accessSync(path);
    return true;
  } catch (e) {
    return false;
  }
};

const getAccessToken = () => {
  try {
    return String(wx.getStorageSync('access_token') || '').trim();
  } catch (e) {
    return '';
  }
};

const getAuthDownloadHeader = () => {
  const header = {};
  const token = getAccessToken();
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }
  return header;
};

const createDownloadError = (message, detail = {}) => Object.assign(new Error(message), detail);

const getBackendVideoFileUrl = (state, deviceId) => {
  const base = (cloudConfig.localBackendBaseUrl || '').replace(/\/$/, '');
  const s = encodeURIComponent(String(state || '').trim());
  const d = encodeURIComponent(String(deviceId || getActiveDeviceId() || '').trim());
  return `${base}/api/video/tasks/${s}/file?device_id=${d}`;
};

export const getBackendVideoStreamUrl = (state, deviceId) => {
  const url = getBackendVideoFileUrl(state, deviceId);
  const token = getAccessToken();
  if (!token) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
};

export const getBackendVideoHttpHeader = () => getAuthDownloadHeader();

/**
 * Copy a video from the mini program package to user data storage
 * so it can be used as a valid <video> src.
 */
const copyVideoToUserStorage = (status) => new Promise((resolve, reject) => {
  if (videoPathCache[status]) {
    resolve(videoPathCache[status]);
    return;
  }

  const srcPath = packageVideoPath(status);
  if (!srcPath || !packageVideoExists(status)) {
    reject(new Error('package_video_missing'));
    return;
  }

  const fs = wx.getFileSystemManager();
  const destDir = `${wx.env.USER_DATA_PATH}/video`;
  const fileName = srcPath.split('/').pop();
  const destPath = `${destDir}/${fileName}`;

  // Ensure directory exists
  try {
    fs.accessSync(destDir);
  } catch (e) {
    try {
      fs.mkdirSync(destDir, true);
    } catch (mkdirErr) {
      console.error('[Video] Failed to create dir:', mkdirErr);
    }
  }

  // Check if file already exists
  try {
    fs.accessSync(destPath);
    videoPathCache[status] = destPath;
    resolve(destPath);
    return;
  } catch (e) {
    // File doesn't exist, need to copy
  }

  // Copy from package to user storage
  fs.copyFile({
    srcPath,
    destPath: destPath,
    success: () => {
      videoPathCache[status] = destPath;
      resolve(destPath);
    },
    fail: (err) => {
      console.error('[Video] Copy failed:', err);
      reject(err);
    }
  });
});

export async function getStatusVideoTask(state, deviceId) {
  const s = String(state || '').trim();
  if (!s) {
    throw new Error('missing_state');
  }
  const id = deviceId || getActiveDeviceId();
  if (!id) {
    throw new Error('missing_device_id');
  }
  const res = await request(
    `/api/video/tasks/${encodeURIComponent(s)}?device_id=${encodeURIComponent(id)}`,
    'get'
  );
  return res.data;
}

/**
 * Resolve playable video for a status.
 * Strategy: local AI cache → GET /api/video/tasks/<state> → optional bundled preset
 */
export const resolveStatusVideoUrl = async (status, options = {}) => {
  const s = String(status || '').trim();
  const allowPresetFallback = Boolean(options && options.allowPresetFallback);
  const skipBackend = Boolean(options && options.skipBackend);
  const deviceId = getCurrentDeviceKey(options && options.deviceId);
  if (!s) {
    return { url: null, pending: false };
  }

  const generatedPath = getGeneratedVideoPath(s, deviceId);
  if (generatedPath) {
    return { url: generatedPath, pending: false, source: 'local' };
  }

  if (!skipBackend) {
    try {
      const task = await getStatusVideoTask(s, deviceId);
      const taskStatus = String((task && task.status) || '').toLowerCase();
      if (taskStatus === 'succeeded' && task.video_ready) {
        return {
          url: getBackendVideoStreamUrl(s, deviceId),
          pending: false,
          source: 'backend',
          remote: true,
        };
      }
      if (taskStatus === 'succeeded' && !task.video_ready) {
        return { url: null, pending: true, source: 'backend_caching' };
      }
      if (taskStatus && taskStatus !== 'failed') {
        return { url: null, pending: true, source: 'backend_pending' };
      }
    } catch (e) {
      console.warn('[Video] backend task lookup failed for', s, e);
    }
  }

  if (allowPresetFallback && packageVideoExists(s)) {
    try {
      const preset = await copyVideoToUserStorage(s);
      return { url: preset, pending: false, source: 'preset' };
    } catch (e) {
      console.warn('[Video] Could not prepare preset video:', e.message || e);
    }
  }

  return { url: null, pending: false };
};

/**
 * Get a playable video URL for the pet's current status.
 */
export const getPetStatusVideo = async (pet, options = {}) => {
  const deviceId = (options && options.deviceId) || (pet && pet.deviceId);
  return resolveStatusVideoUrl(pet && pet.currentStatus, { ...options, deviceId });
};

export const getRemoteFallback = (pet) => null;

export const hasStatusVideo = (status) => {
  const s = String(status || '').trim();
  return Boolean(s);
};

export const getInitialVideoSettings = () => {
  try {
    const saved = wx.getStorageSync('pet_video_settings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // Ignore invalid settings and fall back to defaults.
  }

  return {
    provider: VideoProvider.LOCAL,
    apiKey: '',
    modelName: 'kling-v1',
    apiEndpoint: ''
  };
};

export const saveVideoSettings = (settings) => {
  try {
    wx.setStorageSync('pet_video_settings', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save video settings:', e);
  }
};

export const clearGeneratedVideoForState = (state) => {
  const phone = getCurrentAccountKey();
  const deviceId = getCurrentDeviceKey();
  removeGeneratedCacheEntry(phone, state, deviceId);
};

export const getGeneratedVideoCacheStatus = (states, options = {}) => {
  const list = Array.isArray(states) ? states : [];
  const deviceId = getCurrentDeviceKey(options && options.deviceId);
  const items = list.map((state) => {
    const s = String(state || '').trim();
    return {
      state: s,
      cached: Boolean(s && getGeneratedVideoPath(s, deviceId)),
    };
  });

  const cachedCount = items.filter((item) => item.cached).length;
  return {
    cachedCount,
    total: items.length,
    items,
  };
};

export const createStatusVideoTask = async (state, options = {}) => {
  const s = String(state || '').trim();
  if (!s) {
    throw new Error('missing_state');
  }
  const force = Boolean(options && options.force);
  const deviceId = (options && options.deviceId) || getActiveDeviceId();
  if (!deviceId) {
    throw new Error('missing_device_id');
  }
  const res = await request('/api/video/tasks', 'post', { state: s, force, device_id: deviceId });
  return res.data;
};

/** Whether this status already has (or is generating) an AI video — not bundled presets. */
export const hasAiGeneratedVideoForState = async (state) => {
  const s = String(state || '').trim();
  if (!s) {
    return false;
  }
  if (getGeneratedVideoPath(s)) {
    return true;
  }
  try {
    const task = await getStatusVideoTask(s);
    const taskStatus = String((task && task.status) || '').toLowerCase();
    if (taskStatus === 'succeeded' && task.video_ready) {
      return true;
    }
    if (taskStatus === 'succeeded' && !task.video_ready) {
      return true;
    }
    if (taskStatus && taskStatus !== 'failed') {
      return true;
    }
  } catch (e) {
    // task_not_found or network: treat as not created
  }
  return false;
};

export const filterStatesNeedingAiVideo = async (states) => {
  const list = Array.isArray(states) ? states : [];
  const needing = [];

  await list.reduce((chain, state) => chain.then(async () => {
    const created = await hasAiGeneratedVideoForState(state);
    if (!created) {
      needing.push(state);
    }
  }), Promise.resolve());

  return needing;
};

export const cacheGeneratedVideoForState = (state, options = {}) => {
  const s = String(state || '').trim();
  if (!s) {
    return Promise.reject(new Error('missing_state'));
  }
  const phone = getCurrentAccountKey();
  const deviceId = getCurrentDeviceKey(options && options.deviceId);
  if (!phone || !deviceId) {
    return Promise.reject(new Error('missing_cache_context'));
  }

  const cached = getGeneratedVideoPath(s, deviceId);
  if (cached) {
    return Promise.resolve(cached);
  }

  const memKey = memoryCacheKey(phone, deviceId, s);
  const existingTask = generatedVideoDownloadTasks[memKey];
  if (existingTask && existingTask.promise) {
    return existingTask.promise;
  }

  const filePath = getGeneratedVideoFilePath(phone, deviceId, s);
  const existingFile = verifyLocalVideoFile(filePath);
  if (existingFile) {
    generatedVideoPathCache[memKey] = existingFile;
    writeGeneratedVideoCacheEntry(phone, deviceId, s, existingFile);
    return Promise.resolve(existingFile);
  }

  if (!ensureDirectory(getGeneratedVideoDir())) {
    return Promise.reject(new Error('cache_dir_unavailable'));
  }
  removeLocalFile(filePath);

  const downloadUrl = getBackendVideoFileUrl(s, deviceId);
  const taskState = {
    canceled: false,
    downloadTask: null,
    promise: null,
  };
  generatedVideoDownloadTasks[memKey] = taskState;

  taskState.promise = new Promise((resolve, reject) => {
    const failDownload = (err) => {
      removeLocalFile(filePath);
      reject(err || new Error('download_failed'));
    };

    try {
      taskState.downloadTask = wx.downloadFile({
        url: downloadUrl,
        header: getAuthDownloadHeader(),
        filePath,
        success: (res) => {
          if (taskState.canceled) {
            failDownload(createDownloadError('download_canceled', {
              deviceId,
              state: s,
              url: downloadUrl,
            }));
            return;
          }
          if (res.statusCode !== 200) {
            failDownload(createDownloadError(`download_status_${res.statusCode}`, {
              deviceId,
              state: s,
              statusCode: res.statusCode,
              url: downloadUrl,
            }));
            return;
          }

          const savedPath = verifyLocalVideoFile(res.filePath || filePath);
          if (!savedPath) {
            failDownload(createDownloadError('download_file_missing', {
              deviceId,
              state: s,
              url: downloadUrl,
            }));
            return;
          }

          generatedVideoPathCache[memKey] = savedPath;
          writeGeneratedVideoCacheEntry(phone, deviceId, s, savedPath);
          resolve(savedPath);
        },
        fail: (err) => {
          failDownload(createDownloadError('download_failed', {
            deviceId,
            state: s,
            errMsg: err && err.errMsg,
            errno: err && err.errno,
            raw: err,
            url: downloadUrl,
          }));
        },
        complete: () => {
          if (generatedVideoDownloadTasks[memKey] === taskState) {
            delete generatedVideoDownloadTasks[memKey];
          }
        },
      });
    } catch (err) {
      if (generatedVideoDownloadTasks[memKey] === taskState) {
        delete generatedVideoDownloadTasks[memKey];
      }
      failDownload(err);
    }
  });

  return taskState.promise;
};
