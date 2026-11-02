/* 在线底图浏览器 —— 零依赖瓦片地图 */
(function () {
  const L = (window.LAYERS || []);
  const INIT_SEARCH = location.search;   // 先记住深链接，后续 replaceState 会改写地址栏
  const CAT_ORDER = ['影像', '影像注记', '街道', '街道注记', '地形', '地形注记', '灰底', '专题'];
  L.sort((a, b) => {
    if (!!a.tpl !== !!b.tpl) return a.tpl ? -1 : 1;      // 可预览的排前面，不可预览的放最后
    if (a.hist !== b.hist) return a.hist ? 1 : -1;
    const ia = CAT_ORDER.findIndex(k => a.name.startsWith(k));
    const ib = CAT_ORDER.findIndex(k => b.name.startsWith(k));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name, 'zh');
  });
  const $ = s => document.querySelector(s);
  const tiles = $('#tiles'), map = $('#map');

  /* ---------- 历史影像时间轴 ---------- */
  const HIST = L.filter(x => x.hist).sort((a, b) => (a.date < b.date ? -1 : 1));
  const HIST_IDX = {};
  HIST.forEach((x, i) => { HIST_IDX[x.name] = i; });

  /* ---------- 署名 ---------- */
  const ATTR = {
    Esri: { t: '© Esri, Maxar, Earthstar Geographics', u: 'https://www.esri.com' },
    天地图: { t: '© 天地图', u: 'https://www.tianditu.gov.cn' },
    高德: { t: '© 高德地图', u: 'https://www.amap.com' },
    OSM: { t: '© OpenStreetMap contributors', u: 'https://www.openstreetmap.org/copyright' },
    OpenCycleMap: { t: '© Thunderforest · © OpenStreetMap contributors', u: 'https://www.thunderforest.com' },
    OpenTopoMap: { t: '© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors', u: 'https://opentopomap.org' },
    SuperMap: { t: '© 超图软件', u: 'https://www.supermap.com' },
    Google: { t: '© Google', u: 'https://www.google.com/maps' },
    Copernicus: { t: '© ESA WorldCover · Copernicus', u: 'https://worldcover2021.esa.int' },
    船讯网: { t: '© 船讯网', u: 'https://www.shipxy.com' },
    其他: { t: '© 原服务提供方', u: '' },
  };
  const attributionOf = lay => (lay.hist
    ? { t: '© Esri · World Imagery Wayback', u: 'https://livingatlas.arcgis.com/wayback/' }
    : (ATTR[lay.vendor] || ATTR['其他']));

  const state = {
    chip: '全部', q: '', items: L.slice(), idx: 0,
    view: { lon: 0, lat: 0, z: 2 },
    drag: null,
  };

  /* 视图参数：?z=7&lon=109&lat=36（只读，不回写地址栏） */
  (function () {
    const q = new URLSearchParams(INIT_SEARCH);
    const z = +q.get('z'), lon = +q.get('lon'), lat = +q.get('lat');
    if (z >= 1 && z <= 17) state.view.z = z;
    if (isFinite(lon) && Math.abs(lon) <= 180) state.view.lon = lon;
    if (isFinite(lat) && Math.abs(lat) <= 85) state.view.lat = lat;
  })();

  /* ---------- 给气象专题（theme.js）用的接口 ---------- */
  const baseName = n => String(n).replace(/（.*?）/g, '').trim();
  window.MAPVIEW = state.view;
  window.MAP_SELECT = function (name) {
    const b = baseName(name);
    let i = state.items.findIndex(x => x.name === name);
    if (i < 0) i = state.items.findIndex(x => baseName(x.name) === b);
    if (i < 0) i = state.items.findIndex(x => baseName(x.name).indexOf(b) === 0);
    if (i >= 0) select(i);
  };
  window.MAP_REDRAW = function () { render(); };

  /* ---------- 瓦片地址 ---------- */
  function tileUrl(tpl, z, x, y) {
    return tpl
      .replace(/\{tilematrix\}/gi, z)
      .replace(/\{tilecol\}/gi, x).replace(/\{tilerow\}/gi, y)
      .replace(/\{level\}/gi, z).replace(/\{zoom\}/gi, z).replace(/\{z\}/gi, z)
      .replace(/\{col\}/gi, x).replace(/\{x\}/gi, x)
      .replace(/\{row\}/gi, y).replace(/\{y\}/gi, y)
      .replace(/\{s\}/gi, ['a', 'b', 'c'][(x + y) % 3]);
  }

  /* ---------- 投影 ---------- */
  const p2 = z => Math.pow(2, z);
  const lon2x = (lon, z) => (lon + 180) / 360 * p2(z);
  const lat2y = (lat, z) => {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * p2(z);
  };
  const x2lon = (x, z) => x / p2(z) * 360 - 180;
  const y2lat = (y, z) => {
    const n = Math.PI - 2 * Math.PI * y / p2(z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  /* ---------- 绘制 ---------- */
  function render() {
    /* 气象专题模式下，地图由 theme.js 画在 canvas 上 */
    if (window.THEME && window.THEME.isOn()) {
      window.THEME.draw(state.view);
      $('#hud').textContent = `z${state.view.z} · ${state.view.lon.toFixed(2)}°E, ${state.view.lat.toFixed(2)}°N`;
      return;
    }
    const lay = state.items[state.idx];
    if (!lay || !lay.tpl) return;
    const w = map.clientWidth, h = map.clientHeight;
    if (!w || !h || w < 20 || h < 20) return;
    const z = state.view.z, max = p2(z);
    const worldPx = max * 256;
    const noWrap = worldPx <= w;            // 世界比视口窄时不横向重复，避免出现两个地球
    const cx = lon2x(state.view.lon, z) * 256, cy = lat2y(state.view.lat, z) * 256;
    const offX = Math.round(cx - w / 2), offY = Math.round(cy - h / 2);   // 统一取整，避免瓦片缝隙
    const x0 = Math.floor((cx - w / 2) / 256), x1 = Math.ceil((cx + w / 2) / 256);
    const y0 = Math.floor((cy - h / 2) / 256), y1 = Math.ceil((cy + h / 2) / 256);
    let html = '';
    let n = 0;
    for (let ty = y0; ty < y1; ty++) {
      if (ty < 0 || ty >= max) continue;
      for (let tx = x0; tx < x1; tx++) {
        if (noWrap && (tx < 0 || tx >= max)) continue;
        const wx = noWrap ? tx : ((tx % max) + max) % max;
        const left = (tx * 256 - offX).toFixed(0);
        const top = (ty * 256 - offY).toFixed(0);
        html += `<img src="${tileUrl(lay.tpl, z, wx, ty)}" style="left:${left}px;top:${top}px"
          loading="eager" referrerpolicy="no-referrer"
          onerror="this.style.visibility='hidden';window.__tileFail=(window.__tileFail||0)+1">`;
        n++;
      }
    }
    tiles.innerHTML = html;
    window.__tileFail = 0;
    const cur = state.idx, expect = n;
    setTimeout(() => {
      if (state.idx !== cur) return;
      const imgs = tiles.querySelectorAll('img');
      const ok = [...imgs].filter(i => i.naturalWidth > 0).length;
      if (expect > 2 && ok === 0) toast('瓦片加载失败：该服务在当前网络不可达。国内源与国外源需要的网络环境不同，可试试切换代理');
    }, 5000);
    $('#hud').textContent = `z${z} · ${state.view.lon.toFixed(2)}°E, ${state.view.lat.toFixed(2)}°N · ${n} 张瓦片`;
  }

  /* ---------- 选择图层 ---------- */
  function syncUrl(layerName) {
    const q = new URLSearchParams();
    if (layerName) q.set('layer', layerName);
    if (state.chip !== '全部') q.set('filter', state.chip);
    try { history.replaceState(null, '', q.toString() ? '?' + q.toString() : location.pathname); } catch (e) {}
  }

  /* ---------- 时间轴 ---------- */
  function syncTimeline(lay) {
    const box = $('#timeline');
    if (!box) return;
    if (!lay || !lay.hist) { box.hidden = true; return; }
    box.hidden = false;
    const r = $('#tl-range');
    r.max = String(HIST.length - 1);
    r.value = String(Math.max(0, HIST_IDX[lay.name] | 0));
    $('#tl-cur').textContent = lay.date;
    $('#tl-span').textContent = `${HIST[0].date} → ${HIST[HIST.length - 1].date}`;
  }

  function gotoTimeline(k) {
    if (!HIST.length) return;
    k = Math.max(0, Math.min(HIST.length - 1, k));
    const target = HIST[k];
    if (state.chip !== '历史影像') { state.chip = '历史影像'; buildChips(); applyFilter(); }
    const i = state.items.findIndex(x => x.name === target.name);
    if (i >= 0) select(i, { scroll: true, count: true });
  }

  function select(i, opts) {
    state.idx = Math.max(0, Math.min(state.items.length - 1, i));
    const lay = state.items[state.idx];
    document.querySelectorAll('.item').forEach((el, k) => el.classList.toggle('on', +el.dataset.i === state.idx));
    const cur = document.querySelector(`.item[data-i="${state.idx}"]`);
    if (cur && opts && opts.scroll) cur.scrollIntoView({ block: 'nearest' });

    if (opts && opts.count && window.STATS) window.STATS.view(lay.name);
    if (SUM) renderStatsPanel(); else scheduleStats();

    const notice = $('#notice');
    if (!lay.tpl) {
      tiles.innerHTML = '';
      notice.hidden = false;
      notice.innerHTML = `
        ${lay.hist ? `<div class="date">${lay.date}</div>` : ''}
        <div class="big">${lay.name}</div>
        <div class="desc">${lay.hist
          ? '历史影像图层由 Esri Wayback 服务提供，当前网络无法直接取到瓦片（该域名在部分网络环境下不可达）。<br>文件本身可用：在 ArcGIS / QGIS 中打开即可看到这一天的影像。'
          : (lay.note ? `${lay.note}。<br>文件本身可用：在 ArcGIS / QGIS 中打开即可。`
                      : '该图层没有可直接拼接的瓦片地址（可能是网页链接型图层，或服务需要密钥）。<br>文件本身可用：在 ArcGIS / QGIS 中打开即可。')}</div>
        <div class="desc" style="margin-top:-4px"><span class="tag">仍可下载 .lyr 使用</span></div>`;
      $('#hud').textContent = '无在线预览';
    } else {
      notice.hidden = true;
      render();
    }

    const file = lay.file;
    const path = `files/${lay.cat}/${file}`;
    const dl = $('#dl');
    dl.href = encodeURI(path);
    dl.setAttribute('download', file);
    $('#copy').disabled = !lay.tpl;

    syncUrl(lay.name);
    syncTimeline(lay);

    const at = attributionOf(lay);
    const gcj = /GCJ[-_]?02/i.test(lay.name + ' ' + (lay.tpl || ''));
    $('#info').innerHTML = `
      <span><span class="k">图层</span><b>${lay.name}</b></span>
      <span><span class="k">厂商</span>${lay.vendor}</span>
      <span><span class="k">分类</span>${lay.cat}</span>
      ${lay.hist ? `<span class="pill warn">历史影像 ${lay.date}</span>` : ''}
      ${lay.tpl ? (lay.guessed ? '<span class="pill warn">地址为推测</span>' : '<span class="pill">在线可预览</span>')
                : '<span class="pill warn">无在线预览</span>'}
      ${gcj ? '<span class="pill warn" title="火星坐标：与 WGS84 / 西安80 数据叠加会偏 300～600 米">GCJ-02 偏移 · 勿量算</span>' : ''}
      ${lay.dup ? `<span class="pill warn" title="与「${lay.dup}」是同一服务">重复</span>` : ''}
      <span class="url" title="${lay.tpl || ''}">${lay.tpl ? lay.tpl.slice(0, 90) : '—'}</span>
      <a class="attr" href="${at.u}" target="_blank" rel="noopener">${at.t}</a>`;
  }

  /* ---------- 列表 ---------- */
  const CHIPS = ['全部', '影像', '街道', '地形', '灰底', '专题', '历史影像', '无法预览'];
  const initFilter = new URLSearchParams(INIT_SEARCH).get('filter');
  if (initFilter && CHIPS.includes(initFilter)) state.chip = initFilter;
  function buildChips() {
    $('#chips').innerHTML = CHIPS.map(c =>
      `<button class="chip ${c === state.chip ? 'on' : ''}" data-c="${c}">${c}</button>`).join('');
  }

  function applyFilter() {
    const q = state.q.trim().toLowerCase();
    state.items = L.filter(x => {
      if (state.chip === '历史影像') { if (!x.hist) return false; }
      else if (state.chip === '无法预览') { if (x.tpl) return false; }
      else if (state.chip !== '全部') {
        if (x.hist || !x.name.startsWith(state.chip)) return false;
      }
      if (q && !(x.name + ' ' + x.vendor + ' ' + x.cat).toLowerCase().includes(q)) return false;
      return true;
    });
    if (state.idx >= state.items.length) state.idx = 0;

    let html = '', lastCat = '', noTplDone = false;
    state.items.forEach((x, i) => {
      if (!x.tpl && !noTplDone) {
        noTplDone = true;
        html += `<div class="grouphd grouphd-warn">无法在线预览 · ${state.items.filter(y => !y.tpl).length} 个（仍可下载）</div>`;
      }
      if (x.tpl && x.cat !== lastCat) { html += `<div class="grouphd">${x.cat} · ${state.items.filter(y => y.cat === x.cat).length} 个</div>`; lastCat = x.cat; }
      html += `<div class="item ${i === state.idx ? 'on' : ''}" data-i="${i}">
        <i class="dot ${x.tpl ? 'ok' : 'no'}" title="${x.tpl ? '可在线预览' : '无在线预览'}"></i>
        <span class="nm">${x.name}</span>${x.dup ? `<span class="vd dup" title="与「${x.dup}」是同一服务">重复</span>` : ''}<span class="vd">${x.vendor}</span></div>`;
    });
    $('#list').innerHTML = html || '<div class="grouphd">没有匹配的图层</div>';
    $('#pv').textContent = state.items.filter(x => x.tpl).length;
    $('#total').textContent = L.length;
    select(state.idx, { scroll: false });
  }

  /* ---------- 交互 ---------- */
  function bind() {
    /* 底图 / 气象专题 切换 */
    const modes = $('#modes');
    if (modes) modes.addEventListener('click', e => {
      const b = e.target.closest('.mode'); if (!b) return;
      modes.querySelectorAll('.mode').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const on = b.dataset.m === 'theme';
      const side = document.querySelector('.side');
      if (on) {
        if (side) side.style.display = 'none';
        const tl = $('#timeline'); if (tl) tl.hidden = true;
        window.THEME.show();
      } else {
        if (side) side.style.display = '';
        window.THEME.hide();
        /* 专题里用的是小数层级（4.3 / 4.6），回到瓦片模式要取整 */
        state.view.z = Math.max(1, Math.min(17, Math.round(state.view.z)));
        select(state.idx);
        syncTimeline(state.items[state.idx]);
      }
    });

    $('#chips').addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      state.chip = b.dataset.c;
      buildChips(); applyFilter();
      const cur = state.items[state.idx];
      syncUrl(cur ? cur.name : '');
    });
    $('#q').addEventListener('input', e => { state.q = e.target.value; applyFilter(); });
    $('#list').addEventListener('click', e => {
      const it = e.target.closest('.item'); if (!it) return;
      select(+it.dataset.i, { count: true });
    });
    $('#next').onclick = () => select(state.idx + 1, { scroll: true, count: true });
    $('#prev').onclick = () => select(state.idx - 1, { scroll: true, count: true });
    $('#dl').addEventListener('click', () => {
      const l = state.items[state.idx];
      if (l && window.STATS) window.STATS.download(l.name);
    });
    const sr = $('#s-refresh');
    if (sr) sr.onclick = () => {
      const side = $('#statside');
      if (side && side.classList.contains('bu-mode')) {
        $('#s-upd').textContent = '刷新中…';
        tryBusuanzi();
      } else {
        refreshStats();
      }
      toast('统计已刷新');
    };

    /* 明暗主题 */
    const tb = $('#theme');
    if (tb) {
      const SUN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';
      const MOON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';
      const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
      const paint = () => { tb.innerHTML = isDark() ? SUN : MOON; };
      paint();
      tb.onclick = () => {
        const next = isDark() ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        paint();
        try { localStorage.setItem('lp_theme', next); } catch (e) {}
        /* 专题模式下重画，让边界线/背景跟着换色 */
        if (window.THEME && window.THEME.isOn()) {
          const tbg = (getComputedStyle(document.documentElement).getPropertyValue('--theme-map-bg') || '').trim();
          const box = $('#map'); if (box && tbg) box.style.background = tbg;
          window.THEME.draw(state.view);
        }
      };
    }

    /* 历史影像时间轴 */
    const tlRange = $('#tl-range');
    if (tlRange) {
      tlRange.addEventListener('input', e => gotoTimeline(+e.target.value));
      const curK = () => {
        const l = state.items[state.idx];
        return (l && HIST_IDX[l.name] !== undefined) ? HIST_IDX[l.name] : 0;
      };
      $('#tl-prev').onclick = () => gotoTimeline(curK() - 1);
      $('#tl-next').onclick = () => gotoTimeline(curK() + 1);
    }
    $('#copy').onclick = async () => {
      const lay = state.items[state.idx];
      if (!lay.tpl) return;
      try { await navigator.clipboard.writeText(lay.tpl); toast('瓦片地址已复制'); }
      catch { window.prompt('复制瓦片地址：', lay.tpl); }
    };
    $('#zin').onclick = () => { state.view.z = Math.min(17, state.view.z + 1); render(); };
    $('#zout').onclick = () => { state.view.z = Math.max(1, state.view.z - 1); render(); };
    $('#zhome').onclick = () => { state.view.lon = 0; state.view.lat = 0; state.view.z = 2; render(); };

    document.addEventListener('keydown', e => {
      if (window.THEME && window.THEME.isOn()) return;   // 专题模式下方向键留给年份
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); select(state.idx + 1, { scroll: true, count: true }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); select(state.idx - 1, { scroll: true, count: true }); }
    });

    /* 拖拽平移 */
    map.addEventListener('pointerdown', e => {
      if (e.target.closest('.zoomer')) return;
      state.drag = { x: e.clientX, y: e.clientY };
      map.classList.add('grabbing');
      map.setPointerCapture(e.pointerId);
    });
    map.addEventListener('pointermove', e => {
      if (!state.drag) return;
      const dx = e.clientX - state.drag.x, dy = e.clientY - state.drag.y;
      tiles.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const end = e => {
      if (!state.drag) return;
      const dx = e.clientX - state.drag.x, dy = e.clientY - state.drag.y;
      const z = state.view.z;
      const cx = lon2x(state.view.lon, z) - dx / 256;
      const cy = lat2y(state.view.lat, z) - dy / 256;
      state.view.lon = Math.max(-180, Math.min(180, x2lon(cx, z)));
      state.view.lat = Math.max(-85, Math.min(85, y2lat(cy, z)));
      state.drag = null;
      tiles.style.transform = '';
      map.classList.remove('grabbing');
      render();
    };
    map.addEventListener('pointerup', end);
    map.addEventListener('pointercancel', end);

    /* 滚轮缩放 */
    map.addEventListener('wheel', e => {
      if (!state.items[state.idx] || !state.items[state.idx].tpl) return;
      e.preventDefault();
      state.view.z = Math.max(1, Math.min(17, state.view.z + (e.deltaY < 0 ? 1 : -1)));
      render();
    }, { passive: false });

    window.addEventListener('resize', render);
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 1800);
  }

  /* ---------- 右侧统计 ---------- */
  let SUM = null, statsState = 'unknown', statsTimer = null;

  async function refreshStats() {
    if (statsState === 'off') return;
    try {
      const r = await fetch('/api/summary?days=30', { cache: 'no-store' });
      if (!r.ok) { onStatsUnavailable(); return; }
      SUM = await r.json();
      statsState = 'ok';
      renderStatsPanel();
    } catch (e) {
      onStatsUnavailable();
    }
  }

  function onStatsUnavailable() {
    statsState = 'off';
    if (location.protocol === 'file:') { showStatsPlaceholder(); return; }
    tryBusuanzi();                 // 静态托管（GitHub Pages）走不蒜子
  }

  /* 不蒜子：只有站点级 PV / UV，等它的脚本把数字填进隐藏的 span */
  async function tryBusuanzi() {
    const el = $('#statside');
    const pvEl = document.getElementById('busuanzi_value_site_pv');
    const uvEl = document.getElementById('busuanzi_value_site_uv');
    if (!el || !pvEl || !uvEl) return false;
    for (let i = 0; i < 24; i++) {            // 最多等 12 秒
      const pv = (pvEl.textContent || '').trim();
      const uv = (uvEl.textContent || '').trim();
      if (pv && uv && /\d/.test(pv)) {
        el.style.display = 'flex';
        el.classList.add('bu-mode');
        $('#s-pv').textContent = pv;
        $('#s-uv').textContent = uv;
        $('#s-pv-lab').textContent = '本站累计访问 PV';
        $('#s-uv-lab').textContent = '独立访客 UV';
        $('#s-upd').textContent = '不蒜子';
        const note = $('#s-bu-note');
        if (note) note.hidden = false;
        return true;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  /* 本地直接双击打开时，给出“统计未接入”的占位，而不是整栏消失 */
  function showStatsPlaceholder() {
    const el = $('#statside');
    if (!el) return;
    el.style.display = 'flex';
    ['#s-pv', '#s-uv', '#s-pvt', '#s-uvt', '#s-view', '#s-dl'].forEach(id => { const n = $(id); if (n) n.textContent = '—'; });
    const top = $('#s-top');
    if (top) top.innerHTML = '<div class="snote">本地直接打开不统计。<br>运行 <code>python server_stats.py</code> 后，用 <code>127.0.0.1:8766</code> 打开即可看到访问量。</div>';
  }

  function scheduleStats() {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(refreshStats, 1200);
  }

  function renderStatsPanel() {
    const el = $('#statside');
    if (!el || !SUM) return;
    el.style.display = 'flex';
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    set('#s-pv', SUM.pv); set('#s-uv', SUM.uv);
    set('#s-pvt', SUM.pv_today); set('#s-uvt', SUM.uv_today);

    const cur = state.items[state.idx];
    const rec = (SUM.layers || []).find(x => x.name === (cur && cur.name)) || { views: 0, downloads: 0 };
    set('#s-view', rec.views); set('#s-dl', rec.downloads);

    const upd = $('#s-upd');
    if (upd && SUM.updated) upd.textContent = '更新 ' + SUM.updated.slice(11, 16);

    /* 近 7 天 PV 迷你柱状图 */
    const bars = $('#s-bars');
    if (bars) {
      const d = (SUM.daily || []).slice(-7);
      const mx = Math.max(1, ...d.map(x => x.pv));
      bars.innerHTML = d.length
        ? d.map(x => `<i style="height:${Math.max(6, x.pv / mx * 100)}%" title="${x.date}：PV ${x.pv} / UV ${x.uv}"></i>`).join('')
        : '<span class="snote">暂无访问记录</span>';
    }

    const top = (SUM.layers || []).slice(0, 5);
    $('#s-top').innerHTML = top.length
      ? top.map(x => `<div class="t" title="${x.name}"><span>${x.name}</span><i>${x.views}</i></div>`).join('')
      : '<div class="t" style="color:var(--muted)">还没有浏览记录</div>';
  }

  /* ---------- 启动 ---------- */
  buildChips();
  bind();
  applyFilter();

  // 默认选中最常用的那个
  const deep = new URLSearchParams(INIT_SEARCH).get('layer');
  const deepIdx = deep ? state.items.findIndex(x => x.name === deep) : -1;
  const def = state.items.findIndex(x => x.name === '影像_ESRI_World Imagery');
  const first = def >= 0 ? def : state.items.findIndex(x => x.tpl);
  select(deepIdx >= 0 ? deepIdx : (first >= 0 ? first : 0), { scroll: true, count: true });

  /* ?mode=theme 直接进气象专题（方便分享/截图） */
  if (new URLSearchParams(INIT_SEARCH).get('mode') === 'theme') {
    const tb = document.querySelector('.mode[data-m="theme"]');
    if (tb) setTimeout(() => tb.click(), 60);
  }

  const kick = () => requestAnimationFrame(() => requestAnimationFrame(render));
  kick();
  window.addEventListener('load', kick);
  if (window.ResizeObserver) new ResizeObserver(kick).observe($('#map'));

  /* 统计：首次加载 + 按 refreshMin 定时刷新 + 切回标签页时补刷 */
  refreshStats();
  const refreshMin = Math.max(1, (window.STATS_CONFIG && +window.STATS_CONFIG.refreshMin) || 10);
  setInterval(refreshStats, refreshMin * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStats(); });

})();
