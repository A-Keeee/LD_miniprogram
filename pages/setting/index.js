import { VideoProvider } from '../../utils/types.js';
import { saveVideoSettings } from '../../utils/services/videoService.js';
import {
  formatLastSeen,
  getActiveDeviceId,
  getDeviceErrorMessage,
  listDevices,
  pairDevice,
  setActiveDevice,
  unbindDevice,
} from '../../utils/services/deviceService.js';

const app = getApp();

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
      return;
    }
    this.setData({ isLoadingDevices: true });
    try {
      const devices = await listDevices();
      this.setData({
        devices: devices.map((d) => ({
          ...d,
          lastSeenText: formatLastSeen(d.last_seen_at),
        })),
        activeDeviceId: getActiveDeviceId(),
      });
    } catch (err) {
      console.warn('[Setting] listDevices failed', err);
    } finally {
      this.setData({ isLoadingDevices: false });
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
        const tempFilePath = res.tempFiles[0].tempFilePath;
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
    const provider = e.currentTarget.dataset.provider;
    this.setData({
      'settings.provider': provider,
    });
  },

  handleInput(e) {
    const field = e.currentTarget.dataset.field;
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
});
