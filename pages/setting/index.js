import { PetStatus, VideoProvider } from '../../utils/types.js';
import {
  cacheGeneratedVideoForState,
  getGeneratedVideoCacheStatus,
  saveVideoSettings,
  setCurrentAccountPhone,
} from '../../utils/services/videoService.js';
import {
  clearDeviceStorage,
  formatLastSeen,
  getActiveDeviceId,
  getDeviceErrorMessage,
  listDevices,
  pairDevice,
  setActiveDevice,
  unbindDevice,
} from '../../utils/services/deviceService.js';

const app = getApp();

const CACHE_VIDEO_STATES = [
  PetStatus.SLEEPING,
  PetStatus.WALKING,
  PetStatus.EATING,
  PetStatus.WAITING,
  PetStatus.GROOMING,
  PetStatus.SHAKING,
  PetStatus.LITTER_BOX,
];

const STATUS_LABELS = {
  [PetStatus.SLEEPING]: '睡觉',
  [PetStatus.WALKING]: '行走',
  [PetStatus.EATING]: '吃饭',
  [PetStatus.WAITING]: '等待',
  [PetStatus.GROOMING]: '梳理',
  [PetStatus.SHAKING]: '抖动身体',
  [PetStatus.LITTER_BOX]: '上厕所',
};

function fileToDataUrl(tempPath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: tempPath,
      encoding: 'base64',
      success: (r) => {
        const lower = tempPath.toLowerCase();
        const mime = lower.endsWith('.png') ? 'image/png' : 'image/jpeg';
        resolve(`data:${mime};base64,${r.data}`);
      },
      fail: reject,
    });
  });
}

