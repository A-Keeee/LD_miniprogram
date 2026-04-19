import { PetStatus } from '../../utils/types.js';
const app = getApp();

Page({
  data: {
    name: '',
    type: 'cat',
    image: null
  },

  onLoad() {
    // If already has pet, navigate to home (dashboard)
    if (app.globalData.petProfile) {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  handleNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.type });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          image: tempFilePath
        });
      }
    });
  },

  handleSubmit() {
    const { name, type, image } = this.data;
    if (name && image) {
      const profile = {
        name,
        type,
        baseImage: image, // local path or base64
        currentStatus: PetStatus.WAITING,
        statusDescription: 'Thinking of you...'
      };
      
      app.updatePetProfile(profile);
      wx.switchTab({ url: '/pages/home/index' });
    } else {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      });
    }
  }
});
