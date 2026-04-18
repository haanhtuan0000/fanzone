#!/usr/bin/env node
// One-off Stage 3 smoke test — sends all 4 new notification types to a
// single FCM token so we can visually inspect tray entries (backgrounded)
// and toasts (foregrounded).
//
// Usage: node _fcm_send_stage3_test.js <token> <type>
//   type = new_question | correct | wrong | timeout | all

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(require('./firebase-service-account.json')),
});

const templates = {
  new_question: {
    notification: {
      title: 'FanZone',
      body: '⚡ Câu hỏi mới: Ai ghi bàn tiếp theo? · 90s để trả lời · +50🪙',
    },
    data: {
      type: 'new_question',
      route: '/predict',
      fixtureId: '9999',
      questionId: 'test-q-1',
      questionText: 'Ai ghi bàn tiếp theo?',
      seconds: '90',
      rewardCoins: '50',
    },
  },
  correct: {
    notification: {
      title: 'FanZone',
      body: '🎯 Chính xác! VAR được gọi? · +100🪙 · Tổng: 1500🪙 hôm nay',
    },
    data: {
      type: 'correct',
      route: '/predict',
      fixtureId: '9999',
      questionId: 'test-q-2',
      questionText: 'VAR được gọi?',
      coins: '100',
      dailyTotal: '1500',
    },
  },
  wrong: {
    notification: {
      title: 'FanZone',
      body: '❌ Tiếc quá! Đội nhà ghi bàn trước? · −50🪙 · Thử lại câu tiếp',
    },
    data: {
      type: 'wrong',
      route: '/predict',
      fixtureId: '9999',
      questionId: 'test-q-3',
      questionText: 'Đội nhà ghi bàn trước?',
      coins: '50',
    },
  },
  timeout: {
    notification: {
      title: 'FanZone',
      body: '⏰ Đã hết giờ cho câu: Phạt góc trong 5 phút? · Câu tiếp đang chờ!',
    },
    data: {
      type: 'timeout',
      route: '/predict',
      fixtureId: '9999',
      questionId: 'test-q-4',
      questionText: 'Phạt góc trong 5 phút?',
    },
  },
};

async function sendOne(token, type) {
  const t = templates[type];
  const res = await admin.messaging().send({ token, ...t });
  console.log(`  [${type}] OK  msgId=${res}`);
}

(async () => {
  const [token, type] = process.argv.slice(2);
  if (!token || !type) {
    console.error('Usage: node _fcm_send_stage3_test.js <token> <new_question|correct|wrong|timeout|all>');
    process.exit(2);
  }
  try {
    if (type === 'all') {
      for (const t of Object.keys(templates)) {
        await sendOne(token, t);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } else if (templates[type]) {
      await sendOne(token, type);
    } else {
      console.error(`Unknown type: ${type}`);
      process.exit(2);
    }
    console.log('Done.');
  } catch (e) {
    console.error('FAIL:', e.code, e.message);
    process.exit(1);
  }
})();
