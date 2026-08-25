const NO_ES_ELEMENTO = new RegExp(
  "^IFC(PROJECT|SITE|BUILDING|BUILDINGSTOREY|SPACE)$" +
    "|^IFC(MATERIAL|PROPERTY|QUANTITY|ELEMENTQUANTITY|PRESENTATION" +
    "|OWNERHISTORY|PERSON|ORGANIZATION|APPLICATION" +
    "|SIUNIT|UNITASSIGNMENT|DERIVEDUNIT|MONETARYUNIT|CONVERSIONBASEDUNIT" +
    "|CONTEXTDEPENDENTUNIT|MEASUREWITHUNIT" +
    "|ANNOTATION|VIRTUALELEMENT|OPENING|GRID)",
);
const ES_TIPO = /TYPE$/;

const CATEGORIAS_HABITUALES = [
  "IFCWALL", "IFCSLAB", "IFCBEAM", "IFCCOLUMN", "IFCDOOR", "IFCWINDOW",
  "IFCSTAIR", "IFCRAMP", "IFCRAILING", "IFCROOF", "IFCCOVERING",
  "IFCCURTAINWALL", "IFCFOOTING", "IFCPILE", "IFCFURNISHINGELEMENT",
  "IFCBUILDINGELEMENTPROXY", "IFCFLOWSEGMENT", "IFCFLOWTERMINAL",
];

const valor = (attr) => (attr && attr.value !== undefined ? attr.value : null);

const PRIORIDAD_AREA = [
  (n) => n === "GrossFloorArea",
  (n) => n === "NetFloorArea",
  (n) => /FloorArea/i.test(n),
];

function areaDeSuelo(elementQuantities) {
  const areas = [];
  for (const eq of elementQuantities) {
    for (const q of Array.isArray(eq.Quantities) ? eq.Quantities : []) {
      const v = q.AreaValue && q.AreaValue.value;
      const n = (q.Name && q.Name.value) || "";
      if (typeof v === "number") areas.push({ nombre: n, valor: v });
    }
  }
  if (!areas.length) return { area: 0, criterio: null };

  for (const coincide of PRIORIDAD_AREA) {
    const elegida = areas.find((a) => coincide(a.nombre));
    if (elegida) return { area: elegida.valor, criterio: elegida.nombre };
  }
  if (areas.length === 1) return { area: areas[0].valor, criterio: areas[0].nombre };
  return { area: 0, criterio: null };
}
const lista = (item, clave) => (Array.isArray(item[clave]) ? item[clave] : []);

const categoria = (item) => valor(item._category);

async function categoriasDeElemento(model) {
  const todas = await model.getCategories();
  return todas.filter((c) => !NO_ES_ELEMENTO.test(c) && !ES_TIPO.test(c));
}

async function datosPorBloques(model, ids, config, tam = 500) {
  const salida = [];
  for (let i = 0; i < ids.length; i += tam) {
    const bloque = await model.getItemsData(ids.slice(i, i + tam), config);
    salida.push(...bloque);
  }
  return salida;
}

function nombreDe(item) {
  const n = valor(item.Name);
  if (n) return n;
  const largo = valor(item.LongName);
  if (largo) return largo;
  return null;
}

