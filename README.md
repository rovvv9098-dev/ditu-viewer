# 底图与气象数据浏览器

一个零依赖的静态站点，把两件事放在一个页面里：

- **在线底图**：228 个 ArcGIS 图层（`.lyr` / `.lyrx`），点一下就能看，也能下载原件
- **气象专题**：1901–2025 年气温 / 降水，省 / 市 / 县三级分级设色，带年份轴和点击查询

## 功能

**底图模式**

- 46 个常用底图（影像 / 街道 / 地形 / 灰底 / 专题）+ 182 个 Esri Wayback 历史影像（2014-02-20 → 2025-05-29）
- 历史影像时间轴：拖动滑杆即可换年份
- 署名与坐标提示：每条底图标注版权方，GCJ-02 图层标"勿量算"
- 深链接：`?layer=ESRI历史影像_2019-01-09`、`?z=6&lon=100&lat=30`

**气象专题模式**（顶部切换，或 `?mode=theme`）

- 指标：年均气温 / 年降水；单元：省（34）/ 市（375）/ 县（2891）
- 年份 1901–2025：滑块、数字框、◀ ▶、自动播放
- 点击任意单元：当年数值 + 等级 + 1901–2025 趋势折线
- 边界叠加：省 / 市 / 县 / 国界
- ⚠️ 1901–1950 为重建/插值结果，非实测

**通用**：明暗主题（默认深色，`?theme=light` 可切）、访问统计（静态托管下走不蒜子，只统计 PV/UV）。

> 纯静态站点，不需要后端。GitHub Pages / Cloudflare Pages / OSS 都能跑。

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
git commit -m "底图与气象数据浏览器"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在仓库 **Settings → Pages** 里把 Source 设为 `main` / `root`。

## 目录结构

```
.
├─ index.html     主页面（底图 / 气象专题）
├─ app.js         瓦片引擎 + 列表 + 时间轴 + 统计栏
├─ theme.js       气象专题：分级设色、年份轴、点击查询
├─ style.css
├─ data.js        底图目录（自动生成，勿手改）
├─ geo/           省/市/县/国界 GeoJSON（JS 变量，按需加载）
├─ data/          气温/降水面板（JS 变量，按需加载）
├─ files/         228 个 .lyr / .lyrx 原件，供下载
├─ stats.js       访问统计 SDK（静态托管下自动关闭）
└─ 说明.md        使用说明与已知问题
```

## 数据与体积

| 项 | 说明 |
|---|---|
| 底图 | 46 + 182 个图层，`.lyr` 原件共约 1.8 MB |
| 边界 | `geo/` 共 6.2 MB（省 231 KB / 市 1.2 MB / 县 4.6 MB） |
| 面板 | `data/` 共 4.2 MB（省 19 KB / 市 209 KB / 县 1.6 MB，按需加载） |
| 县级首次切换 | 约 4.6 MB，会慢一两秒 |

## 访问统计

线上用 **[不蒜子](https://busuanzi.ibruce.info/)** 统计站点访问量：页面右侧显示"本站累计 PV / 独立访客 UV"，按域名分别计数。

- 只统计**页面打开次数**，**不统计下载量**，也没有分图层数据——这些需要后端。
- 数字来自 `busuanzi.ibruce.info`；被广告拦截插件挡住时不会显示。
- 不想用统计：删掉 `index.html` 里那行 `busuanzi.pure.mini.js`。

## 图层来源与署名

瓦片来自各家的公开在线服务，**图层文件是配置，瓦片数据仍受各平台条款约束**：

- Esri World Imagery / Wayback / Topo / Canvas 等：© Esri, Maxar, Earthstar Geographics
- OpenStreetMap 系：© OpenStreetMap contributors（ODbL）
- OpenTopoMap：© OpenTopoMap（CC-BY-SA）
- 高德：© 高德地图（GCJ-02 火星坐标）
- 天地图：已降为"仅下载"（`tk` 绑域名）
- 超图 / 船讯网 / Copernicus WorldCover：© 各自提供方

页面上已保留署名栏，转发或二次发布时请勿删除。

## 非商业用途

本项目用于科研与教学演示（非商用）。不承诺任何第三方瓦片服务的长期可用性；若某天某图层打不开，多半是源站限流或改版。
