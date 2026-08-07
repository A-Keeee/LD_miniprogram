import { getFriends, saveFriends } from './demoStore.js';
import { spend } from './pointsService.js';

const DEFAULT_FRIEND = {
  id: 'friend-oreo',
  petName: '奥利奥',
  avatar: '/static/demo/oreo.jpg',
  ownerName: '小莫',
  personalityTags: ['慢热', '好奇', '爱晒太阳'],
  personality: { curiosity: 76, sociability: 70, energy: 69, clinginess: 51 },
  matchScore: 86,
  storyUnlocked: false,
  collected: false,
};

export const calculateMatch = (left, right) => {
  const keys = ['curiosity', 'sociability', 'energy', 'clinginess'];
  const difference = keys.reduce(
    (total, key) => total + Math.abs(Number(left[key]) - Number(right[key])),
    0,
  ) / keys.length;
  return Math.round(100 - difference);
};

export const getFriendCards = () => {
  const friends = getFriends();
  if (friends.length) return friends;
  saveFriends([DEFAULT_FRIEND]);
  return [DEFAULT_FRIEND];
};

export const collectFriend = (friendId) => {
  const friends = getFriendCards().map((friend) => (
    friend.id === friendId ? { ...friend, collected: true, collectedAt: Date.now() } : friend
  ));
  saveFriends(friends);
  return friends.find((friend) => friend.id === friendId);
};

export const unlockFriendStory = (friendId) => {
  const result = spend({ key: `friend_story_${friendId}`, amount: 30, reason: '解锁双猫故事' });
  if (!result.ok && !result.duplicate) return result;
  const friends = getFriendCards().map((friend) => (
    friend.id === friendId ? { ...friend, storyUnlocked: true } : friend
  ));
  saveFriends(friends);
  return { ...result, ok: true, friend: friends.find((friend) => friend.id === friendId) };
};

