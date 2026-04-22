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

  const { entry_id, guest_id } = req.body;
  if (!entry_id || !guest_id)
    return res.status(400).json({ error: '缺少参数' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );

  const { data } = await supabase
    .from('entries')
    .select('id, guest_id')
    .eq('id', entry_id)
    .single();

  if (!data || data.guest_id !== guest_id)
    return res.status(403).json({ error: '无权删除' });

  await supabase.from('entries').delete().eq('id', entry_id);
  res.status(200).json({ ok: true });
}
