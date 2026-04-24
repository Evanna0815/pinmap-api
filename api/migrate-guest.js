import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin === process.env.ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { guest_id, user_id } = req.body;
  if (!guest_id || !user_id) return res.status(400).json({ error: '缺少参数' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );

  const { error } = await supabase
    .from('entries')
    .update({ user_id, guest_id: null })
    .eq('guest_id', guest_id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
}
