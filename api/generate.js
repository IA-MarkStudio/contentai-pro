export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, maxTokens = 2000, code, email: userEmail } = req.body || {};

  const VALID_CODES = {
    'MIPOST-BETA-001':5,'MIPOST-BETA-002':5,'MIPOST-BETA-003':5,'MIPOST-BETA-004':5,'MIPOST-BETA-005':5,
    'MIPOST-BETA-006':5,'MIPOST-BETA-007':5,'MIPOST-BETA-008':5,'MIPOST-BETA-009':5,'MIPOST-BETA-010':5,
    'MIPOST-BETA-011':5,'MIPOST-BETA-012':5,'MIPOST-BETA-013':5,'MIPOST-BETA-014':5,'MIPOST-BETA-015':5,
    'MIPOST-BETA-016':5,'MIPOST-BETA-017':5,'MIPOST-BETA-018':5,'MIPOST-BETA-019':5,'MIPOST-BETA-020':5,
    'MIPOST-ADMIN-2026':999,'MIPOST-TEST-001':5,
  };

  if (userEmail) {
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(userEmail)}&limit=1`,
        { headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } }
      );
      const users = await r.json();
      if (!users[0] || users[0].creditos < 1) return res.status(403).json({ error: 'Sin créditos disponibles' });
    } catch(e) {
      return res.status(500).json({ error: 'Error verificando créditos' });
    }
  } else if (code) {
    if (!VALID_CODES[code]) return res.status(403).json({ error: 'Código inválido' });
  } else {
    return res.status(403).json({ error: 'Se requiere autenticación' });
  }

  if (!prompt) return res.status(400).json({ error: 'Prompt requerido' });

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      return res.status(anthropicRes.status).json({ error: err.error?.message || 'Error de API Anthropic' });
    }

    const data = await anthropicRes.json();
    const text = data.content.map(b => b.text || '').join('');

    // Descontar crédito si usuario autenticado
    if (userEmail) {
      try {
        const r = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(userEmail)}&limit=1`,
          { headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } }
        );
        const users = await r.json();
        if (users[0]) {
          await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(userEmail)}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
              },
              body: JSON.stringify({ creditos: Math.max(0, users[0].creditos - 1) })
            }
          );
        }
      } catch(e) {}
    }

    return res.status(200).json({ result: text });

  } catch(error) {
    return res.status(500).json({ error: error.message });
  }
}
