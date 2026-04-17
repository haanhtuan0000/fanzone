#!/usr/bin/env node
// Usage: node _fcm_send_to_user.js <userId> "<title>" "<body>" [route]
// Sends a real FCM push to every device registered for <userId>.
// Example: node _fcm_send_to_user.js 12345 "Hello" "Test push" /profile

const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const [userId, title, body, route] = process.argv.slice(2);
  if (!userId || !title || !body) {
    console.error('Usage: node _fcm_send_to_user.js <userId> "<title>" "<body>" [route]');
    process.exit(2);
  }

  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  const prisma = new PrismaClient();
  const devices = await prisma.userDevice.findMany({ where: { userId } });
  if (devices.length === 0) {
    console.error(`No devices registered for userId=${userId}`);
    console.error('Make sure the user has logged into the app at least once on a physical/emulator device.');
    process.exit(1);
  }
  console.log(`Found ${devices.length} device(s) for user ${userId}`);

  const tokens = devices.map((d) => d.fcmToken);
  const data = route ? { route } : {};

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  });

  console.log(`Sent: ${res.successCount} / ${res.successCount + res.failureCount}`);
  res.responses.forEach((r, i) => {
    const head = `  [${i}] token=${tokens[i].substring(0, 12)}...`;
    if (r.success) console.log(`${head} OK (messageId=${r.messageId})`);
    else console.log(`${head} FAIL ${r.error?.code}: ${r.error?.message}`);
  });

  await prisma.$disconnect();
  process.exit(res.failureCount === res.responses.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
