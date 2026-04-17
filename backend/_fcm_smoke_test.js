const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

async function main() {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[OK] Firebase Admin initialized');
    console.log('[OK] Project ID:', serviceAccount.project_id);
    console.log('[OK] Service account:', serviceAccount.client_email);

    const response = await admin.messaging().send(
      {
        topic: 'smoke-test',
        notification: {
          title: 'FanZone smoke test',
          body: 'This is a dry-run — no device will receive this.',
        },
      },
      true,
    );
    console.log('[OK] Dry-run send succeeded. Response:', response);
    console.log('');
    console.log('FCM credentials are valid. Ready to implement.');
    process.exit(0);
  } catch (err) {
    console.error('[FAIL]', err.code || '', err.message);
    if (err.errorInfo) console.error('[FAIL] errorInfo:', err.errorInfo);
    process.exit(1);
  }
}

main();
