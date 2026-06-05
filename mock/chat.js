/** 模拟网络请求的延迟 */
function delay(ms = 500) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// 模拟聊天数据
const mockData = [
  {
    userId: 1,
    name: 'Sean',
    avatar: '/static/chat/avatar-Sean.png',
    messages: [
      { messageId: 1, from: 1, content: '那明天准时见哦😊', time: 1690646400000, read: true },
      { messageId: 2, from: 0, content: '好的，我会记得的', time: 1690646400000, read: true },
      { messageId: 3, from: 1, content: '在吗？', time: Date.now() - 3600000, read: false },
      {
        messageId: 4,
        from: 1,
        content: '有个问题想咨询一下，关于TDesign组件库如何更好地使用',
        time: Date.now() - 3600000,
        read: false,
      },
    ],
  },
  {
    userId: 2,
    name: 'Mollymolly',
    avatar: '/static/chat/avatar-Mollymolly.png',
    messages: [{ messageId: 5, from: 1, content: '好久不见，最近咋样？', time: 1692100800000, read: true }],
  },
  {
    userId: 3,
    name: 'Andrew',
    avatar: '/static/chat/avatar-Andrew.png',
    messages: [{ messageId: 6, from: 0, content: '现在没空，晚点再联系你哈', time: 1690084800000, read: true }],
  },
  {
    userId: 4,
    name: 'Kingdom',
    avatar: '/static/chat/avatar-Kingdom.png',
    messages: [{ messageId: 7, from: 1, content: '真的吗？', time: 1656880200000, read: true }],
  },
  {
    userId: 5,
    name: 'Paige',
    avatar: '/static/chat/avatar-Paige.png',
    messages: [
      { messageId: 8, from: 1, content: '此次要评审的首页和专区页改版的交互方案', time: 1652963880000, read: true },
    ],
  },
];

// 模拟新增一条消息
function addNewMessage(userId, from, content) {
  const index = mockData.map((item) => item.userId).indexOf(userId);
  const user = mockData.splice(index, 1)[0];
  mockData.unshift(user);
  let messageId = 0;
  mockData.forEach((item) => {
    messageId += item.messages.length;
  });
  const message = { messageId, from, content, time: Date.now(), read: from === 0 };
  user.messages.push(message);

  return message;
}

/** 获取未读消息数量 */
export function fetchUnreadNum() {
  let unreadNum = 0;
  mockData.forEach((item) => {
    unreadNum += item.messages.filter((message) => !message.read).length;
  });
  return delay().then(() => ({ code: 200, data: unreadNum }));
}

/** 获取完整消息列表 */
export function fetchMessageList() {
  return delay().then(() => ({ code: 200, data: JSON.parse(JSON.stringify(mockData)) }));
}

/** 将某个用户的所有消息标记为已读 */
export function markMessagesRead(userId) {
  let index = 0;
  while (index < mockData.length) {
    const user = mockData[index];
    if (user.userId === userId) {
      user.messages.forEach((message) => {
        message.read = true;
      });
      break;
    }
    index += 1;
  }
}
