import { PetStatus } from '../../utils/types.js';
import { getPetStatusVideo, getRemoteFallback } from '../../utils/services/videoService.js';
import { chatWithPet } from '../../utils/services/geminiService.js';
import { cloudConfig } from '../../config/index.js';

const app = getApp();

Page({
  data: {
    pet: null,
    videoSrc: null,
    videoError: false,
    videoDisabled: false,   // true after we know video decoder doesn't work
    usingRemoteFallback: false,
    showChat: false,
    chatMessage: '',
    chatHistory: [],
    isTyping: false,
    scrollTop: 0,
    isLiveSync: false,

    sensors: { battery: 85, temp: 24 },
    statusConfig: {
      [PetStatus.SLEEPING]: { label: '睡觉', icon: '💤' },
      [PetStatus.PLAYING]:  { label: '跑步', icon: '🐾' },
      [PetStatus.EATING]:   { label: '吃饭', icon: '🥣' },
      [PetStatus.WAITING]:  { label: '张望', icon: '👀' },
      [PetStatus.SHAKING]:  { label: '抖动身体', icon: '〰️' }
    },
    statusList: [
      PetStatus.SLEEPING,
      PetStatus.PLAYING,
      PetStatus.EATING,
      PetStatus.WAITING,
      PetStatus.SHAKING
    ]
  },

  // Track retry state (not in data to avoid extra renders)
  _retryAttempt: 0,

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'home' });
    }

    const pet = app.globalData.petProfile;
    if (!pet) {
      wx.redirectTo({ url: '/pages/setup/index' });
      return;
    }

    this.setData({ pet }, () => {
      if (!this.data.videoDisabled) {
        this.loadVideo();
      }
    });

    if (this.data.isLiveSync) {
      this.connectSocket();
    }
  },

  onLiveSyncChange(e) {
    const isLiveSync = e.detail.value;
    this.setData({ isLiveSync });
    if (isLiveSync) {
      this.connectSocket();
    } else {
      this.closeSocket();
    }
  },

  onHide() {
    this.closeSocket();
  },

  onUnload() {
    this.closeSocket();
  },

  connectSocket() {
    if (this._socketTask) return;
    
    this._socketTask = wx.connectSocket({
      url: cloudConfig.inferenceSocketUrl,
      fail: (err) => console.error('WebSocket connect fail', err)
    });

    this._socketTask.onOpen(() => {
      console.log('WebSocket connected to AliCloud inference service');
    });

    this._socketTask.onMessage((res) => {
      try {
        const data = JSON.parse(res.data);
        if (data.type === 'inference_result') {
          const status = this.mapBehaviourToStatus(data.behaviour);
          if (status && (!this.data.pet || this.data.pet.currentStatus !== status)) {
            console.log('[WebSocket] Status changed:', data.behaviour, '->', status);
            const pet = { ...this.data.pet, currentStatus: status };
            this.setData({ pet });
            app.updatePetProfile(pet);
            if (!this.data.videoDisabled) {
              this.loadVideo();
            }
          }
        }
      } catch (e) {
        console.error('WebSocket parse message error', e);
      }
    });

    this._socketTask.onClose(() => {
      console.log('WebSocket closed');
      this._socketTask = null;
    });

    this._socketTask.onError((err) => {
      console.error('WebSocket error', err);
      this._socketTask = null;
    });
  },

  closeSocket() {
    if (this._socketTask) {
      this._socketTask.close();
      this._socketTask = null;
    }
  },

  mapBehaviourToStatus(behaviour) {
    switch(behaviour) {
      case 'Rest': return PetStatus.SLEEPING;
      case 'Walk':
      case 'Run': return PetStatus.PLAYING;
      case 'Feed': return PetStatus.EATING;
      case 'Groom': return PetStatus.WAITING;
      case 'Shake': return PetStatus.SHAKING;
      default: return null;
    }
  },

  async loadVideo() {
    const { pet, videoDisabled } = this.data;
    if (!pet || videoDisabled) return;

    this._retryAttempt = 0;

    const settings = app.globalData.videoSettings;
    const url = await getPetStatusVideo(pet, settings);

    console.log('[Video] Loading:', url);
    this.setData({
      videoSrc: url,
      videoError: false,
      usingRemoteFallback: false
    });
  },

  handleStatusChange(e) {
    const newStatus = e.currentTarget.dataset.status;
    const pet = { ...this.data.pet, currentStatus: newStatus };
    this.setData({ pet });
    app.updatePetProfile(pet);

    // Only try video if we haven't permanently disabled it
    if (!this.data.videoDisabled) {
      this.loadVideo();
    }
  },

  handleVideoError(e) {
    const errMsg = (e.detail && e.detail.errMsg) || 'unknown error';
    console.error('Video load error:', errMsg);

    this._retryAttempt++;

    // Attempt 1 failed (local) → try remote fallback
    if (this._retryAttempt === 1 && this.data.pet) {
      const remoteSrc = getRemoteFallback(this.data.pet);
      if (remoteSrc) {
        console.log('[Video] Falling back to remote:', remoteSrc);
        this.setData({
          videoSrc: remoteSrc,
          videoError: false,
          usingRemoteFallback: true
        });
        return;
      }
    }

    // Attempt 2+ failed → video decoder doesn't work on this platform
    // Permanently disable video to prevent infinite retry loop
    console.warn('[Video] Video decoder not supported on this platform. Disabling video playback.');
    this.setData({
      videoError: true,
      videoSrc: null,
      videoDisabled: true,   // permanently stop trying
      usingRemoteFallback: false
    });
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
