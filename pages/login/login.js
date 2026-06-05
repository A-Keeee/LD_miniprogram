import request from '~/api/request';
import { PetStatus } from '../../utils/types.js';
import { setCurrentAccountPhone } from '../../utils/services/videoService.js';

function syncPetFromUser(user) {
  const app = getApp();
  let baseImage = user.pet_image || '';
  if (typeof baseImage === 'string' && baseImage.startsWith('data:')) {
    try {
      const fs = wx.getFileSystemManager();
      const m = /^data:image\/(\w+);base64,(.+)$/i.exec(baseImage);
      const ext = (m && m[1]) || 'jpg';
      const b64 = (m && m[2]) || (baseImage.includes(',') ? baseImage.split(',')[1] : '');
      if (b64) {
        const path = `${wx.env.USER_DATA_PATH}/pet_avatar.${ext}`;
        fs.writeFileSync(path, b64, 'base64');
        baseImage = path;
      }
    } catch (e) {
      console.warn('syncPetFromUser image', e);
    }
  }
  app.updatePetProfile({
    name: user.pet_name || '宠物',
    type: 'cat',
    baseImage,
    currentStatus: PetStatus.WAITING,
    statusDescription: 'Thinking of you...',
  });
}

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

  async login() {
    try {
      const res = await request('/api/auth/login', 'post', {
        phone: this.data.phoneNumber,
        password: this.data.password,
      });
      if (res.success && res.data && res.data.token) {
        wx.setStorageSync('access_token', res.data.token);
        setCurrentAccountPhone(this.data.phoneNumber);
        if (res.data.user) {
          syncPetFromUser(res.data.user);
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
