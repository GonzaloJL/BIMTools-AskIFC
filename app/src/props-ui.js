const $ = (id) => document.getElementById(id);

const CONFIG = {
  attributesDefault: true,
  relations: {
    IsDefinedBy: { attributes: true, relations: true },
    HasAssociations: { attributes: true, relations: true },
    ContainedInStructure: { attributes: true, relations: false },
  },
  relationsDefault: { attributes: false, relations: false },
};

const valor = (a) => (a && a.value !== undefined ? a.value : null);
const lista = (o, k) => (Array.isArray(o?.[k]) ? o[k] : []);
const categoria = (o) => valor(o?._category);

function valorDe(prop) {
  const directo = valor(prop.NominalValue);
  if (directo !== null) return directo;
  for (const [k, v] of Object.entries(prop)) {
    if (k.endsWith("Value") && v && v.value !== undefined) return v.value;
  }
  return null;
}

function comoTexto(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function fila(clave, valorTexto) {
  const dt = document.createElement("dt");
  dt.textContent = clave;
  const dd = document.createElement("dd");
  dd.textContent = valorTexto;
  return [dt, dd];
}

function grupo(titulo, filas) {
  if (!filas.length) return null;
  const seccion = document.createElement("section");
  seccion.className = "props-group";

  const h = document.createElement("h3");
  h.textContent = titulo;
  seccion.append(h);

  const dl = document.createElement("dl");
  for (const [k, v] of filas) dl.append(...fila(k, v));
  seccion.append(dl);
  return seccion;
}

export function montarPropiedades({ alCerrar }) {
  const panel = $("props");
  const nombre = $("props-name");
  const cat = $("props-cat");
  const cuerpo = $("props-body");

  function ocultar() {
    panel.hidden = true;
    cuerpo.replaceChildren();
  }

  const cerrar = () => {
    ocultar();
    alCerrar();
  };

  $("props-close").addEventListener("click", cerrar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) cerrar();
  });

  return {
    ocultar,

    async mostrar(model, id) {
      const [item] = await model.getItemsData([id], CONFIG);
      if (!item) return;

      const definiciones = lista(item, "IsDefinedBy");
      const tipo = definiciones.find((d) => /TYPE$/.test(categoria(d) ?? ""));

      nombre.textContent =
        valor(item.Name) ?? valor(item.LongName) ?? `#${id}`;
      cat.textContent = categoria(item) ?? "";

      const secciones = [];

      const planta = lista(item, "ContainedInStructure")[0];
      secciones.push(
        grupo("Identity", [
          ["Type", tipo ? (valor(tipo.Name) ?? categoria(tipo)) : "—"],
          ["Storey", planta ? comoTexto(valor(planta.Name)) : "—"],
          ["Description", comoTexto(valor(item.Description))],
          ["Tag", comoTexto(valor(item.Tag))],
          ["GlobalId", comoTexto(valor(item.GlobalId))],
        ]),
      );

      for (const d of definiciones) {
        const c = categoria(d) ?? "";
        const props = [...lista(d, "HasProperties"), ...lista(d, "Quantities")];
        if (!props.length) continue;
        secciones.push(
          grupo(
            valor(d.Name) ?? c,
            props.map((p) => [
              valor(p.Name) ?? "—",
              comoTexto(valorDe(p)),
            ]),
          ),
        );
      }

      const materiales = lista(item, "HasAssociations")
        .filter((a) => /^IFCMATERIAL/.test(categoria(a) ?? ""))
        .flatMap((a) => {
          const propio = valor(a.Name);
          if (propio) return [propio];
          return lista(a, "ForLayerSet")
            .concat(lista(a, "MaterialLayers"))
            .map((l) => valor(l.Name) ?? valor(l.Material?.Name))
            .filter(Boolean);
        });

      if (materiales.length) {
        secciones.push(
          grupo(
            "Material",
            materiales.map((m, i) => [`Layer ${i + 1}`, m]),
          ),
        );
      }

      cuerpo.replaceChildren(...secciones.filter(Boolean));
      cuerpo.scrollTop = 0;
      panel.hidden = false;
    },
  };
}
