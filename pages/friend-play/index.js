Page({
  data: {
    round: 0,
    ballSide: 'center',
    bubble: '轻轻点一下毛球，让它们认识彼此。',
    completed: false,
  },

  playBall() {
    if (this.data.completed) return;
    const lines = [
      '汤圆：你也喜欢这个毛球？',
      '奥利奥：先抢到就是我的。',
      '汤圆：那就试试看。',
    ];
    const round = this.data.round + 1;
    this.setData({
      round,
      ballSide: round % 2 ? 'right' : 'left',
      bubble: lines[round - 1],
      completed: round >= 3,
    });
    wx.vibrateShort({ type: 'light' });
  },

  goBack() {
    wx.navigateBack();
  },
});
