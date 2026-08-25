import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import { extraer } from "./extract.js";
import { montarChat } from "./chat-ui.js";
import { montarPropiedades } from "./props-ui.js";

const BLACK = "#100f0f";
const CREAM = "#fffcf0";

const viewport = document.getElementById("viewport");
const dropzone = document.getElementById("dropzone");
const status = document.getElementById("status");

const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);
const world = worlds.create();
world.scene = new OBC.SimpleScene(components);
world.renderer = new OBC.SimpleRenderer(components, viewport);
world.camera = new OBC.SimpleCamera(components);

components.init();

world.scene.setup();
world.camera.controls.setLookAt(20, 15, 20, 0, 0, 0);

world.renderer.showLogo = false;

const grids = components.get(OBC.Grids);
const grid = grids.create(world);

const TEMA_GUARDADO = "askifc-theme";

const AVATARES = {
  dark: { marca: "/avatar-negro.png", tarjeta: "/avatar-crema.png" },
  light: { marca: "/avatar-crema.png", tarjeta: "/avatar-negro.png" },
};

function aplicarTema(claro) {
  document.body.classList.toggle("light", claro);

  const fondo = claro ? CREAM : BLACK;
  const texto = claro ? BLACK : CREAM;

  world.scene.three.background = new THREE.Color(fondo);
  grid.config.color = new THREE.Color(texto).lerp(new THREE.Color(fondo), 0.62);

  const avatares = AVATARES[claro ? "light" : "dark"];
  document.querySelector("#brand img").src = avatares.marca;
  document.querySelector(".dropzone-logo").src = avatares.tarjeta;

  localStorage.setItem(TEMA_GUARDADO, claro ? "light" : "dark");
}

for (const id of ["brand", "theme-toggle"]) {
  document.getElementById(id).addEventListener("click", (e) => {
    e.stopPropagation();
    aplicarTema(!document.body.classList.contains("light"));
  });
}

aplicarTema(localStorage.getItem(TEMA_GUARDADO) === "light");

const fragments = components.get(OBC.FragmentsManager);
fragments.init("/worker.mjs");

world.camera.controls.addEventListener("rest", () => fragments.core.update(true));

fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { path: "/", absolute: false },
});

const chat = montarChat();

const panelHead = document.getElementById("panel-head");
panelHead.addEventListener("click", () => {
  const abierto = document.body.classList.toggle("panel-open");
  if (!abierto) return;
  const clave = document.getElementById("key-form");
  const destino = clave.hidden ? "chat-input" : "key-input";
  document.getElementById(destino).focus();
});

const highlighter = components.get(OBCF.Highlighter);
highlighter.setup({
  world,
  selectMaterialDefinition: {
    color: new THREE.Color(CREAM),
    opacity: 0.85,
    transparent: true,
    renderedFaces: 1,
  },
});

const propiedades = montarPropiedades({
  alCerrar: () => highlighter.clear("select"),
});

let modeloActual = null;

highlighter.events.select.onHighlight.add(async (mapa) => {
  const ids = Object.values(mapa)[0];
  const id = ids && [...ids][0];
  if (id === undefined || !modeloActual) return;
  try {
    await propiedades.mostrar(modeloActual, id);
  } catch (error) {
    console.error("Could not read the properties:", error);
  }
});

highlighter.events.select.onClear.add(() => propiedades.ocultar());

function setStatus(text) {
  status.hidden = false;
  status.textContent = text;
}

async function loadIfc(file) {
  dropzone.classList.add("hidden");
  setStatus(`Loading ${file.name}…`);

  const started = performance.now();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.replace(/\.ifc$/i, "");

  const model = await ifcLoader.load(bytes, true, name, {
    instanceCallback: (importer) => importer.addAllRelations(),
  });

  if (!model.box.isEmpty()) {
    await world.camera.controls.fitToBox(model.box, false, {
      paddingTop: 1,
      paddingBottom: 1,
      paddingLeft: 1,
      paddingRight: 1,
    });
    await world.camera.controls.rotateTo(Math.PI / 4, Math.PI / 3.2, false);
  }
  await fragments.core.update(true);

  setStatus(`Reading ${name}…`);
  const resumen = await extraer(model, file.name);

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  setStatus(
    `${resumen.elementos.total.toLocaleString()} elements · ` +
      `${resumen.espacios.total.toLocaleString()} spaces · ` +
      `${resumen.elementos.tiposDistintos.toLocaleString()} types` +
      `  ·  ${seconds}s`,
  );

  chat.usarModelo(resumen);
  modeloActual = model;
  document.body.classList.add("has-model");
}

const stop = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
  document.addEventListener(type, stop);
}

document.addEventListener("dragenter", () => dropzone.classList.add("dragover"));
document.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) dropzone.classList.remove("dragover");
});

async function abrirFichero(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".ifc")) {
    setStatus("That is not an IFC file");
    return;
  }
  try {
    await loadIfc(file);
  } catch (error) {
    console.error(error);
    setStatus(`Could not load ${file.name} — see the console`);
  }
}

document.addEventListener("drop", (e) => {
  dropzone.classList.remove("dragover");
  abrirFichero(e.dataTransfer?.files?.[0]);
});

const fileInput = document.getElementById("file-input");
const dropzoneCard = document.getElementById("dropzone-card");

dropzoneCard.addEventListener("click", () => fileInput.click());
dropzoneCard.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  abrirFichero(file);
});
