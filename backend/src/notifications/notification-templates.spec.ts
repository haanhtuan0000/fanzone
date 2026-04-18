import {
  correctText,
  newQuestionText,
  pickLocale,
  timeoutText,
  wrongText,
} from './notification-templates';

describe('notification-templates', () => {
  describe('pickLocale', () => {
    it('accepts the two supported locales', () => {
      expect(pickLocale('vi')).toBe('vi');
      expect(pickLocale('en')).toBe('en');
    });

    it('is case-insensitive', () => {
      expect(pickLocale('VI')).toBe('vi');
      expect(pickLocale('EN')).toBe('en');
    });

    it('falls back to vi on unknown input (zh, garbage, empty, null)', () => {
      expect(pickLocale('zh')).toBe('vi');
      expect(pickLocale('')).toBe('vi');
      expect(pickLocale(null)).toBe('vi');
      expect(pickLocale(undefined)).toBe('vi');
      expect(pickLocale('xxx')).toBe('vi');
    });
  });

  describe('template text', () => {
    it('newQuestionText renders Vietnamese when locale=vi', () => {
      const { body } = newQuestionText('vi', 'Who scores?', 90, 50);
      expect(body).toContain('Câu hỏi mới');
      expect(body).toContain('Who scores?');
      expect(body).toContain('90s');
      expect(body).toContain('+50');
    });

    it('newQuestionText renders English when locale=en', () => {
      const { body } = newQuestionText('en', 'Who scores?', 90, 50);
      expect(body).toContain('New question');
      expect(body).not.toContain('Câu hỏi mới');
      expect(body).toContain('Who scores?');
    });

    it('correctText renders different language per locale (regression pin)', () => {
      const vi = correctText('vi', 'VAR?', 100, 1500).body;
      const en = correctText('en', 'VAR?', 100, 1500).body;
      expect(vi).toContain('Chính xác');
      expect(en).toContain('Correct!');
      expect(vi).not.toBe(en);
    });

    it('wrongText + timeoutText also distinguish locale', () => {
      expect(wrongText('vi', 'x', 50).body).toContain('Tiếc quá');
      expect(wrongText('en', 'x', 50).body).toContain('Tough luck');
      expect(timeoutText('vi', 'x').body).toContain('hết giờ');
      expect(timeoutText('en', 'x').body).toContain("Time's up");
    });

    it('title is always literal "FanZone" regardless of locale', () => {
      expect(newQuestionText('vi', 't', 1, 1).title).toBe('FanZone');
      expect(newQuestionText('en', 't', 1, 1).title).toBe('FanZone');
    });
  });
});
