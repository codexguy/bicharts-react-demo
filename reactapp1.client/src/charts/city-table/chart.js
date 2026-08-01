function render(container, data, options) {
  container.replaceChildren();

  const cols = data.columns || [];
  const rows = data.rows || [];
  const W = options.width, H = options.height;
  const FG = options.themeFg || 'currentColor';
  const BG = options.themeBg || options.backgroundColor || '#ffffff';
  const locale = options.cultureCode || 'en-US';
  const PALETTE = (options.palette && options.palette.length) ? options.palette : d3.schemeTableau10;
  const POS_COLOR = (options.palette && options.palette[0]) || '#2b6cb0';
  const NEG_COLOR = '#c0392b';

  const idx = (name) => cols.findIndex(c => c && c.name === name);
  const cCity = idx('City'), cSeg = idx('Segment'), cPop = idx('Population'), cRev = idx('Revenue');

  const root = d3.select(container).append('div')
    .style('width', W + 'px').style('height', H + 'px')
    .style('background', BG).style('color', FG)
    .style('box-sizing', 'border-box').style('overflow', 'hidden')
    .style('position', 'relative').style('font-family', 'Segoe UI, Arial, sans-serif');

  function emptyState(msg) {
    root.append('div').style('display', 'flex').style('align-items', 'center')
      .style('justify-content', 'center').style('height', '100%')
      .style('color', FG).style('font-size', '13px').text(msg || 'No data for the current selection');
  }

  if (!rows.length || cCity < 0 || cSeg < 0 || cPop < 0 || cRev < 0) {
    emptyState(options.noDataText || 'No data for the current selection');
    return;
  }

  const items = [];
  rows.forEach((r, i) => {
    const city = r[cCity], seg = r[cSeg], pop = +r[cPop], rev = +r[cRev];
    if (city == null || seg == null || !isFinite(pop) || !isFinite(rev)) return;
    items.push({ i, city: String(city), seg: String(seg), pop, rev });
  });

  if (!items.length) { emptyState(options.noDataText || 'No data for the current selection'); return; }

  const popMean = d3.mean(items, d => d.pop);
  const popStd = items.length > 1 ? d3.deviation(items, d => d.pop) : 0;
  items.forEach(d => {
    d.rpc = d.pop > 0 ? d.rev / d.pop : 0;
    d.z = popStd && popStd > 0 ? (d.pop - popMean) / popStd : 0;
  });

  const segs = [...new Set(items.map(d => d.seg))];
  const segColor = d3.scaleOrdinal(segs, PALETTE);

  const maxRev = d3.max(items, d => d.rev) || 1;
  const maxPop = d3.max(items, d => d.pop) || 1;
  const maxRpc = d3.max(items, d => d.rpc) || 1;
  const maxAbsZ = Math.max(1e-6, d3.max(items, d => Math.abs(d.z)) || 1) * 1.15;

  function compact(n) {
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (a >= 1e9) return sign + trimZero((a / 1e9).toFixed(1)) + 'B';
    if (a >= 1e6) return sign + trimZero((a / 1e6).toFixed(1)) + 'M';
    if (a >= 1e3) return sign + trimZero((a / 1e3).toFixed(1)) + 'K';
    return sign + Math.round(a).toString();
  }
  function trimZero(s) { return s.replace(/\.0$/, ''); }
  function fmtMoney(n) { return '$' + compact(n); }
  function fmtPop(n) { return compact(n); }
  function fmtRpc(n) { return Math.abs(n) >= 1000 ? '$' + compact(n) : '$' + n.toFixed(2); }
  function fmtZ(n) { return (n >= 0 ? '+' : '') + n.toFixed(2); }
  function fmtExact(n) { return new Intl.NumberFormat(locale).format(Math.round(n)); }

  // ---- layout bands ----
  const padX = 12;
  const titleH = 22, capH = 16, headerH = 28;
  const bodyH = Math.max(60, H - titleH - capH - headerH - 14);

  root.append('div').style('height', titleH + 'px').style('padding', '4px 12px 0 12px')
    .style('font-size', '14px').style('font-weight', '600').style('color', FG)
    .text('City Revenue and Population Scorecard');

  root.append('div').style('height', capH + 'px').style('padding', '0 12px')
    .style('font-size', '10.5px').style('color', FG).style('opacity', 0.85)
    .style('white-space', 'nowrap').style('overflow', 'hidden').style('text-overflow', 'ellipsis')
    .text('One row per city, sorted by Revenue. Pop Z-score = deviation from cohort mean population; Revenue/Capita = Revenue divided by Population.');

  const availW = Math.max(300, W - padX * 2 - 14);
  const ratios = { city: 0.15, seg: 0.13, rev: 0.18, pop: 0.18, z: 0.18, rpc: 0.18 };
  const colW = {};
  Object.keys(ratios).forEach(k => colW[k] = Math.floor(availW * ratios[k]));
  const gridTemplate = `${colW.city}px ${colW.seg}px ${colW.rev}px ${colW.pop}px ${colW.z}px ${colW.rpc}px`;

  const headerDef = [
    { key: 'city', label: 'City', sortable: true },
    { key: 'seg', label: 'Segment', sortable: true },
    { key: 'rev', label: 'Revenue', sortable: true },
    { key: 'pop', label: 'Population', sortable: true },
    { key: 'z', label: 'Pop Z-score (vs cohort)', sortable: true },
    { key: 'rpc', label: 'Revenue / Capita ($)', sortable: true }
  ];

  const uiKeys = new Set(headerDef.map(h => h.key));
  let sortState = { key: 'rev', asc: false };
  const persisted = options.uiState && options.uiState.sort;
  if (persisted && uiKeys.has(persisted.key) && typeof persisted.asc === 'boolean') sortState = persisted;

  const headerWrap = root.append('div').style('padding', '0 ' + padX + 'px');
  const headerRow = headerWrap.append('div')
    .style('display', 'grid').style('grid-template-columns', gridTemplate)
    .style('height', headerH + 'px').style('align-items', 'center')
    .style('border-bottom', '1px solid ' + hexA(FG, 0.25))
    .style('font-size', '11px').style('font-weight', '600').style('color', FG);

  const headerCells = {};
  headerDef.forEach(function (h) {
    const cell = headerRow.append('div')
      .attr('class', 'd3-axis-filter')
      .attr('data-row-idx', items.map(d => d.i).join(','))
      .style('padding', '0 6px').style('overflow', 'hidden').style('white-space', 'nowrap')
      .style('text-overflow', 'ellipsis')
      .style('cursor', h.sortable ? 'pointer' : 'default')
      .text(h.label);
    headerCells[h.key] = cell;
    if (h.sortable) {
      cell.on('click', function (event) {
        event.stopPropagation();
        if (sortState.key === h.key) sortState = { key: h.key, asc: !sortState.asc };
        else sortState = { key: h.key, asc: h.key === 'city' || h.key === 'seg' };
        if (typeof options.setUiState === 'function') {
          options.setUiState(Object.assign({}, options.uiState, { sort: sortState }));
        }
        updateHeaderGlyphs();
        renderBody();
      });
    }
  });

  function updateHeaderGlyphs() {
    headerDef.forEach(function (h) {
      const base = h.label;
      const arrow = sortState.key === h.key ? (sortState.asc ? ' \u25B2' : ' \u25BC') : '';
      headerCells[h.key].text(base + arrow);
    });
  }
  updateHeaderGlyphs();

  const bodyOuter = root.append('div')
    .style('height', bodyH + 'px').style('overflow-y', 'auto').style('overflow-x', 'hidden')
    .style('scrollbar-gutter', 'stable').style('padding', '0 ' + padX + 'px');

  const rowH = items.length * 30 <= bodyH ? Math.min(56, Math.floor(bodyH / items.length)) : 30;

  let tipDiv = null;
  if (options.allowTooltips) {
    tipDiv = d3.select(container).append('div')
      .style('position', 'absolute').style('pointer-events', 'none')
      .style('background', hexA(BG, 0.95))
      .style('border', '1px solid ' + hexA(FG, 0.3)).style('border-radius', '4px')
      .style('padding', '6px 8px').style('font-size', '11px').style('color', FG)
      .style('box-shadow', '0 2px 6px rgba(0,0,0,0.2)').style('display', 'none').style('z-index', 10);
  }

  function hexA(hex, a) {
    try {
      const c = d3.color(hex);
      if (!c) return 'rgba(128,128,128,' + a + ')';
      const rgb = c.rgb();
      return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
    } catch (e) { return 'rgba(128,128,128,' + a + ')'; }
  }

  function luminanceOf(hex) {
    const c = d3.color(hex);
    if (!c) return 0.5;
    const rgb = c.rgb();
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
  }

  function drawBarSVG(cellDiv, value, maxVal, colW_, colorBase, formatFn) {
    const w = colW_ - 12, h = rowH - 6;
    const trackW = Math.max(20, w - 46);
    const scale = d3.scaleLinear().domain([0, maxVal || 1]).range([0, trackW]).clamp(true);
    const svg = d3.select(cellDiv).append('svg').attr('width', w).attr('height', h)
      .style('display', 'block').style('overflow', 'visible').style('pointer-events', 'none');
    const barY = h / 2 - 6;
    svg.append('rect').attr('x', 0).attr('y', barY).attr('width', trackW).attr('height', 12)
      .attr('rx', 3).attr('fill', 'rgba(128,128,128,0.14)');
    const light = d3.interpolateRgb('#ffffff', colorBase)(0.32);
    const t = Math.sqrt(Math.max(value, 0)) / Math.sqrt(maxVal || 1);
    const fill = d3.interpolateRgb(light, colorBase)(Math.max(0, Math.min(1, t)));
    const barW = Math.max(2, scale(value));
    svg.append('rect').attr('x', 0).attr('y', barY).attr('width', barW).attr('height', 12)
      .attr('rx', 3).attr('fill', fill);
    svg.append('text').attr('x', trackW + 6).attr('y', h / 2 + 4)
      .attr('font-size', 11).attr('fill', FG).text(formatFn(value));
  }

  function drawZScoreSVG(cellDiv, value) {
    const w = colW.z - 12, h = rowH - 6;
    const labelW = 40;
    const trackW = Math.max(30, w - labelW);
    const scale = d3.scaleLinear().domain([-maxAbsZ, maxAbsZ]).range([0, trackW]).clamp(true);
    const zero = scale(0);
    const svg = d3.select(cellDiv).append('svg').attr('width', w).attr('height', h)
      .style('display', 'block').style('overflow', 'visible').style('pointer-events', 'none');
    const cy = h / 2;
    svg.append('line').attr('x1', 0).attr('x2', trackW).attr('y1', cy).attr('y2', cy)
      .attr('stroke', hexA(FG, 0.18)).attr('stroke-width', 1);
    svg.append('line').attr('x1', zero).attr('x2', zero).attr('y1', cy - 8).attr('y2', cy + 8)
      .attr('stroke', hexA(FG, 0.55)).attr('stroke-width', 1.5).attr('stroke-dasharray', '2,2');
    const vx = scale(value);
    const color = value >= 0 ? POS_COLOR : NEG_COLOR;
    svg.append('line').attr('x1', zero).attr('x2', vx).attr('y1', cy).attr('y2', cy)
      .attr('stroke', color).attr('stroke-width', 2.5);
    svg.append('circle').attr('cx', vx).attr('cy', cy).attr('r', 4).attr('fill', color);
    svg.append('text').attr('x', trackW + 6).attr('y', cy + 4)
      .attr('font-size', 11).attr('fill', FG).text(fmtZ(value));
  }

  function drawSegBadge(cellDiv, seg) {
    const wrap = d3.select(cellDiv).append('div')
      .style('display', 'flex').style('align-items', 'center').style('gap', '6px')
      .style('height', (rowH - 6) + 'px').style('pointer-events', 'none');
    const color = segColor(seg);
    wrap.append('div').style('width', '10px').style('height', '10px')
      .style('border-radius', '3px').style('background', color).style('flex', '0 0 auto');
    const txtColor = FG;
    wrap.append('div').style('font-size', '11px').style('color', txtColor)
      .style('white-space', 'nowrap').style('overflow', 'hidden').style('text-overflow', 'ellipsis')
      .text(seg);
  }

  function renderBody() {
    bodyOuter.selectAll('*').remove();
    const sorted = items.slice().sort(function (a, b) {
      let av = a[sortState.key], bv = b[sortState.key];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return sortState.asc ? -1 : 1;
      if (av > bv) return sortState.asc ? 1 : -1;
      return 0;
    });

    sorted.forEach(function (d, ri) {
      const rowDiv = bodyOuter.append('div')
        .attr('class', 'd3-mark')
        .attr('data-row-idx', String(d.i))
        .style('display', 'grid').style('grid-template-columns', gridTemplate)
        .style('height', rowH + 'px').style('align-items', 'center')
        .style('cursor', 'pointer')
        .style('position', 'relative')
        .style('background', ri % 2 === 1 ? 'rgba(128,128,128,0.07)' : 'transparent');

      if (options.allowTooltips && tipDiv) {
        rowDiv.on('mousemove', function (event) {
          const rect = container.getBoundingClientRect();
          const x = event.clientX - rect.left, y = event.clientY - rect.top;
          tipDiv.style('display', 'block')
            .style('left', Math.min(W - 190, x + 12) + 'px')
            .style('top', Math.min(H - 90, y + 12) + 'px')
            .html(
              '<b>' + d.city + '</b><br/>' +
              'Segment: ' + d.seg + '<br/>' +
              'Revenue: $' + fmtExact(d.rev) + '<br/>' +
              'Population: ' + fmtExact(d.pop) + '<br/>' +
              'Pop z-score: ' + fmtZ(d.z) + '<br/>' +
              'Revenue/Capita: ' + fmtRpc(d.rpc)
            );
        }).on('mouseleave', function () { tipDiv.style('display', 'none'); });
      }

      const cityCell = rowDiv.append('div').style('padding', '0 6px')
        .style('font-size', '11.5px').style('color', FG)
        .style('white-space', 'nowrap').style('overflow', 'hidden').style('text-overflow', 'ellipsis')
        .style('pointer-events', 'none').text(d.city);

      const segCell = rowDiv.append('div').style('padding', '0 6px');
      drawSegBadge(segCell.node(), d.seg);

      const revCell = rowDiv.append('div').style('padding', '0 6px');
      drawBarSVG(revCell.node(), d.rev, maxRev, colW.rev, PALETTE[0], fmtMoney);

      const popCell = rowDiv.append('div').style('padding', '0 6px');
      drawBarSVG(popCell.node(), d.pop, maxPop, colW.pop, PALETTE[1 % PALETTE.length], fmtPop);

      const zCell = rowDiv.append('div').style('padding', '0 6px');
      drawZScoreSVG(zCell.node(), d.z);

      const rpcCell = rowDiv.append('div').style('padding', '0 6px');
      drawBarSVG(rpcCell.node(), d.rpc, maxRpc, colW.rpc, PALETTE[4 % PALETTE.length], fmtRpc);
    });
  }

  renderBody();
}
