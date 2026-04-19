import { VideoProvider } from '../../utils/types.js';
import { saveVideoSettings } from '../../utils/services/videoService.js';

const app = getApp();

Page({
  data: {
    settings: {
      provider: VideoProvider.LOCAL,
      apiKey: '',
      modelName: '',
      apiEndpoint: ''
    },
    saved: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'setting' });
    }
    if (app.globalData.videoSettings) {
      this.setData({ settings: app.globalData.videoSettings });
    }
  },

  setProvider(e) {
    const provider = e.currentTarget.dataset.provider;
    this.setData({
      'settings.provider': provider
    });
  },

  handleInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`settings.${field}`]: e.detail.value
    });
  },

  handleSave() {
    saveVideoSettings(this.data.settings);
    app.updateVideoSettings(this.data.settings);
    
    this.setData({ saved: true });
    
    wx.showToast({
      title: '已保存',
      icon: 'success'
    });
    
    setTimeout(() => {
      this.setData({ saved: false });
    }, 2000);
  }
});
