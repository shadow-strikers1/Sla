const MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTIONS = `
Você é a IA do Chat Livre AI.

Converse naturalmente com o usuário.
Seja útil, direto, claro e amigável.
Responda em português quando o usuário falar português.
Siga as políticas e limites aplicáveis.
`;

export default async function handler(req, res) {
  // Apenas POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY não configurada no Vercel."
    });
  }

  try {
    const body = req.body;

    if (!body || !Array.isArray(body.messages)) {
      return res.status(400).json({
        error: "Formato de mensagem inválido."
      });
    }

    // Limite de mensagens
    const messages = body.messages.slice(-40);

    // Converte o histórico do seu chat para o formato Gemini
    const contents = [];

    for (const message of messages) {
      if (!message || typeof message.content !== "string") {
        continue;
      }

      const content = message.content.trim();

      if (!content) {
        continue;
      }

      // Gemini usa "user" e "model"
      const role =
        message.role === "assistant"
          ? "model"
          : "user";

      contents.push({
        role,
        parts: [
          {
            text: content.slice(0, 6000)
          }
        ]
      });
    }

    if (contents.length === 0) {
      return res.status(400).json({
        error: "Nenhuma mensagem válida foi enviada."
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: SYSTEM_INSTRUCTIONS
              }
            ]
          },

          contents,

          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();

    // Chave inválida
    if (response.status === 400 || response.status === 401) {
      console.error("Gemini API authentication/request error:", data);

      return res.status(response.status).json({
        error: "A chave da Gemini API é inválida ou a requisição foi rejeitada."
      });
    }

    // Limite do Free Tier
    if (response.status === 429) {
      console.error("Gemini API rate limit:", data);

      return res.status(429).json({
        error: "O limite gratuito da Gemini API foi atingido. Tente novamente mais tarde."
      });
    }

    // Outros erros
    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(500).json({
        error: "Erro ao conversar com a Gemini API."
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!reply) {
      console.error("Resposta inesperada da Gemini:", data);

      return res.status(500).json({
        error: "A Gemini não retornou uma resposta válida."
      });
    }

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Erro interno ao conectar com a Gemini."
    });
  }
}
