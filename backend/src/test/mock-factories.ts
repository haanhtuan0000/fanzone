/**
 * Shared mock factories for unit tests.
 */

export function createMockPrisma() {
  return {
    question: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    questionTemplate: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    questionOption: {
      update: jest.fn(),
    },
    prediction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    feedEvent: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    coinTransaction: {
      create: jest.fn(),
    },
  };
}

export function createMockRedis() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
    hgetall: jest.fn().mockResolvedValue({}),
    zadd: jest.fn().mockResolvedValue(undefined),
    lpush: jest.fn().mockResolvedValue(undefined),
    lrange: jest.fn().mockResolvedValue([]),
    ltrim: jest.fn().mockResolvedValue(undefined),
  };
}

export function createMockWebsocket() {
  return {
    emitToMatch: jest.fn(),
  };
}

export function createMockQuestion(overrides: Record<string, any> = {}) {
  return {
    id: 'q-test-1',
    fixtureId: 12345,
    category: 'GOAL',
    difficulty: 'EASY',
    status: 'OPEN',
    text: 'Test question?',
    textVi: 'Câu hỏi test?',
    rewardCoins: 100,
    matchPhase: 'EARLY_H1',
    matchMinute: 5,
    templateId: 'tpl-1',
    opensAt: new Date('2026-04-10T10:00:00Z'),
    closesAt: new Date('2026-04-10T10:00:40Z'),
    resolvesAt: null,
    correctOptionId: null,
    createdAt: new Date('2026-04-10T09:59:00Z'),
    options: [
      { id: 'opt-1', name: 'Option A', emoji: '⚽', multiplier: 2.0, fanCount: 0, fanPct: 0, isCorrect: false },
      { id: 'opt-2', name: 'Option B', emoji: '🎯', multiplier: 3.0, fanCount: 0, fanPct: 0, isCorrect: false },
    ],
    ...overrides,
  };
}

export function createMockPendingQuestion(overrides: Record<string, any> = {}) {
  const future = new Date(Date.now() + 5 * 60_000);
  return createMockQuestion({
    id: 'q-pending-1',
    status: 'PENDING',
    opensAt: future,
    closesAt: new Date(future.getTime() + 40_000),
    ...overrides,
  });
}

export function createMockTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 'tpl-test-1',
    code: 'Q001',
    category: 'GOAL',
    difficulty: 'MEDIUM',
    trigger: 'SCHEDULED',
    phases: ['EARLY_H1', 'MID_H1'],
    textVi: 'Ai sẽ ghi bàn tiếp theo?',
    textEn: 'Who will score next?',
    rewardCoins: 150,
    answerWindowSec: 40,
    options: [
      { nameVi: '{home_striker}', nameEn: '{home_striker}', emoji: '⚽', defaultPct: 42 },
      { nameVi: '{away_striker}', nameEn: '{away_striker}', emoji: '⚽', defaultPct: 30 },
    ],
    resolutionStrategy: 'AUTO',
    weight: 100,
    isActive: true,
    ...overrides,
  };
}
