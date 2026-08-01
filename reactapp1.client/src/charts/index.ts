// Generated BIC charts, committed as SOURCE.
//
// This is the whole architectural point of the demo: a BIC chart is generated code you
// OWN, not a service you call. These files came out of `generate_chart` (MCP) at design
// time and now live in the repo like any other module — the running app makes no network
// call, needs no API key, costs nothing per render, and works offline.
//
// Provenance (2026-07-25):
//   na-bubbles  — "North America (Bubbles)", deterministic lane
//   city-table  — "Tabular with embedded",   LLM-composed
// Both from the same 42-row city-metrics CSV. To refresh either one, re-run
// generate_chart with the same out_dir and commit the diff.
//
// ?raw imports keep the code as a STRING: createChartHost compiles it the same way the
// Power BI visual and the server's exec gate do, so the runtime path is identical.
import naBubblesCode from "./na-bubbles/chart.js?raw";
import cityTableCode from "./city-table/chart.js?raw";
import naBubblesGeo from "./na-bubbles/data.geo.json";

export { naBubblesCode, cityTableCode, naBubblesGeo };
