// app.js
import { getInitialVideoSettings } from './utils/services/videoService.js';

App({
  onLaunch() {
    this.initPetData();
  },

  globalData: {
    petProfile: null,
    videoSettings: null
  },

  initPetData() {
    // Load pet profile from storage
    try {
      const petStr = wx.getStorageSync('pet_profile');
      if (petStr) {
        this.globalData.petProfile = JSON.parse(petStr);
      }
    } catch (e) {
      console.error('Failed to load pet profile:', e);
    }

    // Load video/AI settings
    try {
      this.globalData.videoSettings = getInitialVideoSettings();
    } catch (e) {
      console.error('Failed to load video settings:', e);
      this.globalData.videoSettings = {
        provider: 'LOCAL',
        apiKey: '',
        modelName: 'gemini-2.5-flash',
        apiEndpoint: ''
      };
    }
  },

  updatePetProfile(profile) {
    this.globalData.petProfile = profile;
    try {
      wx.setStorageSync('pet_profile', JSON.stringify(profile));
    } catch (e) {
      console.error('Failed to save pet profile:', e);
    }
  },

  updateVideoSettings(settings) {
    this.globalData.videoSettings = settings;
  }
});
