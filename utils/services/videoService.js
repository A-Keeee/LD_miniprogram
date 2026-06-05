import { PetStatus, VideoProvider } from '../types.js';
import request from '../../api/request';
import appConfig from '../../config/index.js';

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
const GENERATED_VIDEO_CACHE_KEY = 'generated_video_cache_v3';

// Cache of copied file paths (package → temp user storage)
const videoPathCache = {};
const generatedVideoPathCache = {};
let _currentAccountPhone = '';

const memoryCacheKey = (phone, status) => `${phone}::${status}`;

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
  } catch (e) {}
  return {};
};

const writeAllGeneratedVideoCache = (map) => {
  try {
    wx.setStorageSync(GENERATED_VIDEO_CACHE_KEY, map || {});
  } catch (e) {
    console.warn('[Video] Failed to persist generated cache map:', e);
  }
};

const readAccountGeneratedVideoCache = (phone) => {
  const p = String(phone || '').trim();
  if (!p) {
    return {};
  }
  const all = readAllGeneratedVideoCache();
  const accountMap = all[p];
  return accountMap && typeof accountMap === 'object' ? accountMap : {};
};

const writeAccountGeneratedVideoCacheEntry = (phone, status, path) => {
  const p = String(phone || '').trim();
  const s = String(status || '').trim();
  if (!p || !s) {
    return;
  }
  const all = readAllGeneratedVideoCache();
  if (!all[p] || typeof all[p] !== 'object') {
    all[p] = {};
  }
  all[p][s] = path;
  writeAllGeneratedVideoCache(all);
};

const removeGeneratedCacheEntry = (phone, status) => {
  const p = String(phone || '').trim();
  const s = String(status || '').trim();
  if (!p || !s) {
    return;
  }
  const all = readAllGeneratedVideoCache();
  if (!all[p] || !all[p][s]) {
    return;
  }
  delete all[p][s];
  if (Object.keys(all[p]).length === 0) {
    delete all[p];
  }
  writeAllGeneratedVideoCache(all);
  delete generatedVideoPathCache[memoryCacheKey(p, s)];
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

const getGeneratedVideoPath = (status) => {
  const phone = getCurrentAccountKey();
  const s = String(status || '').trim();
  if (!s) {
    return '';
  }
  const memKey = phone ? memoryCacheKey(phone, s) : '';
  if (memKey && generatedVideoPathCache[memKey]) {
    const cached = verifyLocalVideoFile(generatedVideoPathCache[memKey]);
    if (cached) {
      return cached;
    }
    delete generatedVideoPathCache[memKey];
  }
  if (!phone) {
    return '';
  }
  const map = readAccountGeneratedVideoCache(phone);
  const path = String(map[s] || '').trim();
  if (!path) {
    return '';
  }
  const verified = verifyLocalVideoFile(path);
  if (verified) {
    generatedVideoPathCache[memKey] = verified;
    return verified;
  }
  removeGeneratedCacheEntry(phone, s);
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

const getBackendVideoFileUrl = (state) => {
  const base = (appConfig.cloudConfig.localBackendBaseUrl || '').replace(/\/$/, '');
  const s = encodeURIComponent(String(state || '').trim());
  return `${base}/api/video/tasks/${s}/file`;
};

export const getBackendVideoStreamUrl = (state) => {
  const url = getBackendVideoFileUrl(state);
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
const copyVideoToUserStorage = (status) => {
  return new Promise((resolve, reject) => {
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
        console.log('[Video] Copied to user storage:', destPath);
        videoPathCache[status] = destPath;
        resolve(destPath);
      },
      fail: (err) => {
        console.error('[Video] Copy failed:', err);
        reject(err);
      }
    });
  });
};

/**
 * Resolve playable video for a status.
 * Strategy: local AI cache → GET /api/video/tasks/<state> → optional bundled preset
 */
export const resolveStatusVideoUrl = async (status, options = {}) => {
  const s = String(status || '').trim();
  const allowPresetFallback = Boolean(options && options.allowPresetFallback);
  const skipBackend = Boolean(options && options.skipBackend);
  if (!s) {
    return { url: null, pending: false };
  }

  const generatedPath = getGeneratedVideoPath(s);
  if (generatedPath) {
    return { url: generatedPath, pending: false, source: 'local' };
  }

  if (!skipBackend) {
    try {
      const task = await getStatusVideoTask(s);
      const taskStatus = String((task && task.status) || '').toLowerCase();
      if (taskStatus === 'succeeded' && task.video_ready) {
        return {
          url: getBackendVideoStreamUrl(s),
          pending: false,
          source: 'backend',
          remote: true,
        };
      } else if (taskStatus === 'succeeded' && !task.video_ready) {
        return { url: null, pending: true, source: 'backend_caching' };
      } else if (taskStatus && taskStatus !== 'failed') {
        return { url: null, pending: true, source: 'backend_pending' };
      }
    } catch (e) {
      console.log('[Video] backend task lookup failed for', s, e);
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
  const result = await resolveStatusVideoUrl(pet && pet.currentStatus, options);
  return result;
};

export const getRemoteFallback = (pet) => {
  return null;
};

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
  } catch (e) {}

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
  removeGeneratedCacheEntry(phone, state);
};

export const createStatusVideoTask = async (state, options = {}) => {
  const s = String(state || '').trim();
  if (!s) {
    throw new Error('missing_state');
  }
  const force = Boolean(options && options.force);
  // Backend-fixed prompt: mini program must NOT send prompt.
  const res = await request('/api/video/tasks', 'post', { state: s, force });
  return res.data;
};

export const getStatusVideoTask = async (state) => {
  const s = String(state || '').trim();
  if (!s) {
    throw new Error('missing_state');
  }
  const res = await request(`/api/video/tasks/${encodeURIComponent(s)}`, 'get');
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
  for (const state of list) {
    const created = await hasAiGeneratedVideoForState(state);
    if (!created) {
      needing.push(state);
    }
  }
  return needing;
};

export const cacheGeneratedVideoForState = (state) => {
  const s = String(state || '').trim();
  if (!s) {
    return Promise.reject(new Error('missing_state'));
  }
  const cached = getGeneratedVideoPath(s);
  if (cached) {
    return Promise.resolve(cached);
  }
  return Promise.resolve(getBackendVideoStreamUrl(s));
};
