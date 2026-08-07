import { isDemoEnabled } from '../../utils/services/demoService.js';
import { getDemoPet } from '../../utils/services/demoStore.js';
import {
  generateDailyJournal,
  getDreamStory,
  getJournalViewModel,
  getSavedJournal,
} from '../../utils/services/journalService.js';

Page({
  data: {
    dateText: '',
    view: { events: [], chartEvents: [], moodLabel: '安静放松', moodScore: 68, hasDream: false },
    showDream: false,
    dreamStory: '',
    showJournal: false,
    journal: null,
  },

  onShow() {
    if (!isDemoEnabled() && !wx.getStorageSync('access_token')) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'journal' });
    }
    const now = new Date();
    this.setData({
      dateText: `${now.getMonth() + 1}月${now.getDate()}日`,
      view: getJournalViewModel(),
      journal: getSavedJournal(),
    });
  },

  openDream() {
    if (!this.data.view.hasDream) {
      wx.showToast({ title: '睡一觉后再来看看吧', icon: 'none' });
      return;
    }
    this.setData({ showDream: true, dreamStory: getDreamStory() });
  },

  closeDream() {
    this.setData({ showDream: false });
  },

  generateJournal() {
    const app = getApp();
    const pet = isDemoEnabled() ? getDemoPet() : app.globalData.petProfile;
    const journal = generateDailyJournal((pet && pet.name) || '汤圆');
    this.setData({ journal, showJournal: true });
  },

  openJournal() {
    if (this.data.journal) this.setData({ showJournal: true });
  },

  closeJournal() {
    this.setData({ showJournal: false });
  },

  closeOverlay() {
    this.setData({ showDream: false, showJournal: false });
  },
});
