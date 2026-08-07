import { getTodayEvents } from './eventService.js';
import { getExperienceValue, setExperienceValue } from './demoStore.js';
import { getMoodLabel } from './narrativeService.js';

const pad = (value) => (value < 10 ? `0${value}` : `${value}`);

export const formatEventTime = (timestamp) => {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const getJournalViewModel = () => {
  const events = getTodayEvents().map((event) => ({ ...event, timeText: formatEventTime(event.ts) }));
  const scores = events.map((event) => event.moodScore || 68);
  const average = scores.length
    ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
    : 68;
  const chartEvents = events.slice(-8).map((event, index, list) => {
    const left = list.length <= 1 ? 50 : Math.round((index / (list.length - 1)) * 88 + 6);
    const top = Math.max(8, Math.min(78, 82 - Math.round((event.moodScore || 68) * 0.72)));
    return { ...event, left, top };
  });
  return {
    events: [...events].reverse(),
    chartEvents,
    moodLabel: getMoodLabel(average),
    moodScore: average,
    hasDream: events.some((event) => event.status === 'Sleeping'),
  };
};

export const getDreamStory = () => (
  '梦里我又回到了那扇总有阳光的窗边。鸟从很远的地方飞过来，我本来想追，'
  + '却突然闻到你身上的味道。于是我没有跑远，只在光里翻了个身，等你回家。'
);

export const generateDailyJournal = (petName = '汤圆') => {
  const view = getJournalViewModel();
  const chronological = [...view.events].reverse();
  const highlights = chronological.slice(-4).map((event) => event.title).join('、');
  const highest = chronological.reduce(
    (best, event) => (!best || event.moodScore > best.moodScore ? event : best),
    null,
  );
  const content = `《${petName}今天过得怎么样》\n\n今天我经历了${highlights || '一段安静的时光'}。`
    + `${highest ? `最开心的时候是“${highest.title}”，那一刻心情有 ${highest.moodScore} 分。` : ''}`
    + '\n\n你隔着手机来看我，我知道你在想我。\n\n'
    + `今日心情：☀️ ${view.moodLabel}\n想对你说：你忙你的，我会好好在家的。`;
  const journal = { id: `journal_${new Date().toDateString()}`, content, createdAt: Date.now() };
  setExperienceValue('journal', journal);
  return journal;
};

export const getSavedJournal = () => getExperienceValue('journal', null);

