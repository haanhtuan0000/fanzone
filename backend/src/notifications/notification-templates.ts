/**
 * Server-side Vietnamese notification text templates (spec §9.2 table 32).
 *
 * Stage 3 is VN-only — the app's primary audience is Vietnam. Stage 5
 * will add locale-aware dispatch keyed off a (future) User.locale column
 * plus the existing `Accept-Language` detection in QuestionsController.
 *
 * Each template returns { title, body } ready for `admin.messaging().send()`
 * and a `type` string for the client-side data.type dispatch. Emojis live
 * in the body (title stays literal "FanZone") so OS notification-tray
 * rendering stays consistent — matches the pattern set by Stage 2 local
 * match-reminder text.
 */

export type NotifType = 'new_question' | 'correct' | 'wrong' | 'timeout';

export interface NotifText {
  title: string;
  body: string;
}

const TITLE = 'FanZone';

export function newQuestionText(text: string, seconds: number, reward: number): NotifText {
  return {
    title: TITLE,
    body: `⚡ Câu hỏi mới: ${text} · ${seconds}s để trả lời · +${reward}🪙`,
  };
}

export function correctText(text: string, coins: number, dailyTotal: number): NotifText {
  return {
    title: TITLE,
    body: `🎯 Chính xác! ${text} · +${coins}🪙 · Tổng: ${dailyTotal}🪙 hôm nay`,
  };
}

export function wrongText(text: string, coins: number): NotifText {
  return {
    title: TITLE,
    body: `❌ Tiếc quá! ${text} · −${coins}🪙 · Thử lại câu tiếp`,
  };
}

export function timeoutText(text: string): NotifText {
  return {
    title: TITLE,
    body: `⏰ Đã hết giờ cho câu: ${text} · Câu tiếp đang chờ!`,
  };
}
