const num = (n) => String(Math.round(n));

const cota = (n) => (typeof n === "number" ? String(Math.round(n * 100) / 100) : "?");

function tabla(filas) {
  if (!filas.length) return "  (none)";
  const ancho = Math.max(...filas.map(([a]) => a.length));
  return filas
    .map(([a, b]) => `  ${a.padEnd(ancho)}  ${b}`)
    .join("\n");
}

function cobertura(total, con) {
  const sin = total - con;
  if (!total) return "0";
  const pct = Math.round((con / total) * 100);
  return `${num(con)} of ${num(total)} (${pct}%) — missing: ${num(sin)}`;
}

export function resumenATexto(r) {
  const partes = [];

  partes.push(`MODEL: ${r.archivo}`);

  partes.push(
    "\nSTOREYS\n" +
      tabla(
        r.plantas.map((p) => [
          p.nombre,
          `elevation ${cota(p.elevacion)} · ${num(p.espacios)} spaces · ` +
            `${num(p.areaM2)} m² · ${num(p.elementos)} elements`,
        ]),
      ),
  );

  const e = r.espacios;
  if (!e.total) {
    partes.push("\nSPACES\n  none — this model contains no spaces at all");
  } else {
  partes.push(
    "\nSPACES\n" +
      tabla([
        ["total", num(e.total)],
        ["total area", `${num(e.areaTotalM2)} m²`],
        [
          "area measured as",
          e.areaMedidaComo.length ? e.areaMedidaComo.join(", ") : "(no area)",
        ],
        ["smallest / median / largest", `${cota(e.areaMinM2)} / ${cota(e.areaMedianaM2)} / ${cota(e.areaMaxM2)} m²`],
        ["without name", num(e.sinNombre)],
        ["without area", num(e.sinArea)],
        ["without storey", num(e.sinPlanta)],
      ]),
  );

  const extremos = (titulo, items) =>
    items.length
      ? `\n${titulo} (individual spaces, out of ${num(e.total)})\n` +
        tabla(items.map((s) => [s.nombre, `${cota(s.areaM2)} m² · ${s.planta}`]))
      : null;

  partes.push(
    ...[
      extremos("5 LARGEST SPACES", e.mayores),
      extremos("5 SMALLEST SPACES", e.menores),
    ].filter(Boolean),
  );
  }

  if (e.porNombre.length) {
    partes.push(
      `\nSPACE NAMES (top 20 by total area, of ${num(e.nombresDistintos)} distinct names; these counts are exact)\n` +
        tabla(
          e.porNombre.map((n) => [
            n.nombre,
            `${num(n.veces)} space(s) · ${cota(n.areaM2)} m² total`,
          ]),
        ),
    );
  }

  const porCategoria = Object.entries(r.elementos.porCategoria).sort(
    (a, b) => b[1].total - a[1].total,
  );

  partes.push(
    `\nELEMENTS: ${num(r.elementos.total)} total, ` +
      `${num(r.elementos.tiposDistintos)} distinct types\n` +
      tabla(
        porCategoria.map(([cat, c]) => [
          cat,
          `${num(c.total)} · with type ${num(c.conTipo)} · ` +
            `with quantities ${num(c.conCantidades)} · with material ${num(c.conMaterial)}`,
        ]),
      ),
  );

  const conEjemplos = porCategoria.filter(([, c]) => c.ejemplos?.length);
  if (conEjemplos.length) {
    partes.push(
      `\nELEMENT NAMES (up to two examples per category, not the full list)\n` +
        tabla(conEjemplos.map(([cat, c]) => [cat, c.ejemplos.join("  |  ")])),
    );
  }

  const ausentes = r.elementos.categoriasAusentes;
  if (ausentes.length) {
    partes.push(
      "\nCOMMON CATEGORIES WITH ZERO ELEMENTS HERE\n  " +
        ausentes.join(", "),
    );
  }

  const c = r.cobertura;
  const t = r.elementos.total;
  partes.push(
    "\nDATA COVERAGE (out of all elements)\n" +
      tabla([
        ["with name", cobertura(t, c.conNombre)],
        ["with type assigned", cobertura(t, c.conTipo)],
        ...(r.elementos.tiposSinNombre
          ? [["type objects with no name", num(r.elementos.tiposSinNombre)]]
          : []),
        ["with quantities", cobertura(t, c.conCantidades)],
        ["with material", cobertura(t, c.conMaterial)],
        ["with storey assigned", cobertura(t, c.conPlanta)],
      ]),
  );

  const muestra = (titulo, items) => {
    if (!items.length) return null;
    return (
      `\n${titulo} (a few examples, not the full list)\n` +
      items.map((i) => `  ${i.que} · ${i.categoria} · ${i.planta}`).join("\n")
    );
  };

  if (r.muestras.espaciosSinPlanta.length) {
    partes.push(
      "\nEXAMPLES OF SPACES WITHOUT STOREY (a few, not the full list)\n  " +
        r.muestras.espaciosSinPlanta.join(", "),
    );
  }

  const muestras = [
    muestra("EXAMPLES WITHOUT TYPE", r.muestras.sinTipo),
    muestra("EXAMPLES WITHOUT QUANTITIES", r.muestras.sinCantidades),
    muestra("EXAMPLES WITHOUT NAME", r.muestras.sinNombre),
    muestra("EXAMPLES WITHOUT STOREY", r.muestras.sinPlanta),
  ].filter(Boolean);

  partes.push(...muestras);

  return partes.join("\n");
}

