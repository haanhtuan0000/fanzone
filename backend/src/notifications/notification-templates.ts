/**
 * Server-side notification text templates (spec §9.2 table 32).
 *
 * Locale-aware since Stage 3.5: each top-level function takes a
 * normalised [Locale] and returns the matching body. The client passes
 * its device locale on `/notifications/device` registration and the
 * server stores it on `UserDevice`; dispatch picks the template per
 * device when fanning out a multicast.
 *
 * Emoji prefixes live in the body (title stays literal "FanZone") so
 * OS notification-tray rendering stays consistent — matches the
 * pattern set by Stage 2 local match-reminder text.
 *
 * Adding a new language = add one block to [TEMPLATES] + one arm in
 * [pickLocale]; the switch above the ternary has no else-if chain.
 */

export type NotifType =
  | 'new_question'
  | 'correct'
  | 'wrong'
  | 'timeout'
  | 'rank_milestone'
  | 'achievement'
  | 'level_up'
  | 'streak_milestone';
export type Locale = 'vi' | 'en';

export interface NotifText {
  title: string;
  body: string;
}

const TITLE = 'FanZone';

const TEMPLATES = {
  vi: {
    newQuestion: (t: string, s: number, r: number) =>
      `⚡ Câu hỏi mới: ${t} · ${s}s để trả lời · +${r}🪙`,
    correct: (t: string, c: number, d: number) =>
      `🎯 Chính xác! ${t} · +${c}🪙 · Tổng: ${d}🪙 hôm nay`,
    wrong: (t: string, c: number) =>
      `❌ Tiếc quá! ${t} · −${c}🪙 · Thử lại câu tiếp`,
    timeout: (t: string) =>
      `⏰ Đã hết giờ cho câu: ${t} · Câu tiếp đang chờ!`,
    rankMilestone: (p: number) =>
      `🏆 Bạn vừa lọt vào Top ${p}! Hạng #${p}`,
    achievement: (name: string, xp: number) =>
      `🏅 Mở khóa: ${name}! · +${xp} XP · Xem ngay`,
    levelUp: (level: number, title: string) =>
      `⬆️ Lên cấp! Level ${level}: ${title}`,
    streakMilestone: (days: number) =>
      `🔥×${days} Streak ${days} ngày! Tiếp tục dự đoán để giữ chuỗi.`,
  },
  en: {
    newQuestion: (t: string, s: number, r: number) =>
      `⚡ New question: ${t} · ${s}s to answer · +${r}🪙`,
    correct: (t: string, c: number, d: number) =>
      `🎯 Correct! ${t} · +${c}🪙 · Today: ${d}🪙`,
    wrong: (t: string, c: number) =>
      `❌ Tough luck! ${t} · −${c}🪙 · Try the next one`,
    timeout: (t: string) =>
      `⏰ Time's up for: ${t} · Next question is coming!`,
    rankMilestone: (p: number) =>
      `🏆 You're in the Top ${p}! Rank #${p}`,
    achievement: (name: string, xp: number) =>
      `🏅 Unlocked: ${name}! · +${xp} XP · Tap to view`,
    levelUp: (level: number, title: string) =>
      `⬆️ Level up! Level ${level}: ${title}`,
    streakMilestone: (days: number) =>
      `🔥×${days} ${days}-day streak! Keep predicting to stay on it.`,
  },
} as const;

/**
 * Normalise any raw locale string (user input, header, column value)
 * to one the template bank knows about. Anything unknown — including
 * empty string, `'zh'`, mixed-case garbage — collapses to `'vi'` (the
 * app's primary-audience default). Adding ZH later is one extra arm.
 */
export function pickLocale(raw: string | null | undefined): Locale {
  if (!raw) return 'vi';
  const lc = raw.toLowerCase();
  if (lc === 'en') return 'en';
  return 'vi';
}

export function newQuestionText(
  locale: Locale,
  text: string,
  seconds: number,
  reward: number,
): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].newQuestion(text, seconds, reward) };
}

export function correctText(
  locale: Locale,
  text: string,
  coins: number,
  dailyTotal: number,
): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].correct(text, coins, dailyTotal) };
}

export function wrongText(locale: Locale, text: string, coins: number): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].wrong(text, coins) };
}

export function timeoutText(locale: Locale, text: string): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].timeout(text) };
}

export function rankMilestoneText(locale: Locale, position: number): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].rankMilestone(position) };
}

export function achievementText(
  locale: Locale,
  name: string,
  rewardXp: number,
): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].achievement(name, rewardXp) };
}

export function levelUpText(
  locale: Locale,
  level: number,
  title: string,
): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].levelUp(level, title) };
}

export function streakMilestoneText(locale: Locale, days: number): NotifText {
  return { title: TITLE, body: TEMPLATES[locale].streakMilestone(days) };
}
