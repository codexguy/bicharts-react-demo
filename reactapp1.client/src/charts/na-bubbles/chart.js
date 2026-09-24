function render(container, data, options) {
  container.replaceChildren();
  const columns = data.columns || [];
  const rows = data.rows || [];
  const W = options.width, H = options.height;
  const CF = Math.max(9, Math.min(14, Math.round(Math.min(W, H) / 55)));
  const themeFg = options.themeFg || '#333333';
  const themeBg = options.backgroundColor || options.themeBg || '#ffffff';
  const fmt = new Intl.NumberFormat(options.cultureCode || 'en-US');

  const svg = d3.select(container).append('svg')
    .attr('width', W).attr('height', H)
    .attr('viewBox', '0 0 ' + W + ' ' + H);

  svg.append('rect').attr('width', W).attr('height', H)
    .attr('fill', themeBg).style('pointer-events', 'none');

  if (!rows.length) {
    svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('fill', themeFg).text(options.noDataText || 'No data for the current selection');
    return;
  }

  const toks = s => (s || '').toLowerCase().split(/[^a-z]+/);
  const isLat = c => toks(c.name).some(t => t === 'lat' || t === 'latitude');
  const isLon = c => toks(c.name).some(t => t === 'lon' || t === 'lng' || t === 'long' || t === 'longitude');
  const numInRange = (i, lo, hi) => {
    let n = 0, ok = 0;
    for (let r = 0; r < rows.length && n < 24; r++) {
      const v = rows[r][i];
      if (v == null || v === '') continue;
      n++; const x = +v;
      if (isFinite(x) && x >= lo && x <= hi) ok++;
    }
    return n > 0 && ok >= n * 0.9;
  };
  const gLatIdx = columns.findIndex(c => c.name === '__geoLat__');
  const gLonIdx = columns.findIndex(c => c.name === '__geoLon__');
  const latIdx = gLatIdx >= 0 ? gLatIdx :
    (columns.findIndex(c => c.name === 'Latitude') >= 0 && numInRange(columns.findIndex(c => c.name === 'Latitude'), -90, 90))
      ? columns.findIndex(c => c.name === 'Latitude')
      : columns.findIndex((c, i) => isLat(c) && numInRange(i, -90, 90));
  const lonIdx = gLonIdx >= 0 ? gLonIdx :
    (columns.findIndex(c => c.name === 'Longitude') >= 0 && numInRange(columns.findIndex(c => c.name === 'Longitude'), -180, 180))
      ? columns.findIndex(c => c.name === 'Longitude')
      : columns.findIndex((c, i) => isLon(c) && numInRange(i, -180, 180));

  if (latIdx < 0 || lonIdx < 0) {
    return 'INVALID:North America (Bubbles) requires latitude and longitude columns.';
  }

  const rowIdxIdx = columns.findIndex(c => c.name === '__rowIdx__');
  const segIdx = columns.findIndex(c => c.name === 'Segment');
  const cityIdx = columns.findIndex(c => c.name === 'City');
  const revIdx = columns.findIndex(c => c.name === 'Revenue');
  const popIdx = columns.findIndex(c => c.name === 'Population');

  // City top-15 + Other (by Revenue) - used only as a display label; every row still keeps
  // its own geographic point, since dropping rows here would defeat the map's purpose.
  const cityRankIdx = new Map();
  if (cityIdx >= 0 && revIdx >= 0) {
    const order = rows.map((r, i) => ({ i, rev: +r[revIdx] || 0 }))
      .sort((a, b) => d3.descending(a.rev, b.rev));
    order.forEach((o, rank) => cityRankIdx.set(o.i, rank));
  }
  const cityLabel = (r, i) => {
    if (cityIdx < 0) return null;
    const rank = cityRankIdx.get(i);
    if (rank == null || rank < 15) return String(r[cityIdx]);
    return 'Other';
  };

  const pts = [];
  let offMap = 0, noSize = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rla = row[latIdx], rlo = row[lonIdx];
    if (rla == null || rla === '' || rlo == null || rlo === '') { offMap++; continue; }
    const la = +rla, lo = +rlo;
    if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) { offMap++; continue; }
    let size = 1;
    if (revIdx >= 0) {
      const sRaw = row[revIdx];
      if (sRaw == null || sRaw === '' || !isFinite(+sRaw)) { noSize++; continue; }
      size = +sRaw;
    }
    pts.push({
      la, lo, size,
      revenue: revIdx >= 0 ? +row[revIdx] : null,
      population: popIdx >= 0 ? +row[popIdx] : null,
      seg: segIdx >= 0 ? (row[segIdx] == null ? '(blank)' : String(row[segIdx])) : null,
      cityDisp: cityLabel(row, r),
      rowIdx: rowIdxIdx >= 0 ? row[rowIdxIdx] : r
    });
  }

  const geo = options.geo && options.geo.features && options.geo.features.length ? options.geo : null;
  const proj = d3.geoNaturalEarth1();
  const margin = { top: 62, right: 16, bottom: 46, left: 16 };
  if (geo) proj.fitExtent([[margin.left, margin.top], [W - margin.right, H - margin.bottom]], geo);
  else if (pts.length) proj.fitExtent([[margin.left + 20, margin.top + 10], [W - margin.right - 20, H - margin.bottom - 10]],
    { type: 'MultiPoint', coordinates: pts.map(p => [p.lo, p.la]) });
  const path = d3.geoPath(proj);
  const land = options.geoLandColor || '#e6e6e6';
  const noData = options.geoNoDataColor || land;

  if (geo) {
    svg.append('g').selectAll('path').data(geo.features).join('path')
      .attr('d', path).attr('fill', land).attr('stroke', '#ffffff').attr('stroke-width', 0.6);
  }

  const placed = [];
  for (const p of pts) {
    const xy = proj([p.lo, p.la]);
    if (xy && isFinite(xy[0]) && isFinite(xy[1])) { p.x = xy[0]; p.y = xy[1]; placed.push(p); }
    else offMap++;
  }

  const mapCap = options.maxMapPoints > 0 ? options.maxMapPoints : 1000;
  let droppedForCap = 0;
  if (placed.length > mapCap) {
    placed.sort((a, b) => b.size - a.size);
    droppedForCap = placed.length - mapCap;
    placed.length = mapCap;
  }

  const PALETTE = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d'];

  // Segment color, sorted desc by aggregate Revenue (not alphabetical)
  let segments = [];
  let colorOf = () => PALETTE[0];
  const rowIdxBySeg = new Map();
  if (segIdx >= 0) {
    const segTotals = d3.rollups(placed, v => d3.sum(v, d => d.revenue || 0), d => d.seg)
      .sort((a, b) => d3.descending(a[1], b[1]));
    segments = segTotals.map(d => d[0]);
    const scale = d3.scaleOrdinal(segments, segments.map((_, i) => PALETTE[i % PALETTE.length]));
    colorOf = s => scale(s);
    placed.forEach(p => {
      if (!rowIdxBySeg.has(p.seg)) rowIdxBySeg.set(p.seg, []);
      rowIdxBySeg.get(p.seg).push(p.rowIdx);
    });
  }

  const rmax = Math.max(6, Math.min(24, Math.min(W, H) / 20));
  const rmin = 3;
  const revExtent = d3.extent(placed, d => d.size);
  const lo0 = isFinite(revExtent[0]) ? Math.min(0, revExtent[0]) : 0;
  const hi0 = isFinite(revExtent[1]) && revExtent[1] > 0 ? revExtent[1] : 1;
  const rad = d3.scaleSqrt().domain([0, hi0]).range([rmin, rmax]);

  placed.sort((a, b) => rad(b.size) - rad(a.size));

  const marks = svg.append('g').selectAll('circle.d3-mark')
    .data(placed).join('circle')
    .attr('class', 'd3-mark')
    .style('cursor', 'pointer')
    .attr('cx', d => d.x).attr('cy', d => d.y)
    .attr('r', d => rad(d.size))
    .attr('fill', d => segIdx >= 0 ? colorOf(d.seg) : (noData === land ? PALETTE[0] : noData))
    .attr('fill-opacity', 0.75)
    .attr('stroke', '#333333').attr('stroke-width', 0.6)
    .attr('data-row-idx', d => d.rowIdx);

  if (options.allowTooltips) {
    marks.append('title').text(d => {
      const parts = [];
      if (d.cityDisp != null) parts.push(d.cityDisp);
      if (d.seg != null) parts.push(d.seg);
      const header = parts.join(' \u2014 ');
      const lines = [header];
      if (d.revenue != null) lines.push('Revenue: ' + fmt.format(Math.round(d.revenue)));
      if (d.population != null) lines.push('Population: ' + fmt.format(Math.round(d.population)));
      return lines.join('\n');
    });
  }

  // Bottom-left annotation stack
  let noteY = H - 8;
  const note = (txt, sz) => {
    svg.append('text').attr('x', 8).attr('y', noteY)
      .attr('font-size', sz).attr('fill', themeFg).text(txt);
    noteY -= sz + 3;
  };
  if (droppedForCap > 0) note('Showing largest ' + fmt.format(mapCap) + ' of ' + fmt.format(mapCap + droppedForCap) +
    ' points \u2014 raise the map-point cap to see more', CF);
  if (offMap > 0) note(offMap + (offMap === 1 ? ' point off-map' : ' points off-map'), CF);
  if (noSize > 0) note(noSize + (noSize === 1 ? ' row omitted (no Revenue value)' : ' rows omitted (no Revenue value)'), CF - 1);

  // Segment legend (top-left) with translucent backdrop pill for legibility over the map
  if (segments.length) {
    const rowH = 14;
    const legW = 150;
    const legH = 6 + segments.length * rowH + 6;
    const legendRoot = svg.append('g').attr('transform', 'translate(8,8)');
    legendRoot.append('rect').attr('width', legW).attr('height', legH)
      .attr('fill', themeBg).attr('fill-opacity', 0.82).attr('rx', 4)
      .style('pointer-events', 'none');
    segments.forEach((seg, i) => {
      const y = 8 + i * rowH;
      const rowIdxs = (rowIdxBySeg.get(seg) || []).join(',');
      const swatch = legendRoot.append('rect')
        .attr('x', 6).attr('y', y - 6).attr('width', 10).attr('height', 10)
        .attr('fill', colorOf(seg))
        .attr('class', 'd3-legend-mark')
        .style('cursor', 'pointer')
        .style('pointer-events', 'all')
        .attr('data-row-idx', rowIdxs);
      const label = String(seg).length > 20 ? String(seg).slice(0, 19) + '\u2026' : String(seg);
      legendRoot.append('text')
        .attr('x', 20).attr('y', y + 3)
        .attr('font-size', CF - 1).attr('fill', themeFg)
        .attr('class', 'd3-legend-mark')
        .style('cursor', 'pointer')
        .attr('data-row-idx', rowIdxs)
        .text(label);
    });
  }

  // Median-Revenue bubble-size reference (top-right), computed live from the rendered rows
  if (revIdx >= 0 && placed.length) {
    const medRev = d3.median(placed, d => d.revenue) || 0;
    const medR = rad(medRev);
    const legW = 140, legH = medR * 2 + 40;
    const gx = W - margin.right - legW - 4, gy = 8;
    const refG = svg.append('g').attr('transform', 'translate(' + gx + ',' + gy + ')');
    refG.append('rect').attr('width', legW).attr('height', legH)
      .attr('fill', themeBg).attr('fill-opacity', 0.82).attr('rx', 4)
      .style('pointer-events', 'none');
    refG.append('text').attr('x', legW / 2).attr('y', 14)
      .attr('text-anchor', 'middle').attr('font-size', CF - 1).attr('fill', themeFg)
      .text('Median Revenue bubble');
    const cx = legW / 2, cy = 20 + medR;
    refG.append('circle').attr('cx', cx).attr('cy', cy).attr('r', medR)
      .attr('fill', 'none').attr('stroke', themeFg).attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '4,3');
    refG.append('text').attr('x', legW / 2).attr('y', legH - 6)
      .attr('text-anchor', 'middle').attr('font-size', CF - 1).attr('fill', themeFg)
      .text('Median Revenue: ' + fmt.format(Math.round(medRev)));
  }
}