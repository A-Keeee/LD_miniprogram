import { getTasks, saveTasks, getExperienceValue, setExperienceValue } from './demoStore.js';
import { recordInteractionEvent } from './eventService.js';
import { earn } from './pointsService.js';

const LEDGER_KEYS = {
  touch: 'touch_first',
  scene: 'scene_first',
  mood: 'mood_first',
  friend: 'friend_first',
};

const DEFAULT_TASKS = [
  { id: 'task-touch', title: '摸摸它', desc: '回应它今天的第一句话', reward: 10, type: 'touch', progress: 0, target: 1, completed: false },
  { id: 'task-scene', title: '补充一个生活场景', desc: '告诉它你看见了什么', reward: 20, type: 'scene', progress: 0, target: 1, completed: false },
  { id: 'task-mood', title: '今天的心情', desc: '分享你此刻的心情', reward: 10, type: 'mood', progress: 0, target: 1, completed: false },
  { id: 'task-friend', title: '认识一个猫友', desc: '收藏一张新朋友卡片', reward: 20, type: 'friend', progress: 0, target: 1, completed: false },
];

export const getTaskList = () => {
  const tasks = getTasks();
  if (tasks.length) return tasks;
  saveTasks(DEFAULT_TASKS);
  return DEFAULT_TASKS;
};

export const completeTask = (type) => {
  const tasks = getTaskList();
  const task = tasks.find((item) => item.type === type);
  if (!task) return { ok: false };
  const updated = tasks.map((item) => (
    item.type === type
      ? { ...item, progress: item.target, completed: true, completedAt: item.completedAt || Date.now() }
      : item
  ));
  saveTasks(updated);
  const reward = earn({
    key: LEDGER_KEYS[type] || `task_${task.id}`,
    amount: task.reward,
    reason: task.title,
  });
  return { ok: true, task: { ...task, completed: true }, reward, tasks: updated };
};

export const saveSceneContext = ({ label, imagePath = '' }) => {
  const context = { label, imagePath, createdAt: Date.now() };
  setExperienceValue('scene_context', context);
  recordInteractionEvent({
    type: 'scene_context',
    title: `你分享了${label}`,
    thought: `你告诉我那里是“${label}”，今晚的梦也许会经过那里。`,
    icon: '🖼️',
  });
  return completeTask('scene');
};

export const saveOwnerMood = (mood) => {
  setExperienceValue('owner_mood', { mood, createdAt: Date.now() });
  recordInteractionEvent({
    type: 'owner_mood',
    title: `你今天${mood}`,
    thought: `原来你今天觉得${mood}，那我再靠近你一点。`,
    icon: '💛',
  });
  return completeTask('mood');
};

export const getSceneContext = () => getExperienceValue('scene_context', null);
