const DEMO_PREFIX = 'ld_demo_';
const LOCAL_PREFIX = 'ld_local_';

export const DEMO_VERSION = 1;

const DOMAINS = [
  'pet', 'events', 'points', 'ledger', 'tasks', 'friends', 'journal',
  'travel', 'postcards', 'souvenirs', 'scene', 'settings', 'scene_context', 'owner_mood',
];

const cloneDefault = (value) => {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...value };
  return value;
};

const safeGet = (key, fallback) => {
  try {
    const value = wx.getStorageSync(key);
    return value === '' || value === undefined || value === null
      ? cloneDefault(fallback)
      : value;
  } catch (error) {
    return cloneDefault(fallback);
  }
};

const safeSet = (key, value) => {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    return false;
  }
};

const safeRemove = (key) => {
  try {
    wx.removeStorageSync(key);
  } catch (error) {
    // Cleanup is best-effort; seeding repairs missing values later.
  }
};

const normalizeKeyPart = (value, fallback) => {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return normalized || fallback;
};

export const isDemoEnabled = () => Boolean(safeGet(`${DEMO_PREFIX}enabled`, false));
export const setDemoEnabled = (enabled) => safeSet(`${DEMO_PREFIX}enabled`, Boolean(enabled));
export const getDemoVersion = () => Number(safeGet(`${DEMO_PREFIX}version`, 0));
export const setDemoVersion = (version) => safeSet(`${DEMO_PREFIX}version`, Number(version) || 0);

export const getRealScopeId = () => {
  const phone = normalizeKeyPart(safeGet('user_phone', ''), 'anonymous');
  const device = normalizeKeyPart(safeGet('active_device_id', ''), 'unbound');
  return `${phone}_${device}`;
};

export const getExperienceKey = (domain, options = {}) => {
  const safeDomain = normalizeKeyPart(domain, 'data');
  const demo = options.demo === undefined ? isDemoEnabled() : Boolean(options.demo);
  if (demo) return `${DEMO_PREFIX}${safeDomain}`;
  return `${LOCAL_PREFIX}${getRealScopeId()}_${safeDomain}`;
};

export const getExperienceValue = (domain, fallback, options) => (
  safeGet(getExperienceKey(domain, options), fallback)
);

export const setExperienceValue = (domain, value, options) => (
  safeSet(getExperienceKey(domain, options), value)
);

export const getDemoPet = () => getExperienceValue('pet', null, { demo: true });
export const saveDemoPet = (pet) => setExperienceValue('pet', pet, { demo: true });
export const getEvents = () => getExperienceValue('events', []);
export const saveEvents = (events) => setExperienceValue('events', events);
export const getTasks = () => getExperienceValue('tasks', []);
export const saveTasks = (tasks) => setExperienceValue('tasks', tasks);
export const getFriends = () => getExperienceValue('friends', []);
export const saveFriends = (friends) => setExperienceValue('friends', friends);
export const getTravelSession = () => getExperienceValue('travel', null);
export const saveTravelSession = (session) => setExperienceValue('travel', session);

export const resetAllDemoData = () => {
  DOMAINS.forEach((domain) => safeRemove(`${DEMO_PREFIX}${domain}`));
  safeRemove(`${DEMO_PREFIX}version`);
};
