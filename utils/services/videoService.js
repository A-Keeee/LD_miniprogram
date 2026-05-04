import { PetStatus, VideoProvider } from '../types.js';

// WeChat <video> component requires network URLs or temp file paths from wx APIs
// Local package paths like /static/video/xxx.mp4 are NOT supported

// Package paths to local bundled video files (used to copy to temp storage)
const PACKAGE_VIDEO_FILES = {
  [PetStatus.SLEEPING]: 'static/video/sleeping.mp4',
  [PetStatus.PLAYING]: 'static/video/playing.mp4',
  [PetStatus.EATING]: 'static/video/eating.mp4',
  [PetStatus.WAITING]: 'static/video/waiting.mp4',
  [PetStatus.GROOMING]: 'static/video/grooming.mp4',
  [PetStatus.SHAKING]: 'static/video/shaking.mp4',
  [PetStatus.OBSERVING]: 'static/video/waiting.mp4',
};

// Remote fallback demo videos (same strategy as web version)
const REMOTE_DEMO_VIDEOS = {
  [PetStatus.SLEEPING]: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  [PetStatus.PLAYING]: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  [PetStatus.EATING]: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  [PetStatus.WAITING]: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  [PetStatus.GROOMING]: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  [PetStatus.SHAKING]: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  [PetStatus.OBSERVING]: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
};

// Cache of copied file paths (package → temp user storage)
const videoPathCache = {};

/**
 * Copy a video from the mini program package to user data storage
 * so it can be used as a valid <video> src.
 */
const copyVideoToUserStorage = (status) => {
  return new Promise((resolve, reject) => {
    // Return cached path if already copied
    if (videoPathCache[status]) {
      resolve(videoPathCache[status]);
      return;
    }

    const packagePath = PACKAGE_VIDEO_FILES[status];
    if (!packagePath) {
      reject(new Error('No video file for status: ' + status));
      return;
    }

    const fs = wx.getFileSystemManager();
    const destDir = `${wx.env.USER_DATA_PATH}/video`;
    const fileName = packagePath.split('/').pop();
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
      srcPath: packagePath,
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
 * Get a playable video URL for the pet's current status.
 * Strategy: copy local file to temp → use temp path
 */
export const getPetStatusVideo = async (pet, settings) => {
  try {
    const tempPath = await copyVideoToUserStorage(pet.currentStatus);
    return tempPath;
  } catch (e) {
    console.warn('[Video] Could not prepare local video:', e.message || e);
    return REMOTE_DEMO_VIDEOS[pet.currentStatus] || null;
  }
};

export const getRemoteFallback = (pet) => {
  return REMOTE_DEMO_VIDEOS[pet.currentStatus] || null;
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
