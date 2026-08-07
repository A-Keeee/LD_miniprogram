import { getDemoPet, getExperienceValue, saveDemoPet, setExperienceValue } from './demoStore.js';
import { recordPetStatusEvent } from './eventService.js';
import { PetStatus } from '../types.js';

export const DEMO_SCENES = [
  { status: PetStatus.WAITING, mood: 'calm', moodScore: 68, statusLabel: '窗边发呆' },
  { status: PetStatus.WALKING, mood: 'happy', moodScore: 78, statusLabel: '客厅巡逻' },
  { status: PetStatus.EATING, mood: 'happy', moodScore: 84, statusLabel: '认真干饭' },
  { status: PetStatus.GROOMING, mood: 'calm', moodScore: 76, statusLabel: '整理毛发' },
  { status: PetStatus.SLEEPING, mood: 'sleepy', moodScore: 61, statusLabel: '进入午睡' },
];

let autoTimer = null;

export const getScenarioSettings = () => getExperienceValue(
  'settings',
  { scenarioMode: 'manual' },
  { demo: true },
);

export const setScenarioMode = (scenarioMode) => {
  const settings = getScenarioSettings();
  setExperienceValue(
    'settings',
    { ...settings, scenarioMode: scenarioMode === 'auto' ? 'auto' : 'manual' },
    { demo: true },
  );
};

export const advanceDemoScene = () => {
  const state = getExperienceValue('scene', { index: 0 }, { demo: true });
  const index = (Number(state.index) + 1) % DEMO_SCENES.length;
  const scene = DEMO_SCENES[index];
  const current = getDemoPet();
  if (!current) return null;
  const pet = { ...current, ...scene };
  saveDemoPet(pet);
  setExperienceValue('scene', { index }, { demo: true });
  const event = recordPetStatusEvent({ status: scene.status, source: 'demo', force: true });
  return { pet, event, index };
};

export const stopAutoScenario = () => {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
};

export const startAutoScenario = (onAdvance) => {
  stopAutoScenario();
  if (getScenarioSettings().scenarioMode !== 'auto') return;
  autoTimer = setInterval(() => {
    const result = advanceDemoScene();
    if (result && typeof onAdvance === 'function') onAdvance(result);
  }, 15000);
};

