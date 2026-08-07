import { PetStatus, VideoProvider } from '../../utils/types.js';
import {
  cacheGeneratedVideoForState,
  createStatusVideoTask,
  filterStatesNeedingAiVideo,
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
import { cloudConfig } from '../../config/index.js';
import {
  enterDemoMode,
  isDemoEnabled,
  leaveDemoMode,
  resetDemoData,
} from '../../utils/services/demoService.js';
import {
  getDemoPet,
} from '../../utils/services/demoStore.js';
import {
  advanceDemoScene,
  getScenarioSettings,
  setScenarioMode,
} from '../../utils/services/demoScenarioService.js';
import { getBalance, getLedger } from '../../utils/services/pointsService.js';
import { getSceneContext, getTaskList } from '../../utils/services/taskService.js';
import { getFriendCards } from '../../utils/services/socialDemoService.js';
import { getPostcards, getSouvenirs } from '../../utils/services/travelDemoService.js';
import { recordPetStatusEvent } from '../../utils/services/eventService.js';

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

const ENV_LABELS = {
  develop: '开发版',
  trial: '体验版',
  release: '正式版',
};

const getMiniProgramInfo = () => {
  try {
    const accountInfo = wx.getAccountInfoSync();
    const miniProgram = accountInfo && accountInfo.miniProgram;
    return miniProgram || {};
  } catch (e) {
    return {};
  }
};

const getMiniProgramEnvVersion = () => getMiniProgramInfo().envVersion || 'unknown';

const getSystemInfo = () => {
  try {
    return wx.getSystemInfoSync();
  } catch (e) {
    return {};
  }
};

const getCacheDownloadOrigin = () => {
  const base = String(cloudConfig.localBackendBaseUrl || '').trim();
  const match = /^https?:\/\/[^/]+/i.exec(base);
  return match ? match[0] : (base || '未配置');
};

const getRawVideoCacheError = (err) => {
  if (!err) {
    return '';
  }
  if (typeof err === 'string') {
    return err;
  }
  const parts = [];
  const msg = err.message || err.errMsg;
  const rawMsg = err.raw && err.raw.errMsg;
  if (msg) parts.push(msg);
  if (rawMsg && rawMsg !== msg) parts.push(rawMsg);
  if (err.statusCode) parts.push(`statusCode=${err.statusCode}`);
  if (err.errno) parts.push(`errno=${err.errno}`);
  if (err.url) parts.push(`url=${err.url}`);
  return parts.join('\n') || String(err);
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
    isDemo: false,
    pet: null,
    points: 0,
    tasks: [],
    friends: [],
    postcards: [],
    souvenirs: [],
    ledger: [],
    scenarioMode: 'manual',
    devToolsOpen: false,
    isLiveSync: false,
    backendUrl: cloudConfig.localBackendBaseUrl,
    statusList: CACHE_VIDEO_STATES.map((status) => ({ status, label: STATUS_LABELS[status] })),
    isCreatingVideo: false,
    showAssetSheet: false,
    assetSheetTitle: '',
    assetSheetType: '',
    assetItems: [],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'setting' });
    }
    if (app.globalData.videoSettings) {
      this.setData({ settings: app.globalData.videoSettings });
    }
    this.refreshExperience();
    this.refreshDevices();
  },

  refreshExperience() {
    const demo = isDemoEnabled();
    const friends = getFriendCards().filter((friend) => friend.collected);
    this.setData({
      isDemo: demo,
      pet: demo ? getDemoPet() : app.globalData.petProfile,
      points: getBalance(),
      tasks: getTaskList(),
      friends,
      postcards: getPostcards(),
      souvenirs: getSouvenirs(),
      ledger: getLedger(),
      scenarioMode: getScenarioSettings().scenarioMode,
      isLiveSync: Boolean(wx.getStorageSync('ld_dev_live_sync_enabled')),
    });
  },

  handleDemoToggle(e) {
    if (e.detail.value) {
      enterDemoMode();
      this.refreshExperience();
      return;
    }
    this.exitDemo();
  },

  exitDemo() {
    leaveDemoMode();
    const target = wx.getStorageSync('access_token') ? '/pages/home/index' : '/pages/login/login';
    wx.reLaunch({ url: target });
  },

  handleResetDemo() {
    wx.showModal({
      title: '重置演示数据',
      content: '将清空 Demo 的剧情、任务、积分、猫友和旅行记录，不影响真实账号与设备。',
      confirmText: '确认重置',
      success: ({ confirm }) => {
        if (!confirm) return;
        const scene = getSceneContext();
        if (scene && scene.imagePath) {
          wx.removeSavedFile({ filePath: scene.imagePath });
        }
        resetDemoData();
        this.refreshExperience();
        wx.showToast({ title: 'Demo 已重置', icon: 'success' });
      },
    });
  },

  handleScenarioMode(e) {
    const mode = e.detail.value ? 'auto' : 'manual';
    setScenarioMode(mode);
    this.setData({ scenarioMode: mode });
  },

  nextScene() {
    const result = advanceDemoScene();
    if (result) {
      this.setData({ pet: result.pet });
      wx.showToast({ title: `下一幕：${result.pet.statusLabel}`, icon: 'none' });
    }
  },

  toggleDevTools() {
    this.setData({ devToolsOpen: !this.data.devToolsOpen });
  },

  handleLiveSync(e) {
    const enabled = Boolean(e.detail.value);
    wx.setStorageSync('ld_dev_live_sync_enabled', enabled);
    this.setData({ isLiveSync: enabled });
  },

  handleManualStatus(e) {
    const { status } = e.currentTarget.dataset;
    const pet = app.globalData.petProfile;
    if (!pet || isDemoEnabled()) {
      wx.showToast({ title: '手动真实状态仅用于已绑定设备', icon: 'none' });
      return;
    }
    const updated = { ...pet, currentStatus: status };
    app.updatePetProfile(updated);
    recordPetStatusEvent({ status, source: 'manual', force: true });
    this.setData({ pet: updated });
  },

  async createCurrentVideo() {
    const pet = app.globalData.petProfile;
    if (!pet || this.data.isCreatingVideo) {
      wx.showToast({ title: '请先绑定真实设备', icon: 'none' });
      return;
    }
    this.setData({ isCreatingVideo: true });
    try {
      await createStatusVideoTask(pet.currentStatus, { force: true });
      wx.showToast({ title: '已提交重新创作', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: '提交失败，请检查后端', icon: 'none' });
    } finally {
      this.setData({ isCreatingVideo: false });
    }
  },

  async createAllVideos() {
    if (this.data.isCreatingVideo) return;
    this.setData({ isCreatingVideo: true });
    try {
      const states = await filterStatesNeedingAiVideo(CACHE_VIDEO_STATES);
      await Promise.all(states.map((status) => createStatusVideoTask(status, { force: false })));
      wx.showToast({ title: states.length ? '批量任务已提交' : '所有状态均已完成', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: '批量提交失败', icon: 'none' });
    } finally {
      this.setData({ isCreatingVideo: false });
    }
  },

  openAsset(e) {
    const { type } = e.currentTarget.dataset;
    const config = {
      points: { title: '积分明细', items: this.data.ledger },
      friends: { title: '好友卡', items: this.data.friends },
      postcards: { title: '明信片', items: this.data.postcards },
      souvenirs: { title: '数字特产', items: this.data.souvenirs },
    }[type];
    if (!config) return;
    this.setData({
      showAssetSheet: true,
      assetSheetTitle: config.title,
      assetSheetType: type,
      assetItems: config.items,
    });
  },

  closeAsset() {
    this.setData({ showAssetSheet: false });
  },

  handleTaskSelect(e) {
    const { task } = e.detail;
    if (!task || task.completed) return;
    if (task.type === 'friend') wx.switchTab({ url: '/pages/social/index' });
    else wx.switchTab({ url: '/pages/home/index' });
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
    const msg = [
      err && err.message,
      err && err.errMsg,
      err && err.raw && err.raw.errMsg,
    ].filter(Boolean).join(' ');
    const lower = msg.toLowerCase();
    if (lower.includes('domain list') || lower.includes('url not in domain')) {
      return '下载域名未加入 downloadFile 合法域名';
    }
    if (lower.includes('ssl') || lower.includes('tls') || lower.includes('certificate')) {
      return 'HTTPS/TLS 证书校验失败';
    }
    if (lower.includes('timeout')) return '下载超时';
    if (msg.includes('missing_cache_context')) return '请先登录并绑定设备';
    if (msg.includes('download_status_401')) return '登录已过期，请重新登录';
    if (msg.includes('download_status_403')) return '当前账号无权缓存该设备视频';
    if (msg.includes('download_status_404')) return '云端视频尚未生成';
    if (msg.includes('download_status_')) return '云端视频暂不可下载';
    if (msg.includes('cache_dir_unavailable')) return '本地缓存目录不可用';
    return '缓存失败，请稍后重试';
  },

  showVideoCacheErrorDialog(err, options = {}) {
    const message = this.getVideoCacheErrorMessage(err);
    const miniProgram = getMiniProgramInfo();
    const envVersion = miniProgram.envVersion || 'unknown';
    if (envVersion !== 'trial') {
      wx.showToast({ title: options.toastTitle || message, icon: 'none' });
      return;
    }
    const systemInfo = getSystemInfo();

    const content = [
      options.summary || `原因：${message}`,
      options.label ? `状态：${options.label}` : '',
      `环境：${ENV_LABELS[envVersion] || envVersion}`,
      `AppID：${miniProgram.appId || 'unknown'}`,
      miniProgram.version ? `小程序版本：${miniProgram.version}` : '',
      `基础库：${systemInfo.SDKVersion || 'unknown'}`,
      `接口域名：${getCacheDownloadOrigin()}`,
      '请确认该域名已配置到小程序后台 downloadFile 合法域名，并且 HTTPS 证书、ICP备案有效。',
      `原始错误：${getRawVideoCacheError(err) || '无'}`,
    ].filter(Boolean).join('\n');

    wx.showModal({
      title: options.title || '视频缓存失败',
      content,
      cancelText: '知道了',
      confirmText: '复制错误',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({ data: content });
        }
      },
    });
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
      this.showVideoCacheErrorDialog(err, { label });
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
    const failedItems = [];
    this.setData({ isCachingAllVideos: true });
    wx.showLoading({ title: `缓存 1/${states.length}`, mask: true });

    await states.reduce((chain, state, index) => chain.then(async () => {
      this.setData({ cachingVideoState: state });
      wx.showLoading({ title: `缓存 ${index + 1}/${states.length}`, mask: true });
      try {
        await cacheGeneratedVideoForState(state, { deviceId: activeDeviceId });
        successCount += 1;
      } catch (err) {
        failedItems.push({
          err,
          label: STATUS_LABELS[state] || state,
        });
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

    if (failedItems.length > 0) {
      const firstFailure = failedItems[0];
      const allFailed = failedItems.length === states.length;
      this.showVideoCacheErrorDialog(firstFailure.err, {
        title: allFailed ? '视频缓存失败' : '部分视频缓存失败',
        toastTitle: allFailed ? '缓存失败' : '部分缓存失败',
        label: firstFailure.label,
        summary: successCount > 0
          ? `已成功 ${successCount} 个，失败 ${failedItems.length} 个。首个失败如下：`
          : `失败 ${failedItems.length} 个。首个失败如下：`,
      });
      return;
    }

    wx.showToast({ title: '缓存完成', icon: 'success' });
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
