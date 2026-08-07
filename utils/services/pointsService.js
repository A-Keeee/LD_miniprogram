import { getExperienceValue, setExperienceValue } from './demoStore.js';

export const getBalance = () => Number(getExperienceValue('points', 0)) || 0;
export const getLedger = () => {
  const ledger = getExperienceValue('ledger', []);
  return Array.isArray(ledger) ? ledger : [];
};
export const hasLedgerKey = (key) => getLedger().some((entry) => entry.key === key);

export const earn = ({ key, amount, reason }) => {
  if (!key || hasLedgerKey(key)) return { ok: false, balance: getBalance(), duplicate: true };
  const value = Math.max(0, Number(amount) || 0);
  const balance = getBalance() + value;
  const entry = { id: `ledger_${key}`, key, type: 'earn', amount: value, reason, ts: Date.now() };
  setExperienceValue('ledger', [...getLedger(), entry]);
  setExperienceValue('points', balance);
  return { ok: true, balance, entry };
};

export const spend = ({ key, amount, reason }) => {
  if (!key || hasLedgerKey(key)) return { ok: false, balance: getBalance(), duplicate: true };
  const value = Math.max(0, Number(amount) || 0);
  const current = getBalance();
  if (current < value) return { ok: false, balance: current, insufficient: true };
  const balance = current - value;
  const entry = { id: `ledger_${key}`, key, type: 'spend', amount: -value, reason, ts: Date.now() };
  setExperienceValue('ledger', [...getLedger(), entry]);
  setExperienceValue('points', balance);
  return { ok: true, balance, entry };
};

export const grantDemoCredits = () => earn({
  key: 'demo_credit_100',
  amount: 100,
  reason: 'Demo 体验积分',
});
