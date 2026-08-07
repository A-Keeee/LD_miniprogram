import { isDemoEnabled } from '../../utils/services/demoService.js';
import { getBalance, grantDemoCredits } from '../../utils/services/pointsService.js';
import {
  DESTINATIONS,
  getPostcards,
  getSouvenirs,
  refreshTravel,
  startTravel,
} from '../../utils/services/travelDemoService.js';

Page({
  data: {
    destinations: DESTINATIONS,
    points: 0,
    session: null,
    postcards: [],
    souvenirs: [],
    showPostcard: false,
    activePostcard: null,
  },

  onShow() {
    if (!isDemoEnabled() && !wx.getStorageSync('access_token')) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'travel' });
    }
    this.refresh();
    this.startProgressTimer();
  },

  onHide() { this.stopProgressTimer(); },
  onUnload() { this.stopProgressTimer(); },

  refresh() {
    const session = refreshTravel();
    const postcards = getPostcards();
    this.setData({
      session,
      points: getBalance(),
      postcards,
      souvenirs: getSouvenirs(),
    });
    if (session && session.status === 'completed' && session.postcard && !this._shownSessionId) {
      this._shownSessionId = session.id;
      this.setData({ showPostcard: true, activePostcard: session.postcard });
    }
  },

  startProgressTimer() {
    this.stopProgressTimer();
    this._progressTimer = setInterval(() => this.refresh(), 500);
  },

  stopProgressTimer() {
    if (this._progressTimer) clearInterval(this._progressTimer);
    this._progressTimer = null;
  },

  start(e) {
    const { id } = e.currentTarget.dataset;
    if (this.data.session && this.data.session.status === 'traveling') {
      wx.showToast({ title: '汤圆还在旅行中', icon: 'none' });
      return;
    }
    const result = startTravel(id);
    if (result.insufficient) {
      if (!isDemoEnabled()) {
        wx.showToast({ title: '积分不足，完成今日任务可获得积分', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '积分不足',
        content: '领取 100 分 Demo 体验金，马上出发。',
        confirmText: '领取积分',
        success: ({ confirm }) => {
          if (!confirm) return;
          grantDemoCredits();
          this.setData({ points: getBalance() });
        },
      });
      return;
    }
    this._shownSessionId = '';
    this.refresh();
  },

  openPostcard(e) {
    this.setData({ showPostcard: true, activePostcard: e.detail.postcard });
  },

  closePostcard() { this.setData({ showPostcard: false }); },

  onShareAppMessage() {
    const postcard = this.data.activePostcard;
    return {
      title: postcard ? `汤圆从${postcard.destination}寄来一张明信片` : '汤圆的数字旅行',
      path: '/pages/travel/index',
      imageUrl: postcard ? postcard.cover : '/static/demo/travel-kyoto.jpg',
    };
  },
});

