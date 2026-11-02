const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');

// Initialize firebase-admin from backend/.env service-account values.
// Returns the Auth instance (or null when not configured yet, so the endpoint
// can return a clear message).
// NOTE: firebase-admin v14 exposes getApps()/initializeApp()/cert() at the top
// level, but NO LONGER exposes admin.auth() there — auth lives in
// firebase-admin/auth via getAuth(). Calling admin.auth() throws
// "admin.auth is not a function", which previously got swallowed by the
// controller's catch and surfaced as "Invalid or expired Firebase token".
const getFirebaseAdmin = () => {
    const { getApps, initializeApp, cert } = admin;
    if (!getApps().length) {
        const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
        if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
            return null;
        }
        // Handle private key: .env stores literal \n sequences (two chars: backslash + n)
        // Must replace literal backslash-n with actual newlines
        let pk = FIREBASE_PRIVATE_KEY
            .replace(/\\n/g, '\n')           // literal \n -> actual newline
            .replace(/\\r/g, '')              // remove any carriage returns
            .trim();
        // Ensure proper PEM format with newlines around headers
        let normalizedPk = pk
            .replace(/-----BEGIN PRIVATE KEY-----\s*/, '-----BEGIN PRIVATE KEY-----\n')
            .replace(/\s*-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----\n');
        // Fix any remaining double newlines
        normalizedPk = normalizedPk.replace(/\n{3,}/g, '\n\n');
        console.log('[firebase.js] Private key normalized, length:', normalizedPk.length);
        try {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: normalizedPk,
                }),
            });
            console.log('[firebase.js] Firebase admin initialized successfully');
        } catch (e) {
            console.error('[firebase.js] init error:', e.message);
            return null;
        }
    }
    // v14: getAuth() (no arg) binds to the default app initialized above
    return getAuth();
};

module.exports = getFirebaseAdmin;
