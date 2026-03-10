export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, maxTokens = 2000, code } = req.body;

  const VALID_CODES = process.env.VALID_CODES
    ? JSON.parse(process.env.VALID_CODES)
    : {
        'MKTPRO-2024-DEMO': 12,
        'MKTPRO-2024-A001': 12,
        'MKTPRO-2024-A002': 12,
        'MKTPRO-2024-A003': 12,
        'MKTPRO-2024-A004': 12,
        'MKTPRO-2024-A005': 12,
        'MKTPRO-FULL-100': 100,
        'DEMO-TEST-0001': 3,
      };

  if (!code || !VALID_CODES[code]) {
    return res.status(403).json({ error: 'Codigo de activacion invalido' });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt requerido' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Error de API' });
    }

    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');
    return res.status(200).json({ result: text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
