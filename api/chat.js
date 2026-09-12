const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

const MAX_MESSAGES = 60;
const MAX_MESSAGE_LENGTH = 6000;
const MAX_TOTAL_LENGTH = 24000;

const SYSTEM_INSTRUCTIONS = `
Você é a IA do Chat Livre AI.
Converse naturalmente com o usuário e seja útil, direto e claro.
Responda aos assuntos trazidos pelo usuário seguindo as políticas e limites aplicáveis.
`.trim();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido.'
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY não configurada na Vercel.'
    });
  }

  try {
    let body = req.body;

    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        error: 'Corpo da requisição inválido.'
      });
    }

    const messages = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma mensagem enviada.'
      });
    }

    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({
        error: `Máximo de ${MAX_MESSAGES} mensagens por requisição.`
      });
    }

    let totalLength = 0;

    const sanitizedMessages = [];

    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        return res.status(400).json({
          error: 'Mensagem inválida.'
        });
      }

      const role = message.role;
      const content = message.content;

      if (role !== 'user' && role !== 'assistant') {
        return res.status(400).json({
          error: 'Role de mensagem inválida.'
        });
      }

      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({
          error: 'Conteúdo da mensagem inválido.'
        });
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          error: `Cada mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`
        });
      }

      totalLength += content.length;

      if (totalLength > MAX_TOTAL_LENGTH) {
        return res.status(400).json({
          error: `O tamanho total da conversa excede ${MAX_TOTAL_LENGTH} caracteres.`
        });
      }

      sanitizedMessages.push({
        role,
        content: content.trim()
      });
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        instructions: SYSTEM_INSTRUCTIONS,
        input: sanitizedMessages,
        store: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro da OpenAI:', data);

      if (response.status === 401) {
        return res.status(500).json({
          error: 'A chave da OpenAI é inválida ou não está autorizada.'
        });
      }

      if (response.status === 429) {
        return res.status(429).json({
          error: 'Limite ou créditos da API da OpenAI atingidos.'
        });
      }

      if (response.status === 404) {
        return res.status(500).json({
          error: `Modelo da OpenAI não encontrado: ${DEFAULT_MODEL}`
        });
      }

      return res.status(500).json({
        error:
          data?.error?.message ||
          'Erro ao comunicar com a API da OpenAI.'
      });
    }

    const reply = extractReplyText(data);

    if (!reply) {
      console.error('Resposta inesperada da OpenAI:', data);

      return res.status(500).json({
        error: 'A OpenAI não retornou texto.'
      });
    }

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error('Erro interno:', error);

    return res.status(500).json({
      error: 'Erro interno no servidor.'
    });
  }
};

function extractReplyText(data) {
  if (typeof data?.output_text === 'string') {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return '';
  }

  const parts = [];

  for (const item of data.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}
