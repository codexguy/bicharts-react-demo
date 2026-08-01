# Fresh React demo — exact steps

Current as of **2026-07-26**, against `@bicharts/chart-host@0.1.7` and
`@bicharts/chart-mcp@0.1.0` — both published, so every step below runs from npm with nothing
to clone or build.

The point of the exercise: *a BIC chart is generated source you own, not a service you call.*
Everything in steps 2–5 happens **once, at design time**. The running page makes no network
call, needs no API key, costs nothing per render, and works offline.

---

## 0. Prerequisites

| | |
| --- | --- |
| Node | ≥ 20 (24 is what CI uses) |
| An MCP-capable client | Claude Code, Claude Desktop, Cursor, … |
| A BIC **trial or paid** account | MCP access has no freemium tier — `generate_chart` will refuse |
| Credits | `generate_chart` bills credits per chart (current rates are shown in your account); `assess_data_shape` and `list_eligible_charts` are free |

---

## 1. Register the MCP server

```powershell
claude mcp add --scope user bic-chart -- npx -y @bicharts/chart-mcp
```

Nothing to build, nothing to clone. `--scope user` puts it in your user config so it is
available in every project.

> **If you are working on the server itself**, register a second entry pointing at your own
> build, so you are not silently running whatever `npx` last cached. The ready banner prints
> the build stamp, which is how you tell them apart.
>
> ```powershell
> claude mcp add --scope user bic-chart-dev -- node <path-to-your-build>/dist/index.mjs
> ```

**Credentials.** Prefer the file over env vars in a repo-committed `.mcp.json` — the file
keeps secrets out of anything you might commit or screen-share:

```jsonc
// ~/.bic/credentials.json
{
  "licenseKey": "…",
  "licensee":   "…",       // your account name
  "secretKey":  "…"        // optional
}
```

Override the path with `BIC_CREDENTIALS_FILE`, or the endpoint with `BIC_URL`. Env vars
(`BIC_LICENSE_KEY`, `BIC_LICENSEE`, `BIC_SECRET_KEY`) take precedence over the file if both
are set.

With credentials in `~/.bic/credentials.json` you do **not** need `-e` flags. Confirm:

```powershell
claude mcp list
```

You should see `bic-chart` with three tools: `assess_data_shape`, `list_eligible_charts`,
`generate_chart`.

---

## 2. Scaffold the React app

Nothing BIC-specific here — that is the point.

```bash
npm create vite@latest my-charts -- --template react-ts
cd my-charts
npm install
npm install @bicharts/chart-host d3
npm install -D @types/d3          # d3 ships no types
```

`@bicharts/chart-host` has **no runtime dependencies**. `d3` is a peer requirement of the
*chart*, not of the host. React is an optional peer.

**Delete the template's `:root { font: …/1.5 }` rule, or at least know it is there.** See
step 6 — this exact line sliced a chart label in half the first time we did this.

---

## 3. Prompts — design time

Point your agent at the project and paste these in order. Written so the *agent* does the
work; you are checking its output, not typing API calls.

### 3a. Discover and assess

> Use the `bic-chart` MCP server. Assess the data shape of `./data/my-data.csv`, then list
> the eligible chart types for a JavaScript project. Show me the top 6 with their scores and
> tell me which two would work best **together on one page** — one overview, one detail — for
> cross-filtering.

`list_eligible_charts` auto-detects the project language from the working directory
(`package.json`/`tsconfig.json` → JavaScript → D3/Vega). It is **authoritative** — server-side
eligibility policy, not a guess — and free.

### 3b. Generate

> Generate both charts with `generate_chart`, writing them to `src/charts/<name>/`. Use the
> chart types you recommended, and pass `preview_html: true` so I can eyeball each one before
> we wire anything up. Then show me the integration contract it returned.

Each call writes into `out_dir`:

```text
src/charts/<name>/
  chart.js            # the render(container, data, options) function — this is the deliverable
  data.sample.json    # columns + positional rows (+ meta.hostContract), so the chart runs standalone
  data.geo.json       # maps only
  preview.html        # D3 only, and ONLY with preview_html: true — see below
```

**`preview_html` defaults to `false`.** The code is meant to be merged into your app rather
than run as an `index.html`, so nothing writes a preview unless you ask. Ask — opening the
preview is the cheapest possible feedback loop.

**Open `preview.html` first.** If the chart is wrong, regenerate *before* wiring it into
React — iterating there costs one file, not a rebuild.

### 3c. Wire it up

