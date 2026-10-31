/* 访问统计 SDK —— 无依赖
 *
 * 配置（在 index.html 里改 window.STATS_CONFIG）：
 *   endpoint : 统计接口地址，默认 '/api/event'（用 server_stats.py 托管时可用）
 *   baiduId  : 百度统计站点 ID，静态托管（GitHub Pages / OSS）时用这个
 * 两者都不生效时自动关闭，页面照常运行，不会报错。
 */
(function () {
  const CFG = window.STATS_CONFIG || {};
  let endpoint = CFG.endpoint !== undefined ? CFG.endpoint : '/api/event';
  const baiduId = CFG.baiduId || '';
  let enabled = !!endpoint;

  /* 访客标识：localStorage 里生成一次，用于 UV */
  let vid = '';
  try { vid = localStorage.getItem('lp_vid') || ''; } catch (e) {}
  if (!vid) {
    vid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem('lp_vid', vid); } catch (e) {}
  }

  /* 百度统计（可选） */
  if (baiduId) {
    window._hmt = window._hmt || [];
    const hm = document.createElement('script');
    hm.src = 'https://hm.baidu.com/hm.js?' + baiduId;
    hm.async = true;
    document.head.appendChild(hm);
    _hmt.push(['_setAccount', baiduId]);
  }

  function send(type, layer) {
    if (baiduId && window._hmt) _hmt.push(['_trackEvent', 'basemap', type, layer || '-']);
    if (!enabled) return;
    const body = JSON.stringify({
      type: type, layer: layer || '', vid: vid,
      page: location.pathname, ts: new Date().toISOString()
    });
    try {
      if (navigator.sendBeacon && endpoint.indexOf('http') !== 0) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        return;
      }
    } catch (e) { /* 落到 fetch */ }
    fetch(endpoint, {
      method: 'POST', body: body, keepalive: true,
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  }

  /* 探测接口是否存在：静态托管时一次 HEAD 之后自动关闭，不产生垃圾请求 */
  function probe() {
    if (!enabled || !/^https?:/i.test(endpoint)) { if (enabled) send('pageview', ''); return; }
    fetch(endpoint, { method: 'HEAD', cache: 'no-store' })
      .then(r => { if (!r.ok && r.status !== 405) enabled = false; })
      .catch(() => { enabled = false; })
      .finally(() => { if (enabled) send('pageview', ''); });
  }

  window.STATS = {
    view: name => send('view', name),
    download: name => send('download', name),
    pageview: () => send('pageview', '')
  };

  probe();
})();