export async function extraer(model, archivo) {
  const config = {
    attributesDefault: true,
    relations: {
      IsDefinedBy: { attributes: true, relations: false },
      HasAssociations: { attributes: true, relations: false },
      ContainedInStructure: { attributes: true, relations: false },
      Decomposes: { attributes: true, relations: false },
    },
    relationsDefault: { attributes: false, relations: false },
  };

  const plantasPorId = new Map();
  const gruposPlanta = await model.getItemsOfCategories([/^IFCBUILDINGSTOREY$/]);
  const idsPlanta = Object.values(gruposPlanta).flat();
  for (const p of await datosPorBloques(model, idsPlanta, config)) {
    plantasPorId.set(valor(p._localId), {
      nombre: nombreDe(p) ?? "(unnamed)",
      elevacion: valor(p.Elevation),
      espacios: 0,
      areaM2: 0,
      elementos: 0,
    });
  }

  const gruposEspacio = await model.getItemsOfCategories([/^IFCSPACE$/]);
  const idsEspacio = Object.values(gruposEspacio).flat();
  const espacios = await datosPorBloques(model, idsEspacio, {
    attributesDefault: true,
    relations: {
      IsDefinedBy: { attributes: true, relations: true },
      Decomposes: { attributes: true, relations: false },
    },
    relationsDefault: { attributes: false, relations: false },
  });

  let areaTotal = 0;
  const criteriosDeArea = new Set();
  let espaciosSinNombre = 0;
  let espaciosSinArea = 0;
  const espaciosSinPlanta = [];
  const plantaDelEspacio = new Map();
  const fichaEspacios = [];

  for (const e of espacios) {
    const nombre = valor(e.LongName) || valor(e.Name);
    if (!nombre) espaciosSinNombre += 1;

    const cantidades = lista(e, "IsDefinedBy").filter(
      (d) => categoria(d) === "IFCELEMENTQUANTITY",
    );
    const { area, criterio } = areaDeSuelo(cantidades);
    if (!area) espaciosSinArea += 1;
    if (criterio) criteriosDeArea.add(criterio);
    areaTotal += area;

    const padre = lista(e, "Decomposes")[0];
    const planta = padre && plantasPorId.get(valor(padre._localId));
    if (planta) {
      planta.espacios += 1;
      planta.areaM2 += area;
      plantaDelEspacio.set(valor(e._localId), valor(padre._localId));
    } else {
      espaciosSinPlanta.push(nombre ?? `#${valor(e._localId)}`);
    }

    fichaEspacios.push({
      nombre: nombre ?? `#${valor(e._localId)}`,
      areaM2: area,
      planta: planta ? planta.nombre : "(none)",
    });
  }

  const conArea = fichaEspacios
    .filter((s) => s.areaM2 > 0)
    .sort((a, b) => a.areaM2 - b.areaM2);
  const mediana = conArea.length
    ? conArea[Math.floor(conArea.length / 2)].areaM2
    : 0;

  const porNombre = new Map();
  for (const e of fichaEspacios) {
    const acc = porNombre.get(e.nombre) ?? { nombre: e.nombre, veces: 0, areaM2: 0 };
    acc.veces += 1;
    acc.areaM2 += e.areaM2;
    porNombre.set(e.nombre, acc);
  }
  const nombresPorArea = [...porNombre.values()].sort(
    (a, b) => b.areaM2 - a.areaM2,
  );

  const categorias = await categoriasDeElemento(model);
  const porCategoria = {};
  const registros = [];
  const tiposSinNombre = new Set();

  for (const cat of categorias) {
    const grupos = await model.getItemsOfCategories([
      new RegExp(`^${cat}$`),
    ]);
    const ids = Object.values(grupos).flat();
    if (!ids.length) continue;

    const datos = await datosPorBloques(model, ids, config);
    const resumen = {
      total: 0,
      conNombre: 0,
      conTipo: 0,
      conCantidades: 0,
      conMaterial: 0,
      ejemplos: new Set(),
    };

    for (const item of datos) {
      const definiciones = lista(item, "IsDefinedBy");
      const asociaciones = lista(item, "HasAssociations");

      const tipo = definiciones.find((d) => ES_TIPO.test(categoria(d) ?? ""));
      const cantidades = definiciones.some(
        (d) => categoria(d) === "IFCELEMENTQUANTITY",
      );
      const material = asociaciones.some((a) =>
        /^IFCMATERIAL/.test(categoria(a) ?? ""),
      );

      const contenedor = lista(item, "ContainedInStructure")[0];
      const agregador = lista(item, "Decomposes")[0];

      const registro = {
        id: valor(item._localId),
        categoria: cat,
        nombre: nombreDe(item),
        tieneTipo: Boolean(tipo),
        tipo: tipo ? nombreDe(tipo) : null,
        cantidades,
        material,
        plantaId: contenedor ? valor(contenedor._localId) : null,
        padreId: agregador ? valor(agregador._localId) : null,
      };
      registros.push(registro);

      resumen.total += 1;
      if (registro.tieneTipo && !registro.tipo) tiposSinNombre.add(valor(tipo._localId));
      if (registro.nombre && resumen.ejemplos.size < 2) {
        resumen.ejemplos.add(registro.nombre);
      }
      if (registro.nombre) resumen.conNombre += 1;
      if (registro.tieneTipo) resumen.conTipo += 1;
      if (cantidades) resumen.conCantidades += 1;
      if (material) resumen.conMaterial += 1;
    }

    porCategoria[cat] = { ...resumen, ejemplos: [...resumen.ejemplos] };
  }

  for (const r of registros) {
    if (plantaDelEspacio.has(r.plantaId)) {
      r.plantaId = plantaDelEspacio.get(r.plantaId);
    }
  }

  const plantaDe = new Map(registros.map((r) => [r.id, r.plantaId]));
  for (const r of registros) {
    if (r.plantaId === null && r.padreId !== null) {
      r.plantaId = plantaDe.get(r.padreId) ?? null;
    }
  }

  for (const r of registros) {
    const planta = plantasPorId.get(r.plantaId);
    if (planta) planta.elementos += 1;
    else r.plantaId = null;
  }

  const nombrePlanta = (r) =>
    plantasPorId.get(r.plantaId)?.nombre ?? "(none)";
  const muestra = (filtro, n = 8) => {
    const colas = new Map();
    for (const r of registros) {
      if (!filtro(r)) continue;
      if (!colas.has(r.categoria)) colas.set(r.categoria, []);
      colas.get(r.categoria).push(r);
    }

    const salida = [];
    const grupos = [...colas.values()];
    for (let i = 0; salida.length < n && grupos.some((g) => g[i]); i += 1) {
      for (const g of grupos) {
        if (salida.length >= n) break;
        if (g[i]) salida.push(g[i]);
      }
    }

    return salida.map((r) => ({
      que: r.nombre ?? `${r.categoria} #${r.id}`,
      categoria: r.categoria,
      planta: nombrePlanta(r),
    }));
  };

  const tiposDistintos = new Set(
    registros.map((r) => r.tipo).filter(Boolean),
  );

  return {
    archivo,
    plantas: [...plantasPorId.values()].sort(
      (a, b) => (a.elevacion ?? 0) - (b.elevacion ?? 0),
    ),
    espacios: {
      total: espacios.length,
      sinNombre: espaciosSinNombre,
      sinArea: espaciosSinArea,
      sinPlanta: espaciosSinPlanta.length,
      areaTotalM2: Math.round(areaTotal),
      areaMinM2: conArea.length ? conArea[0].areaM2 : 0,
      areaMedianaM2: mediana,
      areaMaxM2: conArea.length ? conArea[conArea.length - 1].areaM2 : 0,
      nombresDistintos: porNombre.size,
      porNombre: nombresPorArea.slice(0, 20),
      mayores: conArea.slice(-5).reverse(),
      menores: conArea.length > 10 ? conArea.slice(0, 5) : [],
      areaMedidaComo: [...criteriosDeArea],
    },
    elementos: {
      total: registros.length,
      tiposDistintos: tiposDistintos.size,
      tiposSinNombre: tiposSinNombre.size,
      porCategoria,
      categoriasAusentes: CATEGORIAS_HABITUALES.filter(
        (c) => !Object.keys(porCategoria).some((p) => p.startsWith(c)),
      ),
    },
    cobertura: {
      conNombre: registros.filter((r) => r.nombre).length,
      conTipo: registros.filter((r) => r.tieneTipo).length,
      conCantidades: registros.filter((r) => r.cantidades).length,
      conMaterial: registros.filter((r) => r.material).length,
      conPlanta: registros.filter((r) => r.plantaId !== null).length,
    },
    muestras: {
      sinTipo: muestra((r) => !r.tieneTipo),
      sinNombre: muestra((r) => !r.nombre),
      sinCantidades: muestra((r) => !r.cantidades),
      sinPlanta: muestra((r) => r.plantaId === null),
      espaciosSinPlanta: espaciosSinPlanta.slice(0, 8),
    },
  };
}
