import request from '../../api/request';
import { PetStatus } from '../types.js';

const ACTIVE_DEVICE_KEY = 'active_device_id';
const DEVICES_CACHE_KEY = 'devices_cache';

const ERROR_MAP = {
  invalid_pairing_code: '配对码无效或已被使用',
  already_bound: '设备已被其他用户绑定',
  not_owner: '无权操作该设备',
  missing_pairing_code: '请输入配对码',
  missing_pet_fields: '请填写宠物信息',
  pet_image_too_large: '图片过大，请换一张',
  device_not_found: '设备不存在',
  unauthorized: '请先登录',
  database_unavailable: '服务暂不可用',
};

export function getDeviceErrorMessage(err) {
  const body = (err && err.data) || err || {};
  const key = body.message || body.error;
  return (key && ERROR_MAP[key]) || key || '操作失败';
}

function resolvePetImage(petImage) {
  let baseImage = petImage || '';
  if (typeof baseImage === 'string' && baseImage.startsWith('data:')) {
    try {
      const fs = wx.getFileSystemManager();
      const m = /^data:image\/(\w+);base64,(.+)$/i.exec(baseImage);
      const ext = (m && m[1]) || 'jpg';
      const b64 = (m && m[2]) || (baseImage.includes(',') ? baseImage.split(',')[1] : '');
      if (b64) {
        const path = `${wx.env.USER_DATA_PATH}/pet_avatar_${Date.now()}.${ext}`;
        fs.writeFileSync(path, b64, 'base64');
        baseImage = path;
      }
    } catch (e) {
      console.warn('[Device] resolvePetImage failed', e);
    }
  }
  return baseImage;
}

export function syncPetFromDevice(device) {
  if (!device || !device.pet_name) {
    return null;
  }
  const app = getApp();
  const prev = app.globalData.petProfile || {};
  const profile = {
    name: device.pet_name || '宠物',
    type: device.pet_type || 'cat',
    baseImage: resolvePetImage(device.pet_image),
    deviceId: device.device_id,
    currentStatus: prev.currentStatus || PetStatus.WAITING,
    statusDescription: prev.deviceId === device.device_id
      ? (prev.statusDescription || 'Thinking of you...')
      : 'Thinking of you...',
  };
  app.updatePetProfile(profile);
  return profile;
}

export function getActiveDeviceId() {
  try {
    return String(wx.getStorageSync(ACTIVE_DEVICE_KEY) || '').trim();
  } catch (e) {
    return '';
  }
}

export function setActiveDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  try {
    if (id) {
      wx.setStorageSync(ACTIVE_DEVICE_KEY, id);
    } else {
      wx.removeStorageSync(ACTIVE_DEVICE_KEY);
    }
  } catch (e) {
    console.warn('[Device] setActiveDeviceId failed', e);
  }
}

export function getDevicesCache() {
  try {
    const saved = wx.getStorageSync(DEVICES_CACHE_KEY);
    return Array.isArray(saved) ? saved : [];
  } catch (e) {
    return [];
  }
}

function saveDevicesCache(devices) {
  try {
    wx.setStorageSync(DEVICES_CACHE_KEY, devices || []);
  } catch (e) {
    console.warn('[Device] saveDevicesCache failed', e);
  }
}

export function clearDeviceStorage() {
  setActiveDeviceId('');
  try {
    wx.removeStorageSync(DEVICES_CACHE_KEY);
  } catch (e) {
    console.warn('[Device] clearDeviceStorage failed', e);
  }
}

export async function registerDevice(deviceId, name) {
  const res = await request('/api/devices/register', 'POST', {
    device_id: deviceId,
    name: name || deviceId,
  });
  return res.data;
}

export async function pairDevice(pairingCode, pet) {
  const res = await request('/api/devices/pair', 'POST', {
    pairing_code: String(pairingCode || '').trim().toUpperCase(),
    pet_name: (pet && pet.pet_name) || '',
    pet_image: (pet && pet.pet_image) || '',
    pet_type: (pet && pet.pet_type) || 'cat',
  });
  const device = res.data;
  // listDevices is declared below to keep exported operations grouped by purpose.
  // eslint-disable-next-line no-use-before-define
  const devices = await listDevices();
  if (device && device.device_id) {
    setActiveDeviceId(device.device_id);
    syncPetFromDevice(device);
  }
  return { device, devices };
}

export async function listDevices() {
  const res = await request('/api/devices', 'GET');
  const devices = (res.data && res.data.devices) || [];
  saveDevicesCache(devices);

  const activeId = getActiveDeviceId();
  if (activeId && !devices.some((d) => d.device_id === activeId)) {
    setActiveDeviceId(devices[0] ? devices[0].device_id : '');
  } else if (!activeId && devices.length > 0) {
    setActiveDeviceId(devices[0].device_id);
  }

  return devices;
}

export async function setActiveDevice(deviceId) {
  const res = await request('/api/devices/active', 'POST', { device_id: deviceId });
  setActiveDeviceId(deviceId);
  const device = (res.data && res.data.device_id)
    ? res.data
    : getDevicesCache().find((d) => d.device_id === deviceId);
  syncPetFromDevice(device);
  return res.data;
}

export async function unbindDevice(deviceId) {
  await request(`/api/devices/${encodeURIComponent(deviceId)}`, 'DELETE');
  const activeId = getActiveDeviceId();
  if (activeId === deviceId) {
    setActiveDeviceId('');
    const app = getApp();
    app.globalData.petProfile = null;
    try {
      wx.removeStorageSync('pet_profile');
    } catch (e) {
      console.warn('[Device] clear pet_profile failed', e);
    }
  }
  // eslint-disable-next-line no-use-before-define
  const devices = await listDevices();
  // eslint-disable-next-line no-use-before-define
  const nextActive = getActiveDevice();
  if (nextActive) {
    syncPetFromDevice(nextActive);
  }
  return devices;
}

export function getActiveDevice() {
  const activeId = getActiveDeviceId();
  const devices = getDevicesCache();
  return devices.find((d) => d.device_id === activeId) || null;
}

export function mapDevicesForPicker(devices, activeDeviceId) {
  const activeId = String(activeDeviceId || '').trim();
  return (devices || []).map((d) => ({
    device_id: d.device_id,
    displayName: d.pet_name || d.name || d.device_id,
    petType: d.pet_type || 'cat',
    thumb: resolvePetImage(d.pet_image) || '',
    isActive: d.device_id === activeId,
  }));
}

export function formatLastSeen(iso) {
  if (!iso) return '未上线';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '未上线';
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return '未上线';
  }
}
