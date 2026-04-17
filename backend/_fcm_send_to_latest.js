#!/usr/bin/env node
// Usage: node _fcm_send_to_latest.js "<title>" "<body>" [route]
// Sends an FCM push to the MOST RECENTLY registered device in the DB.
// Useful for end-to-end testing when you don't know the userId.

const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const [title, body, route] = process.argv.slice(2);
  if (!title || !body) {
    console.error('Usage: node _fcm_send_to_latest.js "<title>" "<body>" [route]');
    process.exit(2);
  }

  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  const prisma = new PrismaClient();
  const device = await prisma.userDevice.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  if (!device) {
    console.error('No devices registered yet.');
    process.exit(1);
  }
  console.log(`Targeting device: userId=${device.userId} platform=${device.platform}`);
  console.log(`Token: ${device.fcmToken.substring(0, 16)}...`);

  const data = route ? { route } : {};
  const res = await admin.messaging().send({
    token: device.fcmToken,
    notification: { title, body },
    data,
  });
  console.log(`Sent. Message ID: ${res}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e.code || '', e.message);
  process.exit(1);
});
