import { PetStatus } from '../types.js';
import {
  DEMO_VERSION,
  getDemoPet,
  getDemoVersion,
  isDemoEnabled,
  resetAllDemoData,
  saveDemoPet,
  setDemoEnabled,
  setDemoVersion,
  setExperienceValue,
} from './demoStore.js';

const atToday = (hour, minute) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};

const createSeed = () => ({
  pet: {
    id: 'demo-tangyuan',
    deviceId: 'demo-tangyuan',
    name: '汤圆',
    type: 'cat',
    avatar: '/static/demo/tangyuan.jpg',
    baseImage: '/static/demo/tangyuan.jpg',
    currentStatus: PetStatus.WAITING,
    statusLabel: '窗边发呆',
    mood: 'calm',
    moodScore: 68,
    battery: 82,
    temp: 24.3,
    online: true,
    personality: { curiosity: 88, sociability: 62, energy: 74, clinginess: 83 },
  },
  events: [
    {
      id: `evt_sleep_${atToday(7, 30)}`,
      ts: atToday(7, 30),
      status: PetStatus.SLEEPING,
      source: 'demo',
      mood: 'sleepy',
      moodScore: 61,
      title: '清晨小梦',
      thought: '你醒来以前，我在阳光里多睡了一会儿。',
      icon: '💤',
    },
    {
      id: `evt_wait_${atToday(8, 30)}`,
      ts: atToday(8, 30),
      status: PetStatus.WAITING,
      source: 'demo',
      mood: 'calm',
      moodScore: 68,
      title: '窗边发呆',
      thought: '外面的鸟今天很忙，我先替你盯一会儿。',
      icon: '👀',
    },
  ],
  tasks: [
    { id: 'task-touch', title: '摸摸它', desc: '回应汤圆今天的第一句话', reward: 10, type: 'touch', progress: 0, target: 1, completed: false },
    { id: 'task-scene', title: '补充一个生活场景', desc: '告诉汤圆你看见了什么', reward: 20, type: 'scene', progress: 0, target: 1, completed: false },
    { id: 'task-mood', title: '今天的心情', desc: '分享你此刻的心情', reward: 10, type: 'mood', progress: 0, target: 1, completed: false },
    { id: 'task-friend', title: '认识一个猫友', desc: '收藏一张新朋友卡片', reward: 20, type: 'friend', progress: 0, target: 1, completed: false },
  ],
  friend: {
    id: 'friend-oreo',
    petName: '奥利奥',
    avatar: '/static/demo/oreo.jpg',
    ownerName: '小莫',
    personalityTags: ['慢热', '好奇', '爱晒太阳'],
    personality: { curiosity: 76, sociability: 70, energy: 69, clinginess: 51 },
    matchScore: 86,
    storyUnlocked: false,
    collected: false,
  },
});

export const seedDemoData = (options = {}) => {
  if (!options.force && getDemoVersion() === DEMO_VERSION && getDemoPet()) return;
  const seed = createSeed();
  saveDemoPet(seed.pet);
  setExperienceValue('events', seed.events, { demo: true });
  setExperienceValue('points', 30, { demo: true });
  setExperienceValue('ledger', [], { demo: true });
  setExperienceValue('tasks', seed.tasks, { demo: true });
  setExperienceValue('friends', [seed.friend], { demo: true });
  setExperienceValue('journal', null, { demo: true });
  setExperienceValue('travel', null, { demo: true });
  setExperienceValue('postcards', [], { demo: true });
  setExperienceValue('souvenirs', [], { demo: true });
  setExperienceValue('scene', { index: 0 }, { demo: true });
  setExperienceValue('settings', { scenarioMode: 'manual' }, { demo: true });
  setDemoVersion(DEMO_VERSION);
};

export const enterDemoMode = () => {
  setDemoEnabled(true);
  seedDemoData();
};

export const leaveDemoMode = () => setDemoEnabled(false);

export const resetDemoData = () => {
  const enabled = isDemoEnabled();
  resetAllDemoData();
  setDemoEnabled(enabled);
  seedDemoData({ force: true });
};

export { isDemoEnabled };
