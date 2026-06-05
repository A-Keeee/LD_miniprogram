import request from '~/api/request';

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
    phoneNumber: '',
    password: '',
    name: '',
    type: 'cat',
    image: '',
    petImageDataUrl: '',
    isPhoneNumber: false,
    isCheck: false,
    isSubmit: false,
  },

  changeSubmit() {
    const { isPhoneNumber, password, name, petImageDataUrl, isCheck } = this.data;
    const trimmed = (name || '').trim();
    if (isPhoneNumber && password.length >= 6 && trimmed && petImageDataUrl && isCheck) {
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

  onNameInput(e) {
    this.setData({ name: e.detail.value || '' });
    this.changeSubmit();
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.type });
  },

  toggleAgree() {
    this.setData({ isCheck: !this.data.isCheck });
    this.changeSubmit();
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        try {
          const dataUrl = await fileToDataUrl(tempFilePath);
          this.setData({
            image: tempFilePath,
            petImageDataUrl: dataUrl,
          });
          this.changeSubmit();
        } catch (e) {
          wx.showToast({ title: '读取图片失败', icon: 'none' });
        }
      },
    });
  },

  goLogin() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/login/login' });
      },
    });
  },

  async submit() {
    try {
      const res = await request('/api/auth/register', 'post', {
        phone: this.data.phoneNumber,
        password: this.data.password,
        pet_name: (this.data.name || '').trim(),
        pet_image: this.data.petImageDataUrl,
      });
      if (res.success) {
        wx.showToast({ title: '注册成功，请登录', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.redirectTo({ url: '/pages/login/login' });
            },
          });
        }, 800);
      }
    } catch (err) {
      const body = err.data || err;
      const key = body && body.message;
      const map = {
        phone_exists: '该手机号已注册',
        missing_fields: '请填写完整',
        invalid_phone: '手机号格式不正确',
        password_too_short: '密码至少 6 位',
        pet_image_too_large: '图片过大，请换一张',
        database_unavailable: '服务暂不可用，请确认数据库已启动',
      };
      wx.showToast({ title: (key && map[key]) || key || '注册失败', icon: 'none' });
    }
  },
});