> Wire both charts into `App.tsx` using `BicChartGroup` and `BicChart` from
> `@bicharts/chart-host/react`. Load the rows from `data.sample.json`, import the chart code
> with `?raw`, and measure width/height with `useLayoutEffect` — do not pass a container that
> has not been measured. Follow the integration contract exactly, including any d3 plugins it
> named.

The integration contract returned by `generate_chart` is self-describing: it names the exact
install line, the host page prerequisites, the `__rowIdx__` hazard, and any d3 plugins *this*
chart needs. If your agent ignores it, say so explicitly — that is the single highest-value
correction you can make.

### 3d. Verify

> Run `npm run build`, then serve `dist/` and click a mark in the first chart. Confirm the
> second chart filters, the clicked chart dims its unselected marks, and clicking the same
> mark again clears it.

---

## 4. The shape of the result

```tsx
import * as d3 from "d3";
import { BicChart, BicChartGroup } from "@bicharts/chart-host/react";
import code from "./charts/overview/chart.js?raw";
import payload from "./charts/overview/data.sample.json";

// data.sample.json rows are POSITIONAL arrays; the group wants row OBJECTS.
const columns = payload.columns;
const rows = payload.rows.map(r =>
  Object.fromEntries(columns.map((c, i) => [c.name, r[i]])));

<BicChartGroup columns={columns} rows={rows}>
  <BicChart id="overview" code={code}       d3={d3} options={{ width, height }} />
  <BicChart id="detail"   code={detailCode} d3={d3} options={{ width, height }} />
</BicChartGroup>
```

`BicChartGroup` owns the single source table and the payload-row → source-row mapping. That
mapping is the part a hand-rolled integration gets wrong silently.

---

## 5. Four things that will bite you

**Sizing has no defaults.** A chart draws once at whatever it is handed and does not
re-measure. A container measured at 0 draws a 0px chart *forever*. Measure synchronously with
`useLayoutEffect`; use `ResizeObserver` only for *later* resizes — gating first paint on one
costs seconds in a background or headless tab.

**The row-index hazard.** `__rowIdx__` is a position *within the payload a chart received*,
not an id in your table. Re-render a chart with filtered rows and its payload renumbers from
zero, so the same integer now means a different record. Comparing indices across two charts
does not throw — it quietly filters to the wrong thing. Let `BicChartGroup` do it.

**Your page's typography leaks into the chart.** Generated charts set `font-size` but almost
never `line-height`, so they inherit the page's. The stock Vite template ships
`:root { font: …/1.5 }`, which handed an 11px column label a 26px line box and sliced it
through the middle — on a chart that renders perfectly inside Power BI. `createChartHost`
neutralizes `line-height`/`letter-spacing` inside the container it owns, but if you build
another host, keep that firewall.

**d3 plugins attach onto the d3 object.** `d3.sankey()`, `d3.hexbin()` and the voronoi family
are separate packages. Install them and augment the *same* d3 you pass in:

```js
import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
Object.assign(d3, { sankey, sankeyLinkHorizontal });
```

The integration contract names exactly which ones your chart needs. Miss one and the host
throws a message naming the package rather than a bare `d3.sankey is not a function`.

---

## 6. Regenerating a chart

Call `generate_chart` again with the same `out_dir` — files are overwritten and the diff is
reviewable. Any option (`preview_html` among them) can be passed on the tool call directly.

**Regeneration re-rolls content, not just style.** Asking for a cosmetic fix can come back
with different columns chosen. Pin the chart type, and read the diff before committing.

---

## 7. Verifying the reference demo still works

The reference page was verified by serving the production build, driving it with headless
Chromium, and asserting real marks,
cross-filtering in **both** directions, the selection affordance, clear/toggle-off, absence of
clipped text, Ctrl-click multi-select, and a live restyle — **27 checks**. Last run
2026-07-26 against `@bicharts/chart-host@0.1.7`: all passed.

---

## Open items

| | |
| --- | --- |
| ~~MCP is not installable by a reader~~ | **CLOSED.** Published to npm as a dist-only, proprietary-licensed package; `npx -y @bicharts/chart-mcp` is the install. Publishing to npm is not open-sourcing — the source stays private. |
| ~~MCP still inlines chart-host/shape-core~~ | **CLOSED.** `external` + real dependencies; dist 2.62 MB → 838 KB. |
| **The committed demo map predates the GAP-15 fix** | `src/charts/na-bubbles/chart.js` still says *"raise Max Map Points (Format > Data)"* — Power BI's Format pane, which does not exist in a React page. The server-side fix is live in prod; the committed artifact just predates it. Regenerating that one chart clears it — but see the re-rolling warning in §6. |
