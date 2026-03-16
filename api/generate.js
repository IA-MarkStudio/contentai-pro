// MiPost.app — API serverless con streaming para evitar timeout

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

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  const url = new URL(req.url);

  // ============================================================
  // WEBHOOK HOTMART
  // ============================================================
  if (url.pathname.includes('webhook-hotmart')) {
    const payload = await req.json().catch(() => ({}));
    const email = payload?.data?.buyer?.email || payload?.buyer?.email || null;
    const hotmartId = payload?.data?.purchase?.transaction || String(Date.now());

    if (!email) return new Response(JSON.stringify({ error: 'Email no encontrado' }), { status: 400 });

    await supabaseReq('POST', 'pagos', {
      email, monto: payload?.data?.purchase?.price?.value || 25,
      estado: 'pagado', hotmart_id: hotmartId,
    });

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      await supabaseReq('PATCH', `usuarios?email=eq.${encodeURIComponent(email)}`, {
        creditos: (existingUser.creditos || 0) + PLAN_CREDITS, estado: 'activo',
      });
    } else {
      await supabaseReq('POST', 'usuarios', {
        email, creditos: PLAN_CREDITS, estado: 'pagado_sin_cuenta',
      });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ============================================================
  // AUTH
  // ============================================================
  if (url.pathname.includes('/api/auth')) {
    const { action, email } = await req.json().catch(() => ({}));
    if (!email) return new Response(JSON.stringify({ error: 'Email requerido' }), { status: 400 });

    const user = await getUserByEmail(email);

    if (action === 'get-credits') {
      if (!user) {
        await supabaseReq('POST', 'usuarios', { email, creditos: 0, estado: 'sin_creditos' });
        return new Response(JSON.stringify({ credits: 0, estado: 'sin_creditos' }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ credits: user.creditos || 0, estado: user.estado }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'consume-credit') {
      if (!user || user.creditos < 1) return new Response(JSON.stringify({ error: 'Sin créditos' }), { status: 403 });
      await supabaseReq('PATCH', `usuarios?email=eq.${encodeURIComponent(email)}`, { creditos: user.creditos - 1 });
      return new Response(JSON.stringify({ ok: true, credits: user.creditos - 1 }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Acción no reconocida' }), { status: 400 });
  }

  // ============================================================
  // GENERAR CONTENIDO CON STREAMING
  // ============================================================
  const { prompt, maxTokens = 2000, code, email: userEmail } = await req.json().catch(() => ({}));

  // Validar créditos
  if (userEmail) {
    const user = await getUserByEmail(userEmail);
    if (!user || user.creditos < 1) {
      return new Response(JSON.stringify({ error: 'Sin créditos disponibles' }), { status: 403 });
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
    if (!VALID_CODES[code]) return new Response(JSON.stringify({ error: 'Código inválido' }), { status: 403 });
  } else {
    return new Response(JSON.stringify({ error: 'Se requiere autenticación' }), { status: 403 });
  }

  if (!prompt) return new Response(JSON.stringify({ error: 'Prompt requerido' }), { status: 400 });

  // Llamar a Anthropic con streaming
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
    return new Response(JSON.stringify({ error: err.error?.message || 'Error de API' }), { status: anthropicRes.status });
  }

  // Consumir crédito si está autenticado
  if (userEmail) {
    const user = await getUserByEmail(userEmail);
    if (user) {
      await supabaseReq('PATCH', `usuarios?email=eq.${encodeURIComponent(userEmail)}`, {
        creditos: Math.max(0, user.creditos - 1),
      });
    }
  }

  // Stream: transformar SSE de Anthropic en texto plano
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body.getReader();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text;
                controller.enqueue(encoder.encode(parsed.delta.text));
              }
            } catch {}
          }
        }
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
