/* 气象专题：矢量边界 + 分级设色（零依赖，复用主图的 Web 墨卡托视图） */
window.THEME = (function () {
  const S = {
    on: false, metric: 'temp', level: 'province', year: 2025,
    geo: {}, panel: null, idx: new Map(), breaks: [], vmin: 0, vmax: 0,
    layers: { province: true, city: false, county: false, border: true },
    timer: null, loading: false,
  };
  const scripted = {};
  const $ = s => document.querySelector(s);
  const P2 = z => Math.pow(2, z);
  const lon2x = (lon, z) => (lon + 180) / 360 * P2(z) * 256;
  const lat2y = (lat, z) => {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * P2(z) * 256;
  };

  /* 固定等级：同一颜色在任何年份、任何层级都代表同一区间 */
  const GRADES = {
    temp: [
      { up: 0,      n: '寒温带',   c: '#2b6cb0' },
      { up: 5,      n: '中温带',   c: '#5b9bd5' },
      { up: 10,     n: '暖温带',   c: '#a8d5ee' },
      { up: 15,     n: '北亚热带', c: '#fff2b3' },
      { up: 20,     n: '中亚热带', c: '#f6b26b' },
      { up: 25,     n: '南亚热带', c: '#e0663d' },
      { up: 99,     n: '热带',     c: '#a11226' },
    ],
    prec: [
      { up: 200,    n: '干旱区',   c: '#fdf0cc' },
      { up: 400,    n: '半干旱区', c: '#f2d79a' },
      { up: 600,    n: '半湿润区', c: '#b9dfae' },
      { up: 800,    n: '湿润区',   c: '#74c9a8' },
      { up: 1200,   n: '多雨区',   c: '#3aa6c4' },
      { up: 1600,   n: '湿润多雨', c: '#1f6fb2' },
      { up: 99999,  n: '极多雨',   c: '#123c78' },
    ],
  };
  const UNIT = { temp: '°C', prec: 'mm' };
  const NAME = { temp: '年均气温', prec: '年降水量' };
  const LVCN = { province: '省', city: '市', county: '县' };

  function loadScript(url) {
    if (scripted[url]) return scripted[url];
    scripted[url] = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = url;
      el.onload = () => res();
      el.onerror = () => rej(new Error('无法加载 ' + url));
      document.head.appendChild(el);
    });
    return scripted[url];
  }

  /* ---------- 数据 ---------- */
  async function loadData() {
    S.loading = true;
    setInfo('正在加载数据…');
    try {
      await Promise.all([
        loadScript(`geo/${S.level}.js`),
        loadScript(`data/${S.metric}_${S.level}.js`),
        loadScript('geo/border.js'),
      ]);
      S.geo[S.level] = (window.GEO || {})[S.level];
      S.geo.border = (window.GEO || {}).border;
      S.panel = (window.PANEL || {})[`${S.metric}_${S.level}`];
      if (!S.geo[S.level] || !S.panel) throw new Error('数据不完整');
      buildIndex();
      S.loading = false;
      return true;
    } catch (e) {
      S.loading = false;
      setInfo('数据加载失败：' + e.message);
      return false;
    }
  }

  function kOf(props) {
    if (S.level === 'county') return props.c;
    if (S.level === 'city') return props.n;
    return props.n;
  }

  function buildIndex() {
    S.idx = new Map();
    for (const u of S.panel.units) {
      const k = S.level === 'county' ? u.k : u.n;
      S.idx.set(k, u);
    }
  }

  function valuesOf(year) {
    const i = year - S.panel.years[0];
    const out = [];
    for (const f of S.geo[S.level].features) {
      const u = S.idx.get(kOf(f.properties));
      if (u && u.v[i] != null) out.push(u.v[i]);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function computeBreaks() {
    // 固定等级，不再按分位数计算
    S.vmin = 0;
    S.vmax = 0;
    S.breaks = GRADES[S.metric].map(g => g.up);
  }

  function colorOf(v10) {
    if (v10 == null) return '#e7ecf1';
    const v = v10 / 10;
    const g = GRADES[S.metric].find(x => v < x.up) || GRADES[S.metric][GRADES[S.metric].length - 1];
    return g.c;
  }

  function gradeOf(v10) {
    if (v10 == null) return '—';
    const v = v10 / 10;
    const g = GRADES[S.metric].find(x => v < x.up) || GRADES[S.metric][GRADES[S.metric].length - 1];
    return g.n;
  }

  /* ---------- 绘制 ---------- */
  let built = { z: null, level: null, items: [] };
  let hitCtx = null;

  function buildPaths(z, view) {
    if (built.z === z && built.level === S.level && built.metric === S.metric) return;
    const items = [];
    const push = (fc, level) => {
      for (const f of fc.features) {
        const g = f.geometry;
        const rings = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        const path = new Path2D();
        for (const poly of rings) {
          for (const ring of poly) {
            for (let i = 0; i < ring.length; i++) {
              const x = lon2x(ring[i][0], z), y = lat2y(ring[i][1], z);
              if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
            }
            path.closePath();
          }
        }
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const poly of rings) for (const ring of poly) for (const pt of ring) {
          const px = lon2x(pt[0], z), py = lat2y(pt[1], z);
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
        items.push({ level, path, props: f.properties, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
      }
    };
    if (S.geo[S.level]) push(S.geo[S.level], S.level);
    built = { z, level: S.level, metric: S.metric, items };
  }

  function draw(view) {
    if (!S.on) return;
    const cv = $('#vec');
    const box = $('#map');
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!S.geo[S.level] || !S.panel) return;

    const z = view.z;
    buildPaths(z, view);
    const cx = lon2x(view.lon, z), cy = lat2y(view.lat, z);
    // 世界坐标平移
    ctx.save();
    ctx.translate(w / 2 - cx, h / 2 - cy);

    const i = S.year - S.panel.years[0];
    for (const it of built.items) {
      if (it.level !== S.level) continue;
      const u = S.idx.get(kOf(it.props));
      const v = u ? u.v[i] : null;
      ctx.fillStyle = colorOf(v);
      ctx.fill(it.path);
    }
    // 边界叠加
    const strokeOf = (level, style) => {
      if (!S.layers[level] || !S.geo[level]) return;
      ctx.strokeStyle = style; ctx.lineWidth = 1;
      for (const f of S.geo[level].features) {
        const g = f.geometry;
        const rings = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        for (const poly of rings) for (const ring of poly) {
          ctx.beginPath();
          for (let k = 0; k < ring.length; k++) {
            const x = lon2x(ring[k][0], z), y = lat2y(ring[k][1], z);
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    };
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const C = dark
      ? { county: 'rgba(255,255,255,.18)', city: 'rgba(220,232,245,.32)', province: 'rgba(235,245,255,.55)', border: 'rgba(240,248,255,.9)' }
      : { county: 'rgba(255,255,255,.55)', city: 'rgba(60,60,60,.45)', province: 'rgba(40,40,40,.85)', border: 'rgba(30,30,30,.92)' };
    strokeOf('county', C.county);
    strokeOf('city', C.city);
    strokeOf('province', C.province);

    /* 国界 / 九段线：border.js 里是 MultiLineString，不能按面处理 */
    if (S.layers.border && S.geo.border) {
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (const f of S.geo.border.features) {
        const g = f.geometry; if (!g) continue;
        const lines = g.type === 'MultiLineString' ? g.coordinates
                    : g.type === 'LineString' ? [g.coordinates] : [];
        for (const line of lines) {
          if (!line || line.length < 2) continue;
          ctx.beginPath();
          for (let k = 0; k < line.length; k++) {
            const x = lon2x(line[k][0], z), y = lat2y(line[k][1], z);
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // 命中测试用的离屏上下文
    hitCtx = hitCtx || document.createElement('canvas').getContext('2d');
    hitCtx.canvas.width = 1; hitCtx.canvas.height = 1;
    updateLegend();
  }

  function updateLegend() {
    const el = $('#tlegend');
    if (!el) return;
    const rows = [['气温', 'temp', '℃'], ['降水', 'prec', 'mm']];
    el.innerHTML = rows.map(([label, key, unit]) => {
      const gs = GRADES[key];
      let lo = 0;
      const items = gs.map((g, i) => {
        let txt;
        if (i === 0) txt = '&lt;' + g.up;
        else if (i === gs.length - 1) txt = '≥' + lo;
        else txt = lo + '–' + g.up;
        const html = `<span class="lg"><i style="background:${g.c}"></i><span>${txt}</span></span>`;
        lo = g.up;
        return html;
      }).join('');
      return `<div class="lrow"><span class="lk">${label}</span>${items}<span class="lu">${unit}</span></div>`;
    }).join('');
  }

  function setInfo(txt) {
    const el = $('#info');
    if (el) el.innerHTML = txt;
  }

  /* ---------- 交互 ---------- */
  function redraw() {
    if (!S.on) return;
    computeBreaks();
    const mv = window.MAPVIEW || { lon: 104, lat: 35.5, z: 4 };
    draw(mv);
  }

  async function apply() {
    const ok = await loadData();
    if (!ok) return;
    computeBreaks();
    const mv = window.MAPVIEW;
    if (mv) { mv.lon = 104; mv.lat = 35.5; mv.z = S.level === 'province' ? 4.3 : (S.level === 'city' ? 4.6 : 5); }
    hideUnit();
    if (window.MAP_SELECT) window.MAP_SELECT('灰底_ESRI_浅色（Basemap）');
    if (window.MAP_REDRAW) window.MAP_REDRAW();
    draw(window.MAPVIEW);
    setInfo(`<b>${NAME[S.metric]}</b> · 全国 ${S.panel.units.length} 个${LVCN[S.level]}级单元 · ${S.year} 年 · 点击地图可查看单个单元数值`);
  }

  function setYear(y, silent) {
    y = Math.max(1901, Math.min(2025, Math.round(+y || 1901)));
    S.year = y;
    const sl = $('#tyear'), nm = $('#tyearNum'), lb = $('#tyearv');
    if (sl) sl.value = y;
    if (nm) nm.value = y;
    if (lb) lb.textContent = y;
    computeBreaks();
    draw(window.MAPVIEW);
    refreshUnit();
    const n = S.panel ? S.panel.units.length : '';
    setInfo(`<b>${NAME[S.metric]}</b> · 全国 ${n} 个${LVCN[S.level]}级单元 · ${S.year} 年 · 点击地图可查看单个单元数值`);
  }

  function bind() {
    $('#tmetric').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $('#tmetric').querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); S.metric = b.dataset.v; apply();
    });
    $('#tlevel').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $('#tlevel').querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); S.level = b.dataset.v; apply();
    });
    $('#tlayers').addEventListener('change', e => {
      const k = e.target.dataset.k; if (!k) return;
      S.layers[k] = e.target.checked; draw(window.MAPVIEW);
    });
    $('#tyear').addEventListener('input', e => setYear(e.target.value));
    $('#tyearPrev').addEventListener('click', () => setYear(S.year - 1));
    $('#tyearNext').addEventListener('click', () => setYear(S.year + 1));
    $('#tyearNum').addEventListener('change', e => setYear(e.target.value));
    $('#tyearNum').addEventListener('keydown', e => { if (e.key === 'Enter') setYear(e.target.value); });
    document.addEventListener('keydown', e => {
      if (!S.on) return;
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setYear(S.year - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setYear(S.year + 1); }
    });
    $('#tplay').addEventListener('click', () => {
      if (S.timer) { clearInterval(S.timer); S.timer = null; $('#tplay').textContent = '▶ 播放'; return; }
      $('#tplay').textContent = '⏸ 暂停';
      S.timer = setInterval(() => {
        setYear(S.year >= 2025 ? 1901 : S.year + 1, true);
      }, 450);
    });
    // 点击查询：先精确命中，未命中则取 16px 内最近的行政区
    $('#map').addEventListener('click', ev => {
      if (!S.on || !built.items.length) return;
      if (ev.target.closest('.ucard')) return;
      const box = $('#map').getBoundingClientRect();
      const mv = window.MAPVIEW;
      const sx = ev.clientX - box.left, sy = ev.clientY - box.top;
      const wx = lon2x(mv.lon, mv.z) + (sx - box.width / 2);
      const wy = lat2y(mv.lat, mv.z) + (sy - box.height / 2);
      let hit = null;
      for (const it of built.items) {
        if (it.level !== S.level) continue;
        if (hitCtx.isPointInPath(it.path, wx, wy)) { hit = it; break; }
      }
      if (!hit) {
        let best = 16;
        for (const it of built.items) {
          if (it.level !== S.level) continue;
          const d = Math.hypot(it.cx - wx, it.cy - wy);
          if (d < best) { best = d; hit = it; }
        }
      }
      if (hit) showUnit(hit.props, sx, sy, box);
      else hideUnit();
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#map') && !e.target.closest('.ucard')) hideUnit();
    });
  }

  function refreshUnit() {
    if (!S.sel) return;
    const el = $('#ucard');
    if (!el || el.hidden) return;
    const box = $('#map').getBoundingClientRect();
    showUnit(S.sel.props, S.sel.x, S.sel.y, box, true);
  }

  function hideUnit() {
    S.sel = null;
    const el = $('#ucard');
    if (el) el.hidden = true;
  }

  function textOn(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#344054' : '#ffffff';
  }

  function gradeInfo(metric, v10) {
    if (v10 == null) return { n: '—', c: '#9aa4b1' };
    const v = v10 / 10;
    const g = GRADES[metric].find(x => v < x.up) || GRADES[metric][GRADES[metric].length - 1];
    return { n: g.n, c: g.c };
  }

  async function showUnit(props, cx, cy, box) {
    S.sel = { props: props, x: cx, y: cy };
    const el = $('#ucard');
    if (!el) return;
    const key = kOf(props);
    const other = S.metric === 'temp' ? 'prec' : 'temp';
    // 需要另一指标的数据
    if (!(window.PANEL || {})[`${other}_${S.level}`]) {
      try { await loadScript(`data/${other}_${S.level}.js`); } catch (e) {}
    }
    const pThis = (window.PANEL || {})[`${S.metric}_${S.level}`];
    const pOther = (window.PANEL || {})[`${other}_${S.level}`];
    if (!pThis) return;
    const uThis = pThis.units.find(x => (S.level === 'county' ? x.k : x.n) === key);
    const uOther = pOther ? pOther.units.find(x => (S.level === 'county' ? x.k : x.n) === key) : null;
    const i = S.year - pThis.years[0];
    const vT = S.metric === 'temp' ? (uThis ? uThis.v[i] : null) : (uOther ? uOther.v[i] : null);
    const vP = S.metric === 'prec' ? (uThis ? uThis.v[i] : null) : (uOther ? uOther.v[i] : null);
    const gT = gradeInfo('temp', vT), gP = gradeInfo('prec', vP);
    const none = vT == null && vP == null;

    el.innerHTML = `
      <div class="uc-hd"><b>${props.n}</b><span class="lv">${LVCN[S.level]}级 · ${S.year} 年</span>
        <i class="uc-x" id="uc-close">×</i></div>
      <div class="uc-row"><span class="uc-k">年均气温</span>
        <span class="uc-v">${vT == null ? '暂无数据' : (vT / 10).toFixed(1) + ' ℃'}</span>
        ${vT == null ? '' : `<span class="uc-tag" style="background:${gT.c};color:${textOn(gT.c)}">${gT.n}</span>`}</div>
      <div class="uc-row"><span class="uc-k">年降水量</span>
        <span class="uc-v">${vP == null ? '暂无数据' : Math.round(vP / 10) + ' mm'}</span>
        ${vP == null ? '' : `<span class="uc-tag" style="background:${gP.c};color:${textOn(gP.c)}">${gP.n}</span>`}</div>
      ${none ? '<div class="uc-sub" style="color:#b54708">该单元在数据源中无记录（多为南海诸岛区域）</div>' : ''}
      <div class="uc-sub">1901–2025 趋势（各自归一化：蓝=气温 绿=降水）</div>
      <canvas id="uc-chart" width="244" height="64"></canvas>`;
    el.hidden = false;

    // 定位（避免溢出）
    const w = 268, hgt = 158;
    let x = cx + 14, y = cy - 20;
    if (x + w > box.width - 8) x = cx - w - 14;
    x = Math.max(8, Math.min(x, Math.max(8, box.width - w - 8)));
    if (y + hgt > box.height - 8) y = box.height - hgt - 8;
    y = Math.max(8, y);
    el.style.left = x + 'px';
    el.style.top = y + 'px';

    $('#uc-close').onclick = hideUnit;
    drawChart(uThis, uOther);
  }

  function drawChart(uT, uP) {
    const cv = $('#uc-chart');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = 3;
    ctx.clearRect(0, 0, W, H);
    const series = [
      { v: uT ? uT.v : null, color: '#2f6690' },
      { v: uP ? uP.v : null, color: '#2f9e6e' },
    ];
    ctx.strokeStyle = '#eef2f6';
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    for (const s of series) {
      if (!s.v || !s.v.length) continue;
      const vals = s.v.filter(x => x != null);
      if (!vals.length) continue;
      const mn = Math.min(...vals), mx = Math.max(...vals);
      const span = mx - mn || 1;
      ctx.beginPath();
      s.v.forEach((v, i) => {
        if (v == null) return;
        const x = pad + i / (s.v.length - 1) * (W - pad * 2);
        const y = H - pad - (v - mn) / span * (H - pad * 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  return {
    isOn: () => S.on,
    show() {
      S.on = true;
      $('#themeside').hidden = false;
      $('#themebar').hidden = false;
      $('#mapbar').hidden = true;
      $('#vec').style.display = 'block';
      $('#tiles').style.display = 'none';
      const tbg = (getComputedStyle(document.documentElement).getPropertyValue('--theme-map-bg') || '').trim();
      $('#map').style.background = tbg || '#eef2f6';
      if (!S.bound) { bind(); S.bound = true; }
      apply();
    },
    hide() {
      S.on = false;
      $('#themeside').hidden = true;
      $('#themebar').hidden = true;
      $('#mapbar').hidden = false;
      $('#vec').style.display = 'none';
      $('#tiles').style.display = '';
      $('#map').style.background = '';
      if (S.timer) { clearInterval(S.timer); S.timer = null; $('#tplay').textContent = '▶ 播放'; }
      const cv = $('#vec'); const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
    },
    draw,
  };
})();
