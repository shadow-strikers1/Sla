const MODEL = "gemini-3.6-flash";

const SYSTEM_INSTRUCTIONS = `
Você é a IA do Chat Livre AI.
Converse naturalmente com o usuário.
Seja útil, direto, claro e amigável.
Responda em português quando o usuário falar português.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY não está configurada no Vercel."
    });
  }

  try {
    const body = req.body;

    if (!body || !Array.isArray(body.messages)) {
      return res.status(400).json({
        error: "Formato de mensagem inválido."
      });
    }

    const messages = body.messages.slice(-40);

    const contents = messages
      .filter(message =>
        message &&
        typeof message.content === "string" &&
        message.content.trim()
      )
      .map(message => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [
          {
            text: message.content.trim().slice(0, 6000)
          }
        ]
      }));

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

    // DIAGNÓSTICO
    if (!response.ok) {
      console.error("GEMINI STATUS:", response.status);
      console.error("GEMINI RESPONSE:", JSON.stringify(data));

      return res.status(response.status).json({
        error:
          `Gemini erro ${response.status}: ` +
          (data?.error?.message || JSON.stringify(data))
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      console.error("RESPOSTA GEMINI:", JSON.stringify(data));

      return res.status(500).json({
        error: "A Gemini não retornou texto. Resposta: " +
          JSON.stringify(data)
      });
    }

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("ERRO INTERNO:", error);

    return res.status(500).json({
      error: "Erro interno: " + error.message
    });
  }
}
