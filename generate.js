// ============================================================
// MiPost.app — API serverless (Vercel)
// Maneja: generación IA, webhook Hotmart, auth Supabase
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Créditos que otorga cada plan de Hotmart
const PLAN_CREDITS = {
  'default': 13,  // Plan mensual: 1 análisis + 12 semanas
};

// Helper: llamar a Supabase REST API
async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// Helper: obtener usuario por email
async function getUserByEmail(email) {
  const r = await supabase('GET', `usuarios?email=eq.${encodeURIComponent(email)}&limit=1`);
  if (r.ok && Array.isArray(r.data) && r.data.length > 0) return r.data[0];
  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';

  // ============================================================
  // RUTA 1: Webhook Hotmart → /api/webhook-hotmart
  // ============================================================
  if (url.includes('webhook-hotmart')) {
    if (req.method !== 'POST') return res.status(405).end();
    try {
      const payload = req.body;
      const email =
        payload?.data?.buyer?.email ||
        payload?.buyer?.email ||
        payload?.data?.purchase?.buyer?.email ||
        null;
      const hotmartId =
        payload?.data?.purchase?.transaction ||
        payload?.data?.transaction ||
        payload?.id ||
        null;

      if (!email) return res.status(400).json({ error: 'Email no encontrado en el payload' });

      await supabase('POST', 'pagos', {
        email,
        monto: payload?.data?.purchase?.price?.value || 25,
        estado: 'pagado',
        hotmart_id: hotmartId,
      });

      const creditsToAdd = PLAN_CREDITS['default'];
      const existingUser = await getUserByEmail(email);

      if (existingUser) {
        const newCredits = (existingUser.creditos || 0) + creditsToAdd;
        await supabase('PATCH', `usuarios?email=eq.${encodeURIComponent(email)}`, {
          creditos: newCredits,
          estado: 'activo',
        });
      } else {
        await supabase('POST', 'usuarios', {
          email,
          creditos: creditsToAdd,
          estado: 'pagado_sin_cuenta',
        });
      }

      return res.status(200).json({ ok: true, email, credits: creditsToAdd });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ============================================================
  // RUTA 2: Auth → /api/auth
  // ============================================================
  if (url.includes('/api/auth')) {
    if (req.method !== 'POST') return res.status(405).end();
    const { action, email } = req.body || {};

    if (action === 'get-credits') {
      if (!email) return res.status(400).json({ error: 'Email requerido' });
      const user = await getUserByEmail(email);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado', credits: 0 });
      return res.status(200).json({ credits: user.creditos || 0, estado: user.estado });
    }

    if (action === 'consume-credit') {
      if (!email) return res.status(400).json({ error: 'Email requerido' });
      const user = await getUserByEmail(email);
      if (!user || user.creditos < 1) {
        return res.status(403).json({ error: 'Sin créditos disponibles' });
      }
      await supabase('PATCH', `usuarios?email=eq.${encodeURIComponent(email)}`, {
        creditos: user.creditos - 1,
      });
      return res.status(200).json({ ok: true, credits: user.creditos - 1 });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  }

  // ============================================================
  // RUTA 3: Generar contenido → /api/generate
  // ============================================================
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, maxTokens = 2000, code, email: userEmail } = req.body || {};

  if (userEmail) {
    const user = await getUserByEmail(userEmail);
    if (!user || user.creditos < 1) {
      return res.status(403).json({ error: 'Sin créditos disponibles. Recarga en mipost.app' });
    }
  } else if (code) {
    const VALID_CODES = {
      'MIPOST-BETA-001': 5, 'MIPOST-BETA-002': 5, 'MIPOST-BETA-003': 5,
      'MIPOST-BETA-004': 5, 'MIPOST-BETA-005': 5, 'MIPOST-BETA-006': 5,
      'MIPOST-BETA-007': 5, 'MIPOST-BETA-008': 5, 'MIPOST-BETA-009': 5,
      'MIPOST-BETA-010': 5, 'MIPOST-BETA-011': 5, 'MIPOST-BETA-012': 5,
      'MIPOST-BETA-013': 5, 'MIPOST-BETA-014': 5, 'MIPOST-BETA-015': 5,
      'MIPOST-BETA-016': 5, 'MIPOST-BETA-017': 5, 'MIPOST-BETA-018': 5,
      'MIPOST-BETA-019': 5, 'MIPOST-BETA-020': 5,
      'MIPOST-ADMIN-2026': 999, 'MIPOST-TEST-001': 5,
    };
    if (!VALID_CODES[code]) {
      return res.status(403).json({ error: 'Código de activación inválido' });
    }
  } else {
    return res.status(403).json({ error: 'Se requiere email autenticado o código de activación' });
  }

  if (!prompt) return res.status(400).json({ error: 'Prompt requerido' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Error de API' });
    }

    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');

    if (userEmail) {
      const user = await getUserByEmail(userEmail);
      if (user) {
        await supabase('PATCH', `usuarios?email=eq.${encodeURIComponent(userEmail)}`, {
          creditos: Math.max(0, user.creditos - 1),
        });
      }
    }

    return res.status(200).json({ result: text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
