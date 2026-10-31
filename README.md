# 在线底图浏览器

一个零依赖的在线底图浏览页：把一批 ArcGIS 图层文件（`.lyr` / `.lyrx`）里的在线地图服务整理成一张列表，点一下就能在地图里看，也能一键下载原始图层文件。

- **228 个图层**：46 个常用底图（影像 / 街道 / 地形 / 灰底 / 专题）+ 182 个 Esri Wayback 历史影像（2014-02-20 → 2025-05-29）
- **历史影像时间轴**：切到任意历史日期后，底部出现滑杆，拖动即可换年份
- **深链接**：`?layer=ESRI历史影像_2019-01-09` 直接打开某一张，方便发给同事
- **署名与坐标提示**：每条底图都标注版权方；GCJ-02 火星坐标的图层会标"勿量算"
- **明暗主题**：默认深色，右上角可切换，`?theme=light` 可强制浅色

> 纯静态站点，不需要后端。任何一个静态托管（GitHub Pages / Cloudflare Pages / OSS）都能跑。

## 本地预览

```bash
# 方式一：直接双击 index.html
# 方式二：起个本地服务（推荐，行为与线上一致）
python -m http.server 8000
# 然后打开 http://127.0.0.1:8000/
```

## 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "在线底图浏览器"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在仓库 **Settings → Pages** 里把 Source 设为 `main` / `root`，等一分钟，访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

## 目录结构

```
.
├─ index.html     主页面
├─ app.js         瓦片引擎 + 列表 + 时间轴 + 主题
├─ data.js        图层目录与瓦片地址（自动生成，勿手改）
├─ style.css      样式（含深/浅两套主题变量）
├─ stats.js       访问统计 SDK（静态托管下自动关闭）
├─ files/         228 个 .lyr / .lyrx 原件，供下载
└─ 说明.md        使用说明与已知问题
```

## 图层来源与署名

瓦片来自各家的公开在线服务，**图层文件是配置，瓦片数据仍受各平台条款约束**：

- Esri World Imagery / Wayback / Topo / Canvas 等：© Esri, Maxar, Earthstar Geographics
- OpenStreetMap 系：© OpenStreetMap contributors（ODbL）
- OpenTopoMap：© OpenTopoMap（CC-BY-SA）
- 天地图：© 天地图（本仓库已把天地图图层降为"仅下载"，因为 `tk` 绑定域名）
- 高德：© 高德地图（`GCJ-02` 火星坐标，与 WGS84 数据叠加会偏 300～600 米）
- 超图 / 船讯网 / Copernicus WorldCover：© 各自提供方

页面上已保留署名栏，**转发或二次发布时请勿删除**。

## 关于本仓库的两个取舍

1. **没有收录 5 个 OpenCycleMap 图层**：原始 `.lyr` 里带着第三方的 Thunderforest API key，公开仓库会把别人的额度暴露出去。需要的话自己申请免费 key，把地址补进 `data.js` 即可。
2. **天地图 6 个图层只提供下载**：天地图的 `tk` 有域名白名单，公网域名用不了。申请到绑定自己域名的 key 后，可在「构建工具」里取消这一限制。

## 访问统计

线上用 **[不蒜子](https://busuanzi.ibruce.info/)** 统计站点访问量：页面右侧会显示"本站累计 PV / 独立访客 UV"，数字来自不蒜子的公共接口，按域名（`xxx.github.io`）分别计数。

- 只统计**页面打开次数**，**不统计下载量**，也没有分图层数据——这些需要后端（本仓库是纯静态）。
- 首次打开时数字可能要等 1～2 秒才出现；如果一直不显示，多半是被网络或广告拦截插件挡住了 `busuanzi.ibruce.info`。
- 不想用统计的话，删掉 `index.html` 里那行 `busuanzi.pure.mini.js` 即可，页面其他功能不受影响。

## 非商业用途

本项目用于科研与教学演示（非商用）。不承诺任何第三方瓦片服务的长期可用性；若某天某图层打不开，多半是源站限流或改版，而不是页面坏了。
