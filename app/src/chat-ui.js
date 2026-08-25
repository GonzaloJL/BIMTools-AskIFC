import {
  preguntar,
  explicarError,
  leerClave,
  guardarClave,
} from "./chat.js";

const $ = (id) => document.getElementById(id);

function comoTexto(texto) {
  const nodo = document.createElement("div");
  nodo.className = "msg";
  nodo.textContent = texto;
  return nodo;
}

export function montarChat() {
  const formClave = $("key-form");
  const inputClave = $("key-input");
  const vacio = $("chat-empty");
  const vacioTexto = $("chat-empty-text");
  const log = $("chat-log");
  const formChat = $("chat-form");
  const input = $("chat-input");
  const enviar = $("chat-send");

  let resumen = null;
  const historia = [];
  let ocupado = false;
  let clavePedida = false;

  const hayClave = () => Boolean(leerClave());

  formClave.addEventListener("submit", (e) => {
    e.preventDefault();
    const clave = inputClave.value.trim();
    if (!clave) return;
    guardarClave(clave);
    inputClave.value = "";
    clavePedida = false;
    refrescar();
  });

  function pedirClave() {
    clavePedida = true;
    log.append(vacio);
    refrescar();
    inputClave.focus();
  }

  function refrescar() {
    const listo = Boolean(resumen) && hayClave() && !clavePedida && !ocupado;
    input.disabled = !listo;
    enviar.disabled = !listo;

    formClave.hidden = hayClave() && !clavePedida;

    if (!resumen) {
      vacioTexto.textContent = "Drop an IFC file to start.";
    } else if (!hayClave() || clavePedida) {
      vacioTexto.textContent = "Ask anything about this model.";
    } else {
      vacioTexto.textContent =
        "Ask anything about this model.\n" +
        "How many spaces are there on each floor?\n" +
        "What is inconsistent in this model?";
    }

    vacio.hidden = historia.length > 0 && formClave.hidden;
  }

  refrescar();

  async function enviarPregunta(pregunta) {
    historia.push({ role: "user", content: pregunta });

    const suyo = comoTexto(pregunta);
    suyo.classList.add("user");
    log.append(suyo);

    const respuesta = comoTexto("");
    respuesta.classList.add("pending");
    log.append(respuesta);
    log.scrollTop = log.scrollHeight;

    ocupado = true;
    refrescar();

    try {
      const { texto, uso } = await preguntar(resumen, historia, (trozo) => {
        respuesta.textContent += trozo;
        log.scrollTop = log.scrollHeight;
      });

      historia.push({ role: "assistant", content: texto });
      respuesta.classList.remove("pending");

      const escritos = uso.cache_creation_input_tokens ?? 0;
      const leidos = uso.cache_read_input_tokens ?? 0;
      const partes = [`${uso.input_tokens} in`, `${uso.output_tokens} out`];
      if (escritos) partes.push(`${escritos} cached`);
      if (leidos) partes.push(`${leidos} from cache`);

      const nota = document.createElement("p");
      nota.className = "usage";
      nota.textContent = partes.join(" · ");
      log.append(nota);
    } catch (error) {
      console.error(error);
      respuesta.classList.remove("pending");
      respuesta.classList.add("error");
      respuesta.textContent = explicarError(error);
      historia.pop();
      if (/API key/i.test(respuesta.textContent)) pedirClave();
    } finally {
      ocupado = false;
      refrescar();
      log.scrollTop = log.scrollHeight;
    }
  }

  formChat.addEventListener("submit", (e) => {
    e.preventDefault();
    const pregunta = input.value.trim();
    if (!pregunta || ocupado) return;
    input.value = "";
    enviarPregunta(pregunta);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formChat.requestSubmit();
    }
  });

  return {
    usarModelo(nuevo) {
      resumen = nuevo;
      historia.length = 0;
      log.querySelectorAll(".msg, .usage").forEach((n) => n.remove());
      refrescar();
    },
  };
}