Page({
  data: {
    settings: {
      provider: VideoProvider.LOCAL,
      apiKey: '',
      modelName: '',
      apiEndpoint: '',
    },
    saved: false,
    pairingCode: '',
    petName: '',
    petType: 'cat',
    petImage: '',
    petImageDataUrl: '',
    devices: [],
    activeDeviceId: '',
    isPairing: false,
    isLoadingDevices: false,
    isLoggingOut: false,
    videoCacheItems: [],
    videoCacheCachedCount: 0,
    videoCacheTotal: 0,
    videoCacheSummaryText: '未绑定设备',
    videoCacheEmptyText: '绑定设备后可查看本地视频缓存',
    cachingVideoState: '',
    isCachingAllVideos: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'setting' });
    }
    if (app.globalData.videoSettings) {
      this.setData({ settings: app.globalData.videoSettings });
    }
    this.refreshDevices();
  },

  async refreshDevices() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      this.setData({ devices: [], activeDeviceId: '' });
      this.refreshVideoCacheStatus('');
      return;
    }
    this.setData({ isLoadingDevices: true });
    try {
      const devices = await listDevices();
      const activeDeviceId = getActiveDeviceId();
      this.setData({
        devices: devices.map((d) => ({
          ...d,
          lastSeenText: formatLastSeen(d.last_seen_at),
        })),
        activeDeviceId,
      });
      this.refreshVideoCacheStatus(activeDeviceId);
    } catch (err) {
      console.warn('[Setting] listDevices failed', err);
      this.refreshVideoCacheStatus(getActiveDeviceId());
    } finally {
      this.setData({ isLoadingDevices: false });
    }
  },

  refreshVideoCacheStatus(deviceId) {
    const token = wx.getStorageSync('access_token');
    const activeDeviceId = String(deviceId || getActiveDeviceId() || '').trim();
    if (!token) {
      this.setData({
        videoCacheItems: [],
        videoCacheCachedCount: 0,
        videoCacheTotal: 0,
        videoCacheSummaryText: '未登录',
        videoCacheEmptyText: '登录后可查看本地视频缓存',
        cachingVideoState: '',
        isCachingAllVideos: false,
      });
      return;
    }
    if (!activeDeviceId) {
      this.setData({
        videoCacheItems: [],
        videoCacheCachedCount: 0,
        videoCacheTotal: 0,
        videoCacheSummaryText: '未绑定设备',
        videoCacheEmptyText: '绑定设备后可查看本地视频缓存',
        cachingVideoState: '',
        isCachingAllVideos: false,
      });
      return;
    }

    const cacheStatus = getGeneratedVideoCacheStatus(CACHE_VIDEO_STATES, { deviceId: activeDeviceId });
    const videoCacheItems = cacheStatus.items.map((item) => ({
      ...item,
      label: STATUS_LABELS[item.state] || item.state,
      statusText: item.cached ? '已缓存' : '未缓存',
    }));
    this.setData({
      videoCacheItems,
      videoCacheCachedCount: cacheStatus.cachedCount,
      videoCacheTotal: cacheStatus.total,
      videoCacheSummaryText: `已缓存 ${cacheStatus.cachedCount}/${cacheStatus.total}`,
      videoCacheEmptyText: '',
    });
  },

  getVideoCacheErrorMessage(err) {
    const msg = String((err && (err.message || err.errMsg)) || '');
    if (msg.includes('missing_cache_context')) return '请先登录并绑定设备';
    if (msg.includes('download_status_401')) return '登录已过期，请重新登录';
    if (msg.includes('download_status_403')) return '当前账号无权缓存该设备视频';
    if (msg.includes('download_status_404')) return '云端视频尚未生成';
    if (msg.includes('download_status_')) return '云端视频暂不可下载';
    if (msg.includes('cache_dir_unavailable')) return '本地缓存目录不可用';
    return '缓存失败，请稍后重试';
  },

  async handleCacheVideo(e) {
    if (this.data.isCachingAllVideos || this.data.cachingVideoState) return;
    const { state } = e.currentTarget.dataset;
    const activeDeviceId = String(this.data.activeDeviceId || getActiveDeviceId() || '').trim();
    if (!state || !activeDeviceId) {
      wx.showToast({ title: '请先绑定设备', icon: 'none' });
      return;
    }

    const item = (this.data.videoCacheItems || []).find((cacheItem) => cacheItem.state === state);
    if (item && item.cached) {
      wx.showToast({ title: '已缓存', icon: 'success' });
      return;
    }

    const label = (item && item.label) || STATUS_LABELS[state] || state;
    this.setData({ cachingVideoState: state });
    try {
      await cacheGeneratedVideoForState(state, { deviceId: activeDeviceId });
      this.refreshVideoCacheStatus(activeDeviceId);
      wx.showToast({ title: `${label}已缓存`, icon: 'success' });
    } catch (err) {
      wx.showToast({ title: this.getVideoCacheErrorMessage(err), icon: 'none' });
    } finally {
      this.setData({ cachingVideoState: '' });
      this.refreshVideoCacheStatus(activeDeviceId);
    }
  },

  async handleCacheAllVideos() {
    if (this.data.isCachingAllVideos || this.data.cachingVideoState) return;
    const activeDeviceId = String(this.data.activeDeviceId || getActiveDeviceId() || '').trim();
    if (!activeDeviceId) {
      wx.showToast({ title: '请先绑定设备', icon: 'none' });
      return;
    }

    const cacheStatus = getGeneratedVideoCacheStatus(CACHE_VIDEO_STATES, { deviceId: activeDeviceId });
    const states = cacheStatus.items
      .filter((item) => !item.cached)
      .map((item) => item.state);
    this.refreshVideoCacheStatus(activeDeviceId);
    if (states.length === 0) {
      wx.showToast({ title: '已全部缓存', icon: 'success' });
      return;
    }

    let successCount = 0;
    let failedCount = 0;
    this.setData({ isCachingAllVideos: true });
    wx.showLoading({ title: `缓存 1/${states.length}`, mask: true });

    await states.reduce((chain, state, index) => chain.then(async () => {
      this.setData({ cachingVideoState: state });
      wx.showLoading({ title: `缓存 ${index + 1}/${states.length}`, mask: true });
      try {
        await cacheGeneratedVideoForState(state, { deviceId: activeDeviceId });
        successCount += 1;
      } catch (err) {
        failedCount += 1;
        console.warn('[Setting] cache generated video failed', state, err);
      }
      this.refreshVideoCacheStatus(activeDeviceId);
    }), Promise.resolve());

    wx.hideLoading();
    this.setData({
      isCachingAllVideos: false,
      cachingVideoState: '',
    });
    this.refreshVideoCacheStatus(activeDeviceId);

    if (failedCount > 0 && successCount > 0) {
      wx.showToast({ title: '部分缓存失败', icon: 'none' });
    } else if (failedCount > 0) {
      wx.showToast({ title: '缓存失败', icon: 'none' });
    } else {
      wx.showToast({ title: '缓存完成', icon: 'success' });
    }
  },

  onPairingCodeInput(e) {
    this.setData({ pairingCode: (e.detail.value || '').toUpperCase() });
  },

  onPetNameInput(e) {
    this.setData({ petName: e.detail.value || '' });
  },

  selectPetType(e) {
    this.setData({ petType: e.currentTarget.dataset.type });
  },

  choosePetImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const [{ tempFilePath }] = res.tempFiles;
        try {
          const dataUrl = await fileToDataUrl(tempFilePath);
          this.setData({
            petImage: tempFilePath,
            petImageDataUrl: dataUrl,
          });
        } catch (e) {
          wx.showToast({ title: '读取图片失败', icon: 'none' });
        }
      },
    });
  },

  async handlePair() {
    const code = (this.data.pairingCode || '').trim();
    const petName = (this.data.petName || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入配对码', icon: 'none' });
      return;
    }
    if (!petName || !this.data.petImageDataUrl) {
      wx.showToast({ title: '请填写宠物昵称并上传照片', icon: 'none' });
      return;
    }
    this.setData({ isPairing: true });
    try {
      await pairDevice(code, {
        pet_name: petName,
        pet_image: this.data.petImageDataUrl,
        pet_type: this.data.petType,
      });
      wx.showToast({ title: '配对成功', icon: 'success' });
      this.setData({
        pairingCode: '',
        petName: '',
        petImage: '',
        petImageDataUrl: '',
      });
      await this.refreshDevices();
    } catch (err) {
      wx.showToast({ title: getDeviceErrorMessage(err), icon: 'none' });
    } finally {
      this.setData({ isPairing: false });
    }
  },

  async handleSelectDevice(e) {
    const deviceId = e.currentTarget.dataset.id;
    if (!deviceId || deviceId === this.data.activeDeviceId) return;
    try {
      await setActiveDevice(deviceId);
      this.setData({ activeDeviceId: deviceId });
      this.refreshVideoCacheStatus(deviceId);
      wx.showToast({ title: '已切换当前设备', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: getDeviceErrorMessage(err), icon: 'none' });
    }
  },

  async handleUnbind(e) {
    const deviceId = e.currentTarget.dataset.id;
    if (!deviceId) return;
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '解绑设备',
        content: `确定解绑 ${deviceId} 吗？`,
        success: resolve,
      });
    });
    if (!res.confirm) return;
    try {
      await unbindDevice(deviceId);
      wx.showToast({ title: '已解绑', icon: 'success' });
      await this.refreshDevices();
    } catch (err) {
      wx.showToast({ title: getDeviceErrorMessage(err), icon: 'none' });
    }
  },

  setProvider(e) {
    const { provider } = e.currentTarget.dataset;
    this.setData({
      'settings.provider': provider,
    });
  },

  handleInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`settings.${field}`]: e.detail.value,
    });
  },

  handleSave() {
    saveVideoSettings(this.data.settings);
    app.updateVideoSettings(this.data.settings);

    this.setData({ saved: true });

    wx.showToast({
      title: '已保存',
      icon: 'success',
    });

    setTimeout(() => {
      this.setData({ saved: false });
    }, 2000);
  },

  async handleLogout() {
    if (this.data.isLoggingOut) return;
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '退出登录',
        content: '退出后将清除当前登录状态和当前设备选择，本地视频缓存会保留。',
        confirmText: '退出',
        confirmColor: '#ef4444',
        success: resolve,
      });
    });
    if (!res.confirm) return;

    this.setData({ isLoggingOut: true });
    try {
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('user_phone');
      wx.removeStorageSync('pet_profile');
      clearDeviceStorage();
      setCurrentAccountPhone('');
      app.globalData.petProfile = null;
      this.setData({
        devices: [],
        activeDeviceId: '',
        videoCacheItems: [],
        videoCacheCachedCount: 0,
        videoCacheTotal: 0,
        videoCacheSummaryText: '未登录',
        videoCacheEmptyText: '登录后可查看本地视频缓存',
        cachingVideoState: '',
        isCachingAllVideos: false,
      });
      wx.reLaunch({ url: '/pages/login/login' });
    } catch (err) {
      this.setData({ isLoggingOut: false });
      wx.showToast({ title: '退出失败，请重试', icon: 'none' });
    }
  },
});
