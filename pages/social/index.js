import { isDemoEnabled } from '../../utils/services/demoService.js';
import { getDemoPet } from '../../utils/services/demoStore.js';
import { getBalance, grantDemoCredits } from '../../utils/services/pointsService.js';
import { completeTask } from '../../utils/services/taskService.js';
import {
  calculateMatch,
  collectFriend,
  getFriendCards,
  unlockFriendStory,
} from '../../utils/services/socialDemoService.js';

const app = getApp();

Page({
  data: {
    pet: null,
    friends: [],
    friend: null,
    phase: 'idle',
    points: 0,
    showDetail: false,
    matchRows: [],
  },

  onShow() {
    if (!isDemoEnabled() && !wx.getStorageSync('access_token')) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'social' });
    }
    const pet = isDemoEnabled() ? getDemoPet() : app.globalData.petProfile;
    const friends = getFriendCards();
    this.setData({ pet, friends, friend: friends[0], points: getBalance() });
    this.startShakeListener();
  },

  onHide() {
    this.stopShakeListener();
    if (this._bumpTimer) clearTimeout(this._bumpTimer);
  },

  onUnload() {
    this.stopShakeListener();
    if (this._bumpTimer) clearTimeout(this._bumpTimer);
  },

  startShakeListener() {
    this._accelerometerHandler = ({ x = 0, y = 0, z = 0 }) => {
      if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 3.2 && this.data.phase === 'idle') {
        this.startBump();
      }
    };
    wx.startAccelerometer({ interval: 'normal' });
    wx.onAccelerometerChange(this._accelerometerHandler);
  },

  stopShakeListener() {
    wx.stopAccelerometer();
    if (this._accelerometerHandler && wx.offAccelerometerChange) {
      wx.offAccelerometerChange(this._accelerometerHandler);
    }
    this._accelerometerHandler = null;
  },

  startBump() {
    if (this.data.phase === 'scanning') return;
    this.setData({ phase: 'scanning', showDetail: false });
    wx.vibrateShort({ type: 'light' });
    this._bumpTimer = setTimeout(() => {
      const { friend, pet } = this.data;
      const left = (pet && pet.personality) || { curiosity: 88, sociability: 62, energy: 74, clinginess: 83 };
      const score = calculateMatch(left, friend.personality);
      const labels = { curiosity: '好奇', sociability: '社交', energy: '活力', clinginess: '粘人' };
      const matchRows = Object.keys(labels).map((key) => ({
        key,
        label: labels[key],
        left: left[key],
        right: friend.personality[key],
      }));
      this.setData({ phase: 'matched', friend: { ...friend, matchScore: score }, matchRows });
      wx.vibrateShort({ type: 'medium' });
    }, 1200);
  },

  collect() {
    const friend = collectFriend(this.data.friend.id);
    completeTask('friend');
    const friends = getFriendCards();
    this.setData({ friend, friends, points: getBalance() });
    wx.showToast({ title: '已收藏好友卡', icon: 'success' });
  },

  openFriend(e) {
    this.setData({ friend: e.detail.friend, showDetail: true });
  },

  openDetail() {
    this.setData({ showDetail: true });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  unlockStory() {
    const result = unlockFriendStory(this.data.friend.id);
    if (result.insufficient) {
      if (!isDemoEnabled()) {
        wx.showToast({ title: '积分不足，完成今日任务可获得积分', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '积分不足',
        content: '体验 Demo 可领取 100 积分，继续解锁故事和旅行。',
        confirmText: '领取 100 分',
        success: ({ confirm }) => {
          if (!confirm) return;
          grantDemoCredits();
          const unlocked = unlockFriendStory(this.data.friend.id);
          this.setData({
            points: getBalance(),
            friend: unlocked.friend || this.data.friend,
            friends: getFriendCards(),
          });
        },
      });
      return;
    }
    const friends = getFriendCards();
    this.setData({ friend: result.friend, friends, points: getBalance() });
  },

  playTogether() {
    wx.navigateTo({ url: '/pages/friend-play/index' });
  },
});
