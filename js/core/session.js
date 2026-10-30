import { getSettings, saveSettings } from './settings.js';
import { todayStr, diffDays } from './dates.js';

export const session = {
  today: '',
  prevVisitDate: '',
  dayChanged: false,
  yesterdayLeftoverCount: 0
};

export async function initSession() {
  const s = getSettings();
  const today = todayStr();
  session.today = today;
  session.prevVisitDate = s.lastVisitDate || '';
  session.dayChanged = !!s.lastVisitDate && diffDays(s.lastVisitDate, today) > 0;
  if (s.lastVisitDate !== today) {
    await saveSettings({ lastVisitDate: today });
  }
  return session;
}

export function currentToday() {
  const t = todayStr();
  if (t !== session.today) {
    session.prevVisitDate = session.today;
    session.today = t;
    session.dayChanged = true;
  }
  return session.today;
}
