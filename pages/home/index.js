import { PetStatus } from '../../utils/types.js';
import {
  clearGeneratedVideoForState,
  createStatusVideoTask,
  filterStatesNeedingAiVideo,
  getBackendVideoHttpHeader,
  getBackendVideoStreamUrl,
  getPetStatusVideo,
  getStatusVideoTask,
  hasStatusVideo,
} from '../../utils/services/videoService.js';
import { VideoProvider } from '../../utils/types.js';
import { chatWithPet } from '../../utils/services/geminiService.js';
import { cloudConfig } from '../../config/index.js';

const app = getApp();

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

    sensors: { battery: 85, temp: 24 },
    statusConfig: {
      [PetStatus.SLEEPING]: { label: '睡觉', icon: '💤' },
      [PetStatus.WALKING]:  { label: '行走', icon: '🐾' },
      [PetStatus.EATING]:   { label: '吃饭', icon: '🥣' },
      [PetStatus.WAITING]:  { label: '等待', icon: '👀' },
      [PetStatus.GROOMING]: { label: '梳理', icon: '🧼' },
      [PetStatus.SHAKING]:  { label: '抖动身体', icon: '〰️' }
    },
    statusList: [
      PetStatus.SLEEPING,
      PetStatus.WALKING,
      PetStatus.EATING,
      PetStatus.WAITING,
      PetStatus.GROOMING,
      PetStatus.SHAKING
    ]
  },

  // Track retry state (not in data to avoid extra renders)
  _retryAttempt: 0,
  _videoLoadId: 0,

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'home' });
    }

    const pet = app.globalData.petProfile;
    if (!pet) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ pet }, () => {
      if (!this.data.videoDisabled) {
        this._videoLoadId = (this._videoLoadId || 0) + 1;
        this.loadVideo(this.data.pet);
      }
    });

    if (this.data.isLiveSync) {
      this.startLocalStatusPolling();
    }
  },

  onLiveSyncChange(e) {
    const isLiveSync = e.detail.value;
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
    wx.request({
      url: `${base}/api/pet/status`,
      method: 'GET',
      timeout: 8000,
      success: (res) => {
        if (res.statusCode !== 200 || !res.data) return;
        const body = res.data;
        const behaviour = body.behaviour;
        if (!behaviour) return;
        const status = this.mapBehaviourToStatus(String(behaviour));
        if (!status || !this.data.pet || this.data.pet.currentStatus === status) return;
        const pet = { ...this.data.pet, currentStatus: status };
        this.setData({ pet });
        app.updatePetProfile(pet);
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
      default:
        return null;
    }
  },

  isVideoLoadCurrent(loadId, status) {
    const pet = this.data.pet;
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
      console.log('[Video] Ignored stale load for', status);
      return;
    }

    const url = result && result.url;
    const pending = Boolean(result && result.pending);
    const remote = Boolean(result && result.remote);
    console.log('[Video] Resolved:', status, result && result.source, url, pending);

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
    const pet = this.data.pet;
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
    const pet = this.data.pet;
    if (!pet || !pet.currentStatus) return;
    this.beginVideoCreation(pet.currentStatus);
  },

  handleRecreateVideo() {
    const pet = this.data.pet;
    if (!pet || !pet.currentStatus) return;
    this.beginVideoCreation(pet.currentStatus, {
      force: true,
      loadingTitle: '重新创作中…',
    });
  },

  async handleCreateAllVideos() {
    const pet = this.data.pet;
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

    let started = 0;
    let failed = 0;
    for (const state of statesToCreate) {
      try {
        await createStatusVideoTask(state, { force: false });
        started += 1;
      } catch (err) {
        failed += 1;
        console.warn('[Video] batch create failed for', state, err);
      }
    }

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
        const pet = this.data.pet;
        if (pet && pet.currentStatus === state) {
          this._videoLoadId = (this._videoLoadId || 0) + 1;
          const streamUrl = getBackendVideoStreamUrl(state);
          this.applyVideoSrc(streamUrl, this._videoLoadId, state, { remote: true });
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
        const pet = this.data.pet;
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
      const reply = await chatWithPet(pet, userMsg);
      this.setData({
        chatHistory: [...this.data.chatHistory, { sender: 'pet', text: reply }],
        isTyping: false
      }, this.scrollToBottom);
    } catch (err) {
      console.error('Chat error:', err);
      this.setData({
        chatHistory: [...this.data.chatHistory, { sender: 'pet', text: '喵? (连接断开...)' }],
        isTyping: false
      }, this.scrollToBottom);
    }
  },

  scrollToBottom() {
    this.setData({ scrollTop: this.data.scrollTop + 99999 });
  },

  preventScroll() {
    return;
  }
});
