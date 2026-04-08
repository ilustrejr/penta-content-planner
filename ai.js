// Integração com Claude API — gera o conteúdo direto a partir do briefing
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

export const aiEnabled = !!process.env.ANTHROPIC_API_KEY;

let client = null;
function getClient() {
  if (!client) client = new Anthropic(); // lê ANTHROPIC_API_KEY do env
  return client;
}

export async function gerarConteudoComIA(briefing) {
  if (!aiEnabled) {
    throw new Error(
      "ANTHROPIC_API_KEY não está configurada. Adicione ela no arquivo .env e reinicie o servidor."
    );
  }

  const anthropic = getClient();

  // Streaming + adaptive thinking + finalMessage()
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: briefing }],
  });

  const finalMessage = await stream.finalMessage();

  // Extrai blocos de texto (ignora thinking)
  const textParts = finalMessage.content
    .filter((b) => b.type === "text")
    .map((b) => b.text);

  return {
    text: textParts.join("\n\n"),
    usage: {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
      cache_read_input_tokens: finalMessage.usage.cache_read_input_tokens || 0,
      cache_creation_input_tokens:
        finalMessage.usage.cache_creation_input_tokens || 0,
    },
    model: MODEL,
    stop_reason: finalMessage.stop_reason,
  };
}
