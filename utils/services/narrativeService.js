import { PetStatus } from '../types.js';

const STATUS_META = {
  [PetStatus.SLEEPING]: { label: '正在睡觉', mood: 'sleepy', moodLabel: '有点困', moodScore: 61, icon: '💤', title: '进入梦乡' },
  [PetStatus.WALKING]: { label: '正在散步', mood: 'happy', moodLabel: '心情不错', moodScore: 78, icon: '🐾', title: '客厅巡逻' },
  [PetStatus.EATING]: { label: '正在吃饭', mood: 'happy', moodLabel: '非常满足', moodScore: 84, icon: '🥣', title: '认真干饭' },
  [PetStatus.WAITING]: { label: '正在等你', mood: 'calm', moodLabel: '安静放松', moodScore: 68, icon: '👀', title: '窗边发呆' },
  [PetStatus.GROOMING]: { label: '正在理毛', mood: 'calm', moodLabel: '从容自在', moodScore: 76, icon: '🧼', title: '整理毛发' },
  [PetStatus.SHAKING]: { label: '正在抖抖毛', mood: 'playful', moodLabel: '有点兴奋', moodScore: 72, icon: '〰️', title: '抖擞精神' },
  [PetStatus.LITTER_BOX]: { label: '暂时离开', mood: 'calm', moodLabel: '一切正常', moodScore: 65, icon: '🐾', title: '独处片刻' },
  [PetStatus.OBSERVING]: { label: '正在观察', mood: 'curious', moodLabel: '充满好奇', moodScore: 75, icon: '🔎', title: '观察世界' },
};

const THOUGHTS = {
  [PetStatus.SLEEPING]: ['我要睡一会儿，你忙完记得回来找我。', '梦里也给你留了一个暖和的位置。'],
  [PetStatus.WALKING]: ['刚刚巡逻了一圈，家里一切正常。', '窗边有一点风，我替你闻过了。'],
  [PetStatus.EATING]: ['今天这顿还不错，我决定认真吃完。', '饭碗这里暂时没有需要你担心的事。'],
  [PetStatus.WAITING]: ['外面的鸟今天很忙，我先替你盯一会儿。', '我没有一直等你，只是刚好看了门口很多次。'],
  [PetStatus.GROOMING]: ['见你之前，当然要先把自己收拾好。', '这一小撮毛，总算被我安排明白了。'],
  [PetStatus.SHAKING]: ['精神抖擞！现在可以继续玩了。'],
  [PetStatus.LITTER_BOX]: ['这里暂时不需要陪同，我很快回来。'],
  [PetStatus.OBSERVING]: ['有个小东西动了一下，我正在认真研究。'],
};

const hash = (value) => String(value || '').split('').reduce(
  (total, char) => (total * 31 + char.charCodeAt(0)) % 997,
  0,
);

export const getStatusMeta = (status) => STATUS_META[status] || STATUS_META[PetStatus.WAITING];

export const getStatusThought = (event = {}) => {
  if (event.thought) return event.thought;
  const templates = THOUGHTS[event.status] || THOUGHTS[PetStatus.WAITING];
  return templates[hash(event.id || event.status) % templates.length];
};

export const getLocalChatReply = (pet, message) => {
  const meta = getStatusMeta(pet && pet.currentStatus);
  const name = (pet && pet.name) || '我';
  const replies = [
    `收到啦。${meta.moodLabel}的时候，最适合听你说话。`,
    `喵～${name}听见了，我会把这句话放在今天的手帐里。`,
    '虽然隔着屏幕，我还是知道你来找我了。',
  ];
  return replies[hash(message) % replies.length];
};

export const getMoodLabel = (score) => {
  if (score >= 82) return '阳光灿烂';
  if (score >= 72) return '平静偏开心';
  if (score >= 64) return '安静放松';
  return '有点困倦';
};

