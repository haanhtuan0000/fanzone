import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

let app: admin.app.App | null = null;

/**
 * Returns the process-wide Firebase Admin app, initialising it lazily.
 *
 * The service-account JSON is located via (in order):
 *   1. `FIREBASE_SERVICE_ACCOUNT` env var — a path to the JSON file
 *      (used in prod deploys so the secret lives in platform secrets).
 *   2. `FIREBASE_SERVICE_ACCOUNT_JSON` env var — the JSON contents
 *      inline (useful on Render where secrets are env-only).
 *   3. `backend/firebase-service-account.json` relative to the repo —
 *      the local-dev fallback (gitignored).
 *
 * Callers should wrap the first call at startup inside a try/catch so a
 * missing key only disables push, never crashes the process.
 */
export function getFirebaseAdmin(): admin.app.App {
  if (app) return app;

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    app = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(inlineJson) as admin.ServiceAccount),
    });
    return app;
  }

  const keyPath =
    process.env.FIREBASE_SERVICE_ACCOUNT ??
    path.resolve(process.cwd(), 'firebase-service-account.json');

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Firebase service account not found at ${keyPath}. ` +
        `Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_JSON env var.`,
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as admin.ServiceAccount;
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return app;
}

/** Test hook — resets the singleton so unit tests can inject a fake. */
export function __resetFirebaseAdminForTests() {
  app = null;
}
