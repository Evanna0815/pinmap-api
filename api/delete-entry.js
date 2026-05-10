import { createClient } from '@supabase/supabase-js';

const ALLOWED = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// In-process rate limiter. Vercel functions cold-start often, but within a warm
// instance this throttles burst abuse (script scanning the entry table).
const ipHits = new Map();
function rateLimit(ip, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  ipHits.set(ip, arr);
  return arr.length <= max;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { entry_id, guest_id } = req.body || {};
  if (!entry_id || !guest_id) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );

  const { data } = await supabase
    .from('entries')
    .select('id, guest_id, user_id')
    .eq('id', entry_id)
    .single();

  // Reject if entry not found, already migrated to a user, or guest_id doesn't match
  if (!data || data.user_id !== null || data.guest_id !== guest_id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { error } = await supabase.from('entries').delete().eq('id', entry_id);
  if (error) {
    console.error('[delete-entry] delete failed', { entry_id, ip, msg: error.message });
    return res.status(500).json({ error: 'Delete failed' });
  }

  // Log every delete for forensic visibility (Vercel function logs)
  console.log('[delete-entry] ok', { entry_id, ip });
  res.status(200).json({ ok: true });
}
