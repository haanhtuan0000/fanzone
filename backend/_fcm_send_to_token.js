// One-off: send an FCM push to a raw token (bypasses DB).
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(require('./firebase-service-account.json')),
});

(async () => {
  const [token, title, body, route] = process.argv.slice(2);
  const res = await admin.messaging().send({
    token,
    notification: { title, body },
    data: route ? { route } : {},
  });
  console.log('Sent. Message ID:', res);
})().catch((e) => {
  console.error('FAIL:', e.code, e.message);
  process.exit(1);
});
