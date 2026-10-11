// بازار ایپ - اطلاع بھیجنے والا چھوٹا سرور (Railway پر چلتا ہے)
const admin = require('firebase-admin');

// کوئی غیر متوقع خرابی آئے تو سرور بند نہ ہو، صرف لاگ میں لکھ دے
process.on('unhandledRejection', e => console.error('unhandledRejection:', (e && e.message) || e));
process.on('uncaughtException', e => console.error('uncaughtException:', (e && e.message) || e));

let sa;
try {
  sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error('FIREBASE_SERVICE_ACCOUNT parse error:', e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: process.env.DB_URL || 'https://bazaar---app-default-rtdb.firebaseio.com'
});
console.log('project:', sa.project_id);

const db = admin.database();

async function handle(snap) {
  const v = snap.val() || {};
  console.log('push aaya: kind=' + (v.kind || 'msg') + ' from=' + v.from + ' to=' + v.to);
  try {
    if (!v.to || !v.from || v.to === v.from) { console.log('skip: to/from theek nahi'); return; }
    if (v.ts && Date.now() - v.ts > 120000) { console.log('skip: purani request'); return; }

    const [tk, nm, ps] = await Promise.all([
      db.ref('fcmTokens/' + v.to).once('value'),
      db.ref('users/' + v.from + '/name').once('value'),
      db.ref('users/' + v.to + '/pushSound').once('value')
    ]);
    const map = tk.val() || {};
    const keys = Object.keys(map);
    const tokens = keys.map(k => map[k]);
    console.log('tokens mile: ' + tokens.length);
    if (!tokens.length) { console.log('skip: us user ka koi token nahi'); return; }

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
    console.log('bheja: kamyab=' + res.successCount + ' nakam=' + res.failureCount);

    const dead = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const c = r.error && r.error.code;
        console.log('nakam code:', c, (r.error && r.error.message) || '');
        if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') {
          dead.push(db.ref('fcmTokens/' + v.to + '/' + keys[i]).remove());
        }
      }
    });
    await Promise.all(dead);
  } catch (e) {
    console.error('push error:', e.code || '', e.message);
  } finally {
    await snap.ref.remove().catch(() => {});
  }
}

db.ref('push').on('child_added', handle, err => console.error('listener error:', err.message));

require('http').createServer((q, r) => r.end('bazaar push ok')).listen(process.env.PORT || 3000);
console.log('bazaar push server chal raha hai');
