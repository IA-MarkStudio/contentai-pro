// api/webhook-hotmart.js
// Recibe pagos de Hotmart y agrega créditos en Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PLAN_CREDITS = 13; // 1 análisis + 12 semanas

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
  try { return { ok: res.ok, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, data: text }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const payload = req.body;

    // Extraer email del comprador (Hotmart tiene varios formatos)
    const email =
      payload?.data?.buyer?.email ||
      payload?.buyer?.email ||
      payload?.data?.purchase?.buyer?.email ||
      null;

    const hotmartId =
      payload?.data?.purchase?.transaction ||
      payload?.data?.transaction ||
      payload?.id ||
      String(Date.now());

    if (!email) {
      console.error('Hotmart webhook: email no encontrado', JSON.stringify(payload));
      return res.status(400).json({ error: 'Email no encontrado en el payload' });
    }

    // Guardar pago en tabla pagos
    await supabaseReq('POST', 'pagos', {
      email,
      monto: payload?.data?.purchase?.price?.value || 25,
      estado: 'pagado',
      hotmart_id: hotmartId,
    });

    // Buscar si el usuario ya existe
    const userRes = await supabaseReq('GET', `usuarios?email=eq.${encodeURIComponent(email)}&limit=1`);
    const existingUser = userRes.ok && Array.isArray(userRes.data) && userRes.data.length > 0
      ? userRes.data[0]
      : null;

    if (existingUser) {
      // Sumar créditos al usuario existente
      await supabaseReq('PATCH', `usuarios?email=eq.${encodeURIComponent(email)}`, {
        creditos: (existingUser.creditos || 0) + PLAN_CREDITS,
        estado: 'activo',
      });
    } else {
      // Crear nuevo registro — usuario aún no se ha registrado
      await supabaseReq('POST', 'usuarios', {
        email,
        creditos: PLAN_CREDITS,
        estado: 'pagado_sin_cuenta',
      });
    }

    return res.status(200).json({ ok: true, email, credits_added: PLAN_CREDITS });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
