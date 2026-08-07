import { getEvents, saveEvents } from './demoStore.js';
import { getStatusMeta, getStatusThought } from './narrativeService.js';

const MAX_EVENTS = 200;
const SAME_STATUS_WINDOW = 10 * 60 * 1000;

const isToday = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

export const recordPetStatusEvent = ({ status, source = 'manual', ts = Date.now(), force = false }) => {
  if (!status) return null;
  const events = getEvents();
  const last = events[events.length - 1];
  if (!force && last && last.status === status && ts - last.ts < SAME_STATUS_WINDOW) return last;
  const meta = getStatusMeta(status);
  const event = {
    id: `evt_${source}_${status}_${ts}`.replace(/\s+/g, '_'),
    ts,
    status,
    source,
    mood: meta.mood,
    moodScore: meta.moodScore,
    title: meta.title,
    icon: meta.icon,
  };
  event.thought = getStatusThought(event);
  saveEvents([...events, event].slice(-MAX_EVENTS));
  return event;
};

export const recordInteractionEvent = ({ type, title, thought, icon = '🧡', ts = Date.now() }) => {
  const events = getEvents();
  const event = {
    id: `evt_${type}_${ts}`,
    ts,
    status: type,
    source: 'manual',
    mood: 'happy',
    moodScore: 80,
    title,
    thought,
    icon,
  };
  saveEvents([...events, event].slice(-MAX_EVENTS));
  return event;
};

export const getTodayEvents = () => getEvents().filter((event) => isToday(event.ts));

export const getTodayStats = () => {
  const events = getTodayEvents();
  const activeCount = events.filter((event) => ['Walking', 'Eating', 'Grooming'].includes(event.status)).length;
  const restCount = events.filter((event) => event.status === 'Sleeping').length;
  return {
    eventCount: events.length,
    activeMinutes: activeCount * 14,
    restText: restCount ? `${restCount * 48}min` : '—',
  };
};

