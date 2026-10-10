// بازار ایپ - اطلاع بھیجنے والا چھوٹا سرور (Railway پر چلتا ہے)
const admin = require('firebase-admin');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: process.env.DB_URL || 'https://bazaar---app-default-rtdb.firebaseio.com'
});
const db = admin.database();

async function handle(snap) {
  const v = snap.val() || {};
  try {
    if (!v.to || !v.from || v.to === v.from) return;
    if (v.ts && Date.now() - v.ts > 120000) return;        // پرانی درخواست چھوڑ دیں
    const [tk, nm, ps] = await Promise.all([
      db.ref('fcmTokens/' + v.to).once('value'),
      db.ref('users/' + v.from + '/name').once('value'),
      db.ref('users/' + v.to + '/pushSound').once('value')
    ]);
    const map = tk.val() || {};
    const keys = Object.keys(map);
    const tokens = keys.map(k => map[k]);
    if (!tokens.length) return;
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        title: String(nm.val() || 'بازار ایپ'),
        body: String(v.body || 'نیا پیغام'),
        from: String(v.from),
        kind: String(v.kind || 'msg'),
        silent: ps.val() === false ? '1' : '0'
      },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } }
    });
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const c = r.error && r.error.code;
        if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') {
          db.ref('fcmTokens/' + v.to + '/' + keys[i]).remove().catch(() => {});
        }
      }
    });
  } catch (e) {
    console.error('push error:', e.message);
  } finally {
    snap.ref.remove().catch(() => {});
  }
}

db.ref('push').on('child_added', handle);

require('http').createServer((q, r) => r.end('bazaar push ok')).listen(process.env.PORT || 3000);
console.log('bazaar push server chal raha hai');
