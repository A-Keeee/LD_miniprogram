import request from '~/api/request';
import { setCurrentAccountPhone } from '../../utils/services/videoService.js';
import {
  getActiveDevice,
  listDevices,
  syncPetFromDevice,
} from '../../utils/services/deviceService.js';
import { enterDemoMode } from '../../utils/services/demoService.js';

Page({
  data: {
    phoneNumber: '',
    password: '',
    isPhoneNumber: false,
    isCheck: false,
    isSubmit: false,
  },

  changeSubmit() {
    const { isPhoneNumber, password, isCheck } = this.data;
    if (isPhoneNumber && password !== '' && isCheck) {
      this.setData({ isSubmit: true });
    } else {
      this.setData({ isSubmit: false });
    }
  },

  onPhoneInput(e) {
    const v = e.detail.value || '';
    const isPhoneNumber = /^1[3-9]\d{9}$/.test(v);
    this.setData({
      isPhoneNumber,
      phoneNumber: v,
    });
    this.changeSubmit();
  },

  onPasswordChange(e) {
    this.setData({ password: e.detail.value || '' });
    this.changeSubmit();
  },

  toggleAgree() {
    this.setData({ isCheck: !this.data.isCheck });
    this.changeSubmit();
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/register' });
  },

  enterDemo() {
    enterDemoMode();
    wx.reLaunch({ url: '/pages/home/index' });
  },

  async login() {
    try {
      const res = await request('/api/auth/login', 'post', {
        phone: this.data.phoneNumber,
        password: this.data.password,
      });
      if (res.success && res.data && res.data.token) {
        wx.setStorageSync('access_token', res.data.token);
        setCurrentAccountPhone(this.data.phoneNumber);
        try {
          const devices = await listDevices();
          const active = getActiveDevice();
          if (active) {
            syncPetFromDevice(active);
          }
          if (!devices || devices.length === 0) {
            wx.showModal({
              title: '绑定设备',
              content: '您尚未绑定硬件设备，请前往「设置」页输入配对码并创建宠物。',
              confirmText: '去设置',
              cancelText: '稍后',
              success(modalRes) {
                if (modalRes.confirm) {
                  wx.switchTab({ url: '/pages/setting/index' });
                } else {
                  wx.switchTab({ url: '/pages/home/index' });
                }
              },
            });
            return;
          }
        } catch (e) {
          console.warn('[Login] listDevices failed', e);
        }
        wx.switchTab({
          url: '/pages/home/index',
        });
      }
    } catch (err) {
      const body = err.data || err;
      const key = body && body.message;
      const map = {
        invalid_credentials: '手机号或密码错误',
        database_unavailable: '服务暂不可用，请确认数据库已启动',
      };
      wx.showToast({ title: (key && map[key]) || key || '登录失败', icon: 'none' });
    }
  },
});
