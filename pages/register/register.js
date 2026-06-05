import request from '~/api/request';

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
    if (isPhoneNumber && password.length >= 6 && isCheck) {
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
        database_unavailable: '服务暂不可用，请确认数据库已启动',
      };
      wx.showToast({ title: (key && map[key]) || key || '注册失败', icon: 'none' });
    }
  },
});
