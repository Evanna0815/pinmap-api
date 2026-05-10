import { createClient } from '@supabase/supabase-js';

// CORS allowlist — set ALLOWED_ORIGINS as comma-separated list in env
const ALLOWED = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // 1. Verify Bearer token — caller must be the authenticated user themselves
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  const userClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const authedUserId = userData.user.id;
  const authedNickname = userData.user.user_metadata?.nickname || null;

  // 2. Body params — user_id is NEVER trusted from body
  const { guest_id, nickname } = req.body || {};

  // 3. nickname (if provided) must equal the caller's own nickname
  if (nickname && nickname !== authedNickname) {
    return res.status(403).json({ error: 'nickname does not match authenticated account' });
  }

  // 4. Service-role client to bypass RLS for the actual UPDATE
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );

  const results = [];

  if (guest_id) {
    // Extra guard: also require author_name == authedNickname,
    // so a leaked guest_id alone cannot be used to steal someone else's entries.
    const q = supabase
      .from('entries')
      .update({ user_id: authedUserId, guest_id: null })
      .eq('guest_id', guest_id)
      .is('user_id', null);
    if (authedNickname) q.eq('author_name', authedNickname);
    const { error } = await q;
    results.push({ type: 'guest_id', error: error?.message });
  }

  if (nickname) {
    const { error } = await supabase
      .from('entries')
      .update({ user_id: authedUserId, guest_id: null })
      .eq('author_name', nickname)
      .is('user_id', null);
    results.push({ type: 'nickname', error: error?.message });
  }

  res.status(200).json({ ok: true, results });
}
