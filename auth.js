// api/auth.js
// Maneja créditos de usuarios autenticados con Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseReq(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  // Buscar usuario
  const userRes = await supabaseReq('GET', `usuarios?email=eq.${encodeURIComponent(email)}&limit=1`);
  const user = userRes.ok && Array.isArray(userRes.data) && userRes.data.length > 0
    ? userRes.data[0]
    : null;

  // Obtener créditos
  if (action === 'get-credits') {
    if (!user) {
      // Usuario no existe aún en nuestra tabla — puede que acabe de registrarse
      // Crear registro vacío para que pueda comprar créditos
      await supabaseReq('POST', 'usuarios', {
        email,
        creditos: 0,
        estado: 'sin_creditos',
      });
      return res.status(200).json({ credits: 0, estado: 'sin_creditos' });
    }
    return res.status(200).json({ credits: user.creditos || 0, estado: user.estado });
  }

  // Consumir 1 crédito
  if (action === 'consume-credit') {
    if (!user || user.creditos < 1) {
      return res.status(403).json({ error: 'Sin créditos disponibles' });
    }
    const newCredits = user.creditos - 1;
    await supabaseReq('PATCH', `usuarios?email=eq.${encodeURIComponent(email)}`, {
      creditos: newCredits,
    });
    return res.status(200).json({ ok: true, credits: newCredits });
  }

  return res.status(400).json({ error: 'Acción no reconocida' });
}
