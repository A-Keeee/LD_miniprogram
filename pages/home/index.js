import { PetStatus, VideoProvider } from '../../utils/types.js';
import {
  cacheGeneratedVideoForState,
  clearGeneratedVideoForState,
  createStatusVideoTask,
  filterStatesNeedingAiVideo,
  getBackendVideoHttpHeader,
  getBackendVideoStreamUrl,
  getPetStatusVideo,
  getStatusVideoTask,
  hasStatusVideo,
} from '../../utils/services/videoService.js';
import { chatWithPet } from '../../utils/services/geminiService.js';
import { cloudConfig } from '../../config/index.js';
import {
  getActiveDevice,
  getActiveDeviceId,
  getDeviceErrorMessage,
  getDevicesCache,
  listDevices,
  mapDevicesForPicker,
  setActiveDevice,
  syncPetFromDevice,
} from '../../utils/services/deviceService.js';
import { isDemoEnabled, seedDemoData } from '../../utils/services/demoService.js';
import { getDemoPet, getEvents } from '../../utils/services/demoStore.js';
import {
  recordInteractionEvent,
  recordPetStatusEvent,
  getTodayStats,
} from '../../utils/services/eventService.js';
import { getLocalChatReply, getStatusMeta, getStatusThought } from '../../utils/services/narrativeService.js';
import { earn, getBalance } from '../../utils/services/pointsService.js';

const app = getApp();

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

