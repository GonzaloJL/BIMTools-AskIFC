# BIM Tools: AskIFC Browser

*Part of **My BIM Tools** — [gonzalojl.com](https://gonzalojl.com)*

Drop an IFC file into your browser, see it in 3D, and ask an AI about it in
plain English.

How many spaces are on each floor. What is the gross floor area on level 2.
Which elements came through with no type assigned. What is inconsistent in this
model. Questions that normally mean opening a viewer, digging through property
panels, filtering and counting into a spreadsheet.

**The IFC never leaves your machine.** The page reads it locally and extracts a
semantic summary — storeys, spaces, elements, types, coverage — and it is that
summary, a few kilobytes of text, that gets sent. The file itself is never
uploaded anywhere.

---

## Running it

```bash
cd app
npm install
npm run dev
```

Then open `http://localhost:5173` and drop an IFC in, or click the card to pick
one.

The web app lives in `app/`. Everything else sits at the repository root.

It is a static page: HTML and JavaScript, no server, nothing to install for the
people you share it with. `npm run build` produces a folder you can host
anywhere.

## The API key

You bring your own [Anthropic API key](https://console.anthropic.com/). Paste it
into the panel the first time; it is kept in your browser's `localStorage` and
sent only to Anthropic's API. There is no backend of ours in the middle — which
also means anyone who opens the developer tools on your machine can read it, so
use a key scoped to this and nothing else.

Each question costs well under a cent. The model summary is cached between
questions, so follow-ups cost roughly a tenth of the first one.

---

## What it can and cannot tell you

It answers **from the summary only**. It is told never to estimate a figure, to
say plainly when something is not in the model, and to name which measurement an
area came from — an IFC space typically carries several different areas, and
which one you use changes the answer.

It also keeps two things apart that are easy to confuse: **a gap in the data is
not a fault in the building.** A wall with no quantities means the exporter did
not write them, not that the wall is wrong.

This is a conversation with a model, not an audit. It does not score your file,
grade it, or check it against any standard.

---

## Built on OpenBIM software

The 3D viewing and the IFC parsing are not mine. They come from
**[That Open Company](https://thatopen.com/)**, whose components do the heavy
lifting here:

- [`@thatopen/components`](https://github.com/ThatOpen/engine_components) — the
  viewer and the IFC loader
- [`web-ifc`](https://github.com/ThatOpen/engine_web-ifc) — the IFC parser, in
  WebAssembly
- [`three.js`](https://threejs.org/) — the 3D engine underneath

Their work is free and open source, and this tool would not exist without it.

The worker and the WebAssembly binary are served from `public/` rather than a
CDN, so the page keeps working offline and does not depend on anyone's uptime.
If you update `@thatopen/components` or `web-ifc`, copy them across again —
loading fails if the worker and the library are different versions.

`app/public/worker.mjs`, `web-ifc.wasm` and `web-ifc-mt.wasm` are redistributed
builds of [`web-ifc`](https://github.com/ThatOpen/engine_web-ifc), which is
licensed under **MPL-2.0**. They are shipped unmodified; their source lives in
that repository. The MIT licence below covers this project's own code only.

## Selecting elements

Click any element in the 3D view and its property tree opens on the left:
identity, every property set and quantity set the exporter wrote, and the
material layers. `Esc` or the close button dismisses it.

## License

MIT — see [`LICENSE`](LICENSE). Use it, change it, ship it, keep the copyright
notice. The OpenBIM libraries it is built on carry their own licences.

---

Built by [Gonzalo JL](https://gonzalojl.com).