export const INSTRUCCIONES = `You answer questions about an IFC building model.

You do not have the IFC file. You have a summary extracted from it, below. That summary is everything you know about this model.

Rules:

- **Always answer in English**, whatever language the question is written in.
- Answer only from the summary. Never invent or estimate a figure.
- If the summary does not contain what is being asked, say so plainly and name the data that would be needed. "That is not in the model" is a far better answer than an approximate number.
- When you give an area, say which measurement it comes from — the summary states how area was measured.
- A gap in the data is not the same as a fault in the building: a wall with no quantities means the exporter did not write them, not that the wall is badly built. Keep the two apart.
- The counts in the summary are exact. The example lists are only a sample — never present them as the complete set.
- Never work out how many of something there are by counting entries in a sample list. If the summary does not state a count for it, say you cannot tell from the summary.
- When you name examples, use the names as they appear in the summary, so they can be looked up in the model.
- Be brief and direct. For an ordinary question, one or two sentences is the whole answer. Do not show your reasoning unless you are asked for it. Use a table when a table reads better.
- Do not suggest fixes, re-exports or next steps unless you are asked for them. You are being read by someone who will decide that themselves.

When asked what is wrong, inconsistent or worth looking at:

- Draw your own conclusions from the data. At most five findings, ranked, most significant first, then stop. End after the fifth: no appendix, no aside, nothing introduced by "also worth noting".
- Write each finding as a bold one-line headline stating it in plain words, with the figure it rests on, then at most ONE sentence on what it most likely means. Nothing else.
- **Hard limit: 40 words per finding, headline included.** If it does not fit, the finding is too broad — narrow it. The whole answer must be readable in under a minute.
- One idea per finding. Do not split a single observation across two entries, and do not bundle unrelated ones into one. Fewer than five is fine if there are not five worth making.
- Plain language first. Use an IFC class name only where there is no everyday equivalent for it.
- When two readings are possible, give both in one clause, not a paragraph. Say you are unsure in three words, not a sentence.
- Read across the whole summary, not just the coverage table: storey names and elevations, how spaces are distributed, the largest and smallest spaces, categories with zero elements.
- A category with no elements often means that discipline is in a separate file, not that the building lacks it. A storey may be a datum rather than an occupancy level — a foundation level or a roof.
- Do not score the model, do not grade it, and do not check it against any standard or checklist. You are pointing out what stands out in the data, not auditing it.`;

export function construirSystem(resumen) {
  return `${INSTRUCCIONES}\n\n---\n\n${resumenATexto(resumen)}`;
}
