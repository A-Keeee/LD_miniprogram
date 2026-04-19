const app = getApp();

Component({
  data: {
    value: 'home',
    show: true,
    list: [
      {
        icon: 'home',
        value: 'home',
        label: '陪伴',
      },
      {
        icon: 'usergroup',
        value: 'social',
        label: '宠圈',
      },
      {
        icon: 'setting',
        value: 'setting',
        label: '设置',
      },
    ],
  },
  lifetimes: {
    ready() {
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (curPage) {
        const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
        if (nameRe === null) return;
        if (nameRe[1]) {
          this.setData({
            value: nameRe[1],
          });
        }
      }
    },
  },
  methods: {
    handleChange(e) {
      const { value } = e.detail;
      wx.switchTab({ url: `/pages/${value}/index` });
    }
  },
});
