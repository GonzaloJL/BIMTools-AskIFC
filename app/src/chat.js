import Anthropic from "@anthropic-ai/sdk";
import { construirSystem } from "./prompt.js";

const MODELO = "claude-opus-5";
const CLAVE_GUARDADA = "askifc-api-key";
const SIN_CLAVE = "Missing API key";

export const leerClave = () => localStorage.getItem(CLAVE_GUARDADA) ?? "";
export const guardarClave = (clave) =>
  localStorage.setItem(CLAVE_GUARDADA, clave.trim());
export const olvidarClave = () => localStorage.removeItem(CLAVE_GUARDADA);

function cliente() {
  const apiKey = leerClave();
  if (!apiKey) throw new Error(SIN_CLAVE);
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

export async function preguntar(resumen, historia, alRecibirTexto) {
  const stream = cliente().messages.stream({
    model: MODELO,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: construirSystem(resumen),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: historia,
  });

  stream.on("text", alRecibirTexto);

  const mensaje = await stream.finalMessage();

  if (mensaje.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }

  const texto = mensaje.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { texto, uso: mensaje.usage };
}

export function explicarError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "That API key is not valid. Check it and save it again.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "That key is not allowed to use this model.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Too many requests in a row. Wait a few seconds.";
  }
  if (error instanceof Anthropic.APIError) {
    if (/credit|balance/i.test(error.message)) {
      return "This account has no credit left. Add credit in the Anthropic console.";
    }
    return `API error (${error.status}): ${error.message}`;
  }
  return error.message ?? String(error);
}
