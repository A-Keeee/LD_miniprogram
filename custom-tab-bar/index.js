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
        icon: 'book-open',
        value: 'journal',
        label: '手帐',
      },
      {
        icon: 'usergroup',
        value: 'social',
        label: '猫友',
      },
      {
        icon: 'compass',
        value: 'travel',
        label: '旅行',
      },
      {
        icon: 'user',
        value: 'setting',
        label: '我的',
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
    },
  },
});
