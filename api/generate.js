export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { prompt, maxTokens = 2000, code } = req.body;

  // Validar el código de activación
  const VALID_CODES = process.env.VALID_CODES
    ? JSON.parse(process.env.VALID_CODES)
    : {
        'MIPOST-BETA-001': 5,
        'MIPOST-BETA-002': 5,
        'MIPOST-BETA-003': 5,
        'MIPOST-BETA-004': 5,
        'MIPOST-BETA-005': 5,
        'MIPOST-BETA-006': 5,
        'MIPOST-BETA-007': 5,
        'MIPOST-BETA-008': 5,
        'MIPOST-BETA-009': 5,
        'MIPOST-BETA-010': 5,
        'MIPOST-BETA-011': 5,
        'MIPOST-BETA-012': 5,
        'MIPOST-BETA-013': 5,
        'MIPOST-BETA-014': 5,
        'MIPOST-BETA-015': 5,
        'MIPOST-BETA-016': 5,
        'MIPOST-BETA-017': 5,
        'MIPOST-BETA-018': 5,
        'MIPOST-BETA-019': 5,
        'MIPOST-BETA-020': 5,
      };

  si (!código || !CÓDIGOS_VÁLIDOS[código]) {
    return res.status(403).json({ error: 'Código de activación inválido' });
  }

  si (!prompt) {
    return res.status(400).json({ error: 'Prompt requerido' });
  }

  intentar {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      método: 'POST',
      encabezados: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'versión antrópica': '2023-06-01',
      },
      cuerpo: JSON.stringify({
        modelo: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        mensajes: [{ rol: 'usuario', contenido: mensaje }],
      }),
    });

    si (!respuesta.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Error de API' });
    }

    const datos = esperar respuesta.json();
    const texto = datos.contenido.map(b => b.texto || '').join('');
    return res.status(200).json({ result: text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
