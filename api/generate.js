export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PLAN_CREDITS = 13;

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

async function getUserByEmail(email) {
  const r = await supabaseReq('GET', `usuarios?email=eq.${encodeURIComponent(email)}&limit=1`);
  if (r.ok && Array.isArray(r.data) && r.data.length > 0) return r.data[0];
  return null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_CODES = {
  'MIPOST-BETA-001':5,'MIPOST-BETA-002':5,'MIPOST-BETA-003':5,'MIPOST-BETA-004':5,'MIPOST-BETA-005':5,
  'MIPOST-BETA-006':5,'MIPOST-BETA-007':5,'MIPOST-BETA-008':5,'MIPOST-BETA-009':5,'MIPOST-BETA-010':5,
  'MIPOST-BETA-011':5,'MIPOST-BETA-012':5,'MIPOST-BETA-013':5,'MIPOST-BETA-014':5,'MIPOST-BETA-015':5,
  'MIPOST-BETA-016':5,'MIPOST-BETA-017':5,'MIPOST-BETA-018':5,'MIPOST-BETA-019':5,'MIPOST-BETA-020':5,
  'MIPOST-ADMIN-2026':999,'MIPOST-TEST-001':5,
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const { prompt, maxTokens = 2000, code, email: userEmail, stream: useStream } = await req.json().catch(() => ({}));

  // Validar acceso
  if (userEmail) {
    const user = await getUserByEmail(userEmail);
    if (!user || user.creditos < 1) {
      return new Response(JSON.stringify({ error: 'Sin créditos disponibles' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  } else if (code) {
    if (!VALID_CODES[code]) {
      return new Response(JSON.stringify({ error: 'Código inválido' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Se requiere autenticación' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (!prompt) return new Response(JSON.stringify({ error: 'Prompt requerido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  // Llamar a Anthropic siempre con streaming
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err.error?.message || 'Error de API' }), {
      status: anthropicRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  // Consumir crédito
  if (userEmail) {
    const user = await getUserByEmail(userEmail);
    if (user) {
      await supabaseReq('PATCH', `usuarios?email=eq.${encodeURIComponent(userEmail)}`, {
        creditos: Math.max(0, user.creditos - 1),
      });
    }
  }

  // Stream SSE → texto plano
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              controller.enqueue(encoder.encode(parsed.delta.text));
            }
          } catch {}
        }
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}