Page({
  data: {
    pet: null,
    videoSrc: null,
    videoHttpHeader: {},
    videoError: false,
    videoDisabled: false,   // true after we know video decoder doesn't work
    videoUnavailableReason: '',
    isVideoCreating: false,
    isBatchVideoCreating: false,
    showChat: false,
    chatMessage: '',
    chatHistory: [],
    isTyping: false,
    scrollTop: 0,
    isLiveSync: false,
    activeDeviceId: '',
    activeDeviceName: '',
    devices: [],
    isSwitchingPet: false,
    liveSyncHint: '',
    isDemo: false,
    isPetting: false,
    thought: '',
    moodLabel: '安静放松',
    moodScore: 68,
    points: 0,
    todayStats: { eventCount: 0, activeMinutes: 0, restText: '—' },

    sensors: { battery: 85, temp: 24 },
    statusConfig: {
      [PetStatus.SLEEPING]: { label: '睡觉', icon: '💤' },
      [PetStatus.WALKING]:  { label: '行走', icon: '🐾' },
      [PetStatus.EATING]:   { label: '吃饭', icon: '🥣' },
      [PetStatus.WAITING]:  { label: '等待', icon: '👀' },
      [PetStatus.GROOMING]: { label: '梳理', icon: '🧼' },
      [PetStatus.SHAKING]:  { label: '抖动身体', icon: '〰️' },
      [PetStatus.LITTER_BOX]: { label: '上厕所', icon: '🚽' }
    },
    statusList: [
      PetStatus.SLEEPING,
      PetStatus.WALKING,
      PetStatus.EATING,
      PetStatus.WAITING,
      PetStatus.GROOMING,
      PetStatus.SHAKING,
      PetStatus.LITTER_BOX
    ],
    statusListRow1: [
      PetStatus.SLEEPING,
      PetStatus.WALKING,
      PetStatus.EATING,
      PetStatus.WAITING
    ],
    statusListRow2: [
      PetStatus.GROOMING,
      PetStatus.SHAKING,
      PetStatus.LITTER_BOX
    ]
  },

  // Track retry state (not in data to avoid extra renders)
  _retryAttempt: 0,
  _videoLoadId: 0,
  _videoCacheErrorModalShown: false,

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'home' });
    }

    if (isDemoEnabled()) {
      seedDemoData();
      this.stopLocalStatusPolling();
      this.stopVideoTaskPolling();
      this.setData({
        pet: getDemoPet(),
        isDemo: true,
        videoSrc: null,
        videoError: false,
        videoDisabled: false,
        videoUnavailableReason: '',
        devices: [],
        activeDeviceId: '',
        activeDeviceName: '',
      }, () => this.refreshExperienceState());
      return;
    }

    const token = wx.getStorageSync('access_token');
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }

    await this.refreshActiveDevice();

    const pet = app.globalData.petProfile;
    if (!pet) {
      wx.showModal({
        title: '绑定设备',
        content: '请先绑定设备并创建宠物',
        confirmText: '去设置',
        showCancel: false,
        success() {
          wx.switchTab({ url: '/pages/setting/index' });
        },
      });
      return;
    }

    this.setData({ pet, isDemo: false }, () => {
      recordPetStatusEvent({ status: pet.currentStatus, source: 'manual' });
      this.refreshExperienceState();
      if (!this.data.videoDisabled) {
        this._videoLoadId = (this._videoLoadId || 0) + 1;
        this.loadVideo(this.data.pet);
      }
    });

    if (this.data.isLiveSync) {
      this.startLocalStatusPolling();
    }
  },

  async refreshActiveDevice() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      this.setData({
        activeDeviceId: '',
        activeDeviceName: '',
        liveSyncHint: '请先登录',
      });
      return;
    }
    try {
      await listDevices();
    } catch (e) {
      console.warn('[Home] listDevices failed', e);
    }
    const active = getActiveDevice();
    const activeDeviceId = getActiveDeviceId();
    const pet = active ? syncPetFromDevice(active) : null;
    const devices = mapDevicesForPicker(getDevicesCache(), activeDeviceId);
    this.setData({
      activeDeviceId,
      activeDeviceName: active ? (active.pet_name || active.name || active.device_id) : '',
      devices,
      liveSyncHint: activeDeviceId ? '' : '请先在设置页绑定设备',
      pet: pet || this.data.pet,
    });
    if (pet && !this.data.videoDisabled) {
      this._videoLoadId = (this._videoLoadId || 0) + 1;
      this.loadVideo(pet);
    }
  },

  refreshExperienceState(temporaryThought) {
    const { pet } = this.data;
    if (!pet) return;
    const events = getEvents();
    const lastEvent = [...events].reverse().find((event) => event.status === pet.currentStatus)
      || { id: pet.currentStatus, status: pet.currentStatus };
    const meta = getStatusMeta(pet.currentStatus);
    this.setData({
      thought: temporaryThought || getStatusThought(lastEvent),
      moodLabel: meta.moodLabel,
      moodScore: pet.moodScore || meta.moodScore,
      points: getBalance(),
      todayStats: getTodayStats(),
      sensors: {
        battery: pet.battery || this.data.sensors.battery,
        temp: pet.temp || this.data.sensors.temp,
      },
    });
  },

  async handleSelectPet(e) {
    const deviceId = e.currentTarget.dataset.id;
    if (!deviceId || deviceId === this.data.activeDeviceId || this.data.isSwitchingPet) {
      return;
    }

    this.stopVideoTaskPolling();

    this.setData({ isSwitchingPet: true });
    try {
      await setActiveDevice(deviceId);
      const active = getActiveDevice();
      const pet = active ? syncPetFromDevice(active) : null;
      const activeDeviceId = getActiveDeviceId();
      this._videoLoadId = (this._videoLoadId || 0) + 1;
      this.setData({
        activeDeviceId,
        activeDeviceName: active ? (active.pet_name || active.name || active.device_id) : '',
        devices: mapDevicesForPicker(getDevicesCache(), activeDeviceId),
        pet,
        videoSrc: null,
        videoError: false,
        videoUnavailableReason: '',
        chatHistory: [],
        showChat: false,
        liveSyncHint: activeDeviceId ? '' : '请先在设置页绑定设备',
      }, () => this.refreshExperienceState());
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({ show: true });
      }
      if (pet && !this.data.videoDisabled) {
        this.loadVideo(pet);
      }
      if (this.data.isLiveSync) {
        this.fetchLocalBackendStatus();
      }
      wx.showToast({ title: '已切换宠物', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: getDeviceErrorMessage(err), icon: 'none' });
    } finally {
      this.setData({ isSwitchingPet: false });
    }
  },

  onLiveSyncChange(e) {
    const isLiveSync = e.detail.value;
    if (isLiveSync && !getActiveDeviceId()) {
      wx.showToast({ title: '请先在设置页绑定设备', icon: 'none' });
      this.setData({ isLiveSync: false });
      return;
    }
    this.setData({ isLiveSync });
    if (isLiveSync) {
      this.startLocalStatusPolling();
    } else {
      this.stopLocalStatusPolling();
    }
  },

  onHide() {
    this.stopLocalStatusPolling();
    this.stopVideoTaskPolling();
  },

  onUnload() {
    this.stopLocalStatusPolling();
    this.stopVideoTaskPolling();
  },

  startLocalStatusPolling() {
    this.stopLocalStatusPolling();
    this.fetchLocalBackendStatus();
    const ms = cloudConfig.statusPollIntervalMs || 1500;
    this._statusPollTimer = setInterval(() => {
      this.fetchLocalBackendStatus();
    }, ms);
  },

  stopLocalStatusPolling() {
    if (this._statusPollTimer) {
      clearInterval(this._statusPollTimer);
      this._statusPollTimer = null;
    }
  },

  fetchLocalBackendStatus() {
    const base = (cloudConfig.localBackendBaseUrl || '').replace(/\/$/, '');
    if (!base) {
      console.warn('[LiveSync] localBackendBaseUrl is empty');
      return;
    }
    const deviceId = getActiveDeviceId();
    if (!deviceId) {
      this.setData({ liveSyncHint: '请先在设置页绑定设备' });
      return;
    }
    const headers = getBackendVideoHttpHeader();
    wx.request({
      url: `${base}/api/pet/status?device_id=${encodeURIComponent(deviceId)}`,
      method: 'GET',
      header: headers,
      timeout: 8000,
      success: (res) => {
        if (res.statusCode === 403) {
          this.setData({ liveSyncHint: '当前设备无权访问' });
          return;
        }
        if (res.statusCode !== 200 || !res.data) return;
        const body = res.data;
        const {behaviour} = body;
        if (!behaviour) return;
        const status = this.mapBehaviourToStatus(String(behaviour));
        if (!status || !this.data.pet || this.data.pet.currentStatus === status) return;
        const pet = { ...this.data.pet, currentStatus: status };
        this.setData({ pet, liveSyncHint: '' });
        app.updatePetProfile(pet);
        recordPetStatusEvent({ status, source: 'backend' });
        this.refreshExperienceState();
        if (!this.data.videoDisabled) {
          this._videoLoadId = (this._videoLoadId || 0) + 1;
          this.loadVideo(pet);
        }
      },
      fail: (err) => {
        console.error('[LiveSync] GET /api/pet/status failed', err);
      }
    });
  },

  mapBehaviourToStatus(behaviour) {
    const normalizedBehaviour = typeof behaviour === 'string' ? behaviour.trim().toLowerCase() : '';
    switch (normalizedBehaviour) {
      case 'rest':
        return PetStatus.WAITING;
      case 'sleep':
        return PetStatus.SLEEPING;
      case 'walk':
      case 'run':
        return PetStatus.WALKING;
      case 'feed':
        return PetStatus.EATING;
      case 'groom':
        return PetStatus.GROOMING;
      case 'shake':
        return PetStatus.SHAKING;
      case 'litter box':
      case 'litter_box':
      case 'toilet':
      case 'bathroom':
      case 'wc':
        return PetStatus.LITTER_BOX;
      default:
        return null;
    }
  },

  isVideoLoadCurrent(loadId, status) {
    const {pet} = this.data;
    return loadId === this._videoLoadId && pet && pet.currentStatus === status;
  },

  applyVideoSrc(url, loadId, status, options = {}) {
    if (!this.isVideoLoadCurrent(loadId, status)) {
      return;
    }
    const remote = Boolean(options && options.remote);
    const videoHttpHeader = remote ? getBackendVideoHttpHeader() : {};
    const apply = () => {
      if (!this.isVideoLoadCurrent(loadId, status)) {
        return;
      }
      this.setData({
        videoSrc: url,
        videoHttpHeader,
        videoError: !url,
        videoUnavailableReason: url ? '' : 'waiting_generation',
        isVideoCreating: false,
      });
    };
    if (url) {
      // 先卸载 <video> 再挂载，避免切换 src 时组件不刷新
      this.setData({ videoSrc: null, videoError: false, videoHttpHeader: {} }, apply);
      return;
    }
    apply();
  },

  showTrialVideoCacheError(status, err) {
    if (this._videoCacheErrorModalShown || getMiniProgramEnvVersion() !== 'trial') {
      return;
    }
    this._videoCacheErrorModalShown = true;
    const config = (this.data.statusConfig || {})[status] || {};
    const label = config.label || status || '当前状态';
    const miniProgram = getMiniProgramInfo();
    const systemInfo = getSystemInfo();
    const content = [
      `状态：${label}`,
      '环境：体验版',
      `AppID：${miniProgram.appId || 'unknown'}`,
      miniProgram.version ? `小程序版本：${miniProgram.version}` : '',
      `基础库：${systemInfo.SDKVersion || 'unknown'}`,
      `接口域名：${getCacheDownloadOrigin()}`,
      '请确认该域名已配置到小程序后台 downloadFile 合法域名，并且 HTTPS 证书、ICP备案有效。',
      `原始错误：${getRawVideoCacheError(err) || '无'}`,
    ].filter(Boolean).join('\n');
    wx.showModal({
      title: '视频缓存失败',
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

  queueGeneratedVideoCache(status, deviceId) {
    cacheGeneratedVideoForState(status, { deviceId }).catch((err) => {
      const msg = [
        err && err.message,
        err && err.errMsg,
        err && err.raw && err.raw.errMsg,
      ].filter(Boolean).join(' ');
      if (msg === 'download_canceled' || msg.includes('abort')) {
        return;
      }
      console.warn('[Video] cache generated video failed', status, err);
      this.showTrialVideoCacheError(status, err);
    });
  },

  async loadVideo(petArg) {
    const pet = petArg || this.data.pet;
    if (!pet) return;

    const status = pet.currentStatus;
    const loadId = this._videoLoadId;
    this._retryAttempt = 0;

    if (!hasStatusVideo(status)) {
      if (!this.isVideoLoadCurrent(loadId, status)) return;
      this.setData({
        videoSrc: null,
        videoError: false,
        videoUnavailableReason: 'missing_for_status',
      });
      return;
    }

    const settings = app.globalData.videoSettings || {};
    const allowPresetFallback = settings.provider === VideoProvider.LOCAL;
    const result = await getPetStatusVideo(pet, { allowPresetFallback });

    if (!this.isVideoLoadCurrent(loadId, status)) {
      return;
    }

    const url = result && result.url;
    const pending = Boolean(result && result.pending);
    const remote = Boolean(result && result.remote);
    if (pending) {
      const userInitiated = this.isVideoCreationBusy();
      this.setData({
        videoSrc: null,
        videoError: false,
        videoUnavailableReason: 'waiting_generation',
        isVideoCreating: userInitiated,
      });
      if (userInitiated) {
        this.startVideoTaskPolling(status);
      }
      return;
    }

    this.applyVideoSrc(url, loadId, status, { remote });
    if (remote && url) {
      this.queueGeneratedVideoCache(status, pet.deviceId);
    }
  },

  handleStatusChange(e) {
    if (this.data.isLiveSync) {
      return;
    }
    const newStatus = e.currentTarget.dataset.status;
    const pet = { ...this.data.pet, currentStatus: newStatus };
    this._videoLoadId = (this._videoLoadId || 0) + 1;
    this.setData({
      pet,
      videoError: false,
      videoDisabled: false,
      videoUnavailableReason: '',
    });
    app.updatePetProfile(pet);
    recordPetStatusEvent({ status: newStatus, source: 'manual' });
    this.refreshExperienceState();
    this.loadVideo(pet);
  },

  async handleVideoError(e) {
    const errMsg = (e.detail && e.detail.errMsg) || 'unknown error';
    const status = this.data.pet && this.data.pet.currentStatus;
    console.error('[Video] Playback error:', status, errMsg);

    if (!status) return;

    this._retryAttempt += 1;
    clearGeneratedVideoForState(status);
    this.setData({
      videoError: false,
      videoSrc: null,
      videoUnavailableReason: 'waiting_generation',
      isVideoCreating: false,
    });

    if (this._retryAttempt <= 1) {
      this._videoLoadId = (this._videoLoadId || 0) + 1;
      await this.loadVideo(this.data.pet);
      if (this.data.videoSrc) {
        return;
      }
      wx.showToast({ title: '视频无法播放，请重新创作', icon: 'none' });
    }
  },

  isVideoCreationBusy() {
    return this.data.isVideoCreating || this.data.isBatchVideoCreating;
  },

  beginVideoCreation(state, { force = false, loadingTitle = '开始创作…' } = {}) {
    const {pet} = this.data;
    const status = String(state || (pet && pet.currentStatus) || '').trim();
    if (!pet || !status || this.isVideoCreationBusy()) {
      return Promise.reject(new Error('busy_or_missing_state'));
    }
    if (force) {
      clearGeneratedVideoForState(status);
    }
    this.setData({
      isVideoCreating: true,
      videoUnavailableReason: 'waiting_generation',
      videoSrc: status === pet.currentStatus ? null : this.data.videoSrc,
    });
    wx.showLoading({ title: loadingTitle });
    return createStatusVideoTask(status, { force })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: force ? '已开始重新创作' : '已开始创作', icon: 'none' });
        if (status === pet.currentStatus) {
          this.startVideoTaskPolling(status);
        }
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ isVideoCreating: false });
        const body = err && err.data ? err.data : {};
        const msg = (body && body.message) || '创作失败';
        wx.showToast({ title: msg, icon: 'none' });
        throw err;
      });
  },

  handleCreateVideo() {
    const {pet} = this.data;
    if (!pet || !pet.currentStatus) return;
    this.beginVideoCreation(pet.currentStatus);
  },

  handleRecreateVideo() {
    const {pet} = this.data;
    if (!pet || !pet.currentStatus) return;
    this.beginVideoCreation(pet.currentStatus, {
      force: true,
      loadingTitle: '重新创作中…',
    });
  },

  async handleCreateAllVideos() {
    const {pet} = this.data;
    const states = this.data.statusList || [];
    if (!pet || !states.length || this.isVideoCreationBusy()) return;

    this.setData({ isBatchVideoCreating: true });
    wx.showLoading({ title: '检查创作状态…', mask: true });

    let statesToCreate = [];
    try {
      statesToCreate = await filterStatesNeedingAiVideo(states);
    } catch (err) {
      wx.hideLoading();
      this.setData({ isBatchVideoCreating: false });
      wx.showToast({ title: '检查状态失败', icon: 'none' });
      return;
    }

    const skipped = states.length - statesToCreate.length;
    if (statesToCreate.length === 0) {
      wx.hideLoading();
      this.setData({ isBatchVideoCreating: false });
      wx.showToast({
        title: skipped > 0 ? '均已创作，无需重复提交' : '没有可创作的状态',
        icon: 'none',
      });
      return;
    }

    this.setData({
      isVideoCreating: true,
      videoUnavailableReason: 'waiting_generation',
    });
    wx.showLoading({ title: '全部创作中…', mask: true });

    const counts = await statesToCreate.reduce(
      (promise, state) => promise.then(async (result) => {
        try {
          await createStatusVideoTask(state, { force: false });
          return { ...result, started: result.started + 1 };
        } catch (err) {
          console.warn('[Video] batch create failed for', state, err);
          return { ...result, failed: result.failed + 1 };
        }
      }),
      Promise.resolve({ started: 0, failed: 0 }),
    );
    const { failed, started } = counts;

    wx.hideLoading();
    this.setData({ isBatchVideoCreating: false });

    if (started === 0) {
      this.setData({ isVideoCreating: false });
      wx.showToast({ title: '全部创作失败', icon: 'none' });
      return;
    }

    let tip = `已提交 ${started} 个状态`;
    if (skipped > 0) {
      tip += `，跳过 ${skipped} 个已创作`;
    }
    if (failed > 0) {
      tip += `，${failed} 个失败`;
    }
    wx.showToast({ title: tip, icon: 'none' });
    this.startVideoTaskPolling(pet.currentStatus);
  },

  startVideoTaskPolling(state) {
    this.stopVideoTaskPolling();
    const s = String(state || '').trim();
    if (!s) return;
    this._videoTaskPollingState = s;
    this._videoTaskPollingInFlight = false;
    this.setData({ isVideoCreating: true });
    this.pollVideoTaskStatus();
    this._videoTaskPollTimer = setInterval(() => {
      this.pollVideoTaskStatus();
    }, 5000);
  },

  stopVideoTaskPolling() {
    if (this._videoTaskPollTimer) {
      clearInterval(this._videoTaskPollTimer);
      this._videoTaskPollTimer = null;
    }
    this._videoTaskPollingState = '';
    this._videoTaskPollingInFlight = false;
    this.setData({ isVideoCreating: false });
  },

  async pollVideoTaskStatus() {
    const state = this._videoTaskPollingState;
    if (!state || this._videoTaskPollingInFlight) return;
    this._videoTaskPollingInFlight = true;
    try {
      const task = await getStatusVideoTask(state);
      const status = String((task && task.status) || '').toLowerCase();
      if (status === 'succeeded' && task.video_ready) {
        this.stopVideoTaskPolling();
        const {pet} = this.data;
        if (pet && pet.currentStatus === state) {
          this._videoLoadId = (this._videoLoadId || 0) + 1;
          const streamUrl = getBackendVideoStreamUrl(state);
          this.applyVideoSrc(streamUrl, this._videoLoadId, state, { remote: true });
          this.queueGeneratedVideoCache(state, pet.deviceId);
          wx.showToast({ title: '视频已生成', icon: 'none' });
        }
      } else if (status === 'succeeded' && !task.video_ready) {
        // Seedance 已完成，后端仍在缓存到本地
        this.setData({
          isVideoCreating: true,
          videoUnavailableReason: 'waiting_generation',
        });
      } else if (status === 'failed') {
        this.stopVideoTaskPolling();
        const {pet} = this.data;
        if (pet && pet.currentStatus === state) {
          this.setData({ videoUnavailableReason: 'waiting_generation' });
        }
        wx.showToast({ title: '创作失败，请重试', icon: 'none' });
      }
    } catch (err) {
      console.warn('[Video] task polling failed', err);
    } finally {
      this._videoTaskPollingInFlight = false;
    }
  },

  triggerHaptic() {
    wx.vibrateShort({ type: 'medium' });
    if (this.data.isPetting) return;
    recordInteractionEvent({
      type: 'user_touch',
      title: '你摸了摸我',
      thought: '收到啦，再摸一下也不是不行。',
      icon: '🧡',
    });
    const reward = earn({ key: 'touch_first', amount: 10, reason: '第一次摸摸汤圆' });
    this.setData({
      isPetting: true,
      thought: '收到啦，再摸一下也不是不行。',
      points: reward.balance,
      todayStats: getTodayStats(),
    });
    setTimeout(() => {
      this.setData({ isPetting: false });
      this.refreshExperienceState();
    }, 800);
  },

  openPetBag() {
    wx.navigateTo({ url: '/pages/petbag/index' });
  },

  openJournal() {
    wx.switchTab({ url: '/pages/journal/index' });
  },

  toggleChat() {
    const newShowChat = !this.data.showChat;
    this.setData({ showChat: newShowChat });

    // Hide/show tab bar to prevent overlap with chat input
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: !newShowChat });
    }
  },

  handleChatInput(e) {
    this.setData({ chatMessage: e.detail.value });
  },

  async sendMessage() {
    const { chatMessage, pet, chatHistory } = this.data;
    if (!chatMessage.trim()) return;

    const userMsg = chatMessage;
    const newHistory = [...chatHistory, { sender: 'user', text: userMsg }];

    this.setData({
      chatMessage: '',
      chatHistory: newHistory,
      isTyping: true
    }, this.scrollToBottom);

    try {
      const reply = this.data.isDemo
        ? getLocalChatReply(pet, userMsg)
        : await chatWithPet(pet, userMsg);
      this.setData({
        chatHistory: [...this.data.chatHistory, { sender: 'pet', text: reply }],
        isTyping: false
      }, this.scrollToBottom);
    } catch (err) {
      console.error('Chat error:', err);
      this.setData({
        chatHistory: [...this.data.chatHistory, { sender: 'pet', text: getLocalChatReply(pet, userMsg) }],
        isTyping: false
      }, this.scrollToBottom);
    }
  },

  scrollToBottom() {
    this.setData({ scrollTop: this.data.scrollTop + 99999 });
  },

  preventScroll() {},
});
