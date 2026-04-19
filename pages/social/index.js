Page({
  data: {
    posts: [
      {
        id: '1',
        author: '冯亦珂',
        petName: '汤圆',
        imageUrl: 'https://picsum.photos/400/400?random=1',
        description: '今天汤圆一直在睡觉，好乖呀！#猫咪日常 #宠伴智联',
        likes: 124,
        timestampStr: '1 小时前',
        avatar: 'https://picsum.photos/100/100?random=1'
      },
      {
        id: '2',
        author: '莫湘渝',
        petName: '奥利奥',
        imageUrl: 'https://picsum.photos/400/500?random=2',
        description: '出门前生成的视频，看着它在门口等我的样子，心都化了。马上回家！',
        likes: 89,
        timestampStr: '2 小时前',
        avatar: 'https://picsum.photos/100/100?random=2'
      }
    ]
  },
  
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'social' });
    }
  }
});
