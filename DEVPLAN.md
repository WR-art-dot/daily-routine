# 开发计划 · 个人工作生活 App v1

依据：`PRD.md` v1.0（2026-10-30）。本文件可直接照着干活，每个阶段有明确的产出文件与完成判据。

---

## 1. 技术选型与硬约束

### 1.1 选型

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | 原生 JavaScript（ES2022），ES Modules | 无需构建、无需依赖、改完刷新即见 |
| 框架 | 无。手写 DOM + 一个 20 行的 `h()` 帮助函数 | 页面只有九个，引框架的收益低于心智负担 |
| 样式 | 原生 CSS，CSS 变量做主题，无预处理器 | 免编译，深色模式只需换一组变量 |
| 存储 | IndexedDB | PRD 7.1 已定，容量与结构化查询都够 |
| 图标 | 内联 SVG `<symbol>` 精灵图 | 不引入图标库 |
| 字体 | 系统字体栈 | 无外链，断网可用 |
| 依赖 | **零 runtime 依赖，零 CDN** | 断网、无网络环境都必须能用 |

不引入 npm 包、不引入 TypeScript、不做打包。代价是没有类型检查与热更新，收益是整个项目就是一堆能被浏览器直接读的文件，五年后打开还能跑。

### 1.2 五条硬约束

1. **必须走本地 HTTP，不能双击 `index.html`。** Chrome 对 `file://` 源不开放 IndexedDB，直接打开会报 `SecurityError`。这是整个方案的地基。
2. **端口必须固定 `8787`，用 `127.0.0.1` 不用 `localhost`。** IndexedDB 按源隔离，端口变了或换了主机名，数据看起来就"消失"了。`http://127.0.0.1:8787` 是一个稳定的源。
3. **不联网、不发请求。** 代码里不出现 `fetch` 到外部地址、不引外链字体与脚本。
4. **只支持 Chrome / Edge 最新版。** 用到 `crypto.randomUUID`、`structuredClone`、`showOpenFilePicker` 的可选降级（用 `<input type=file>`）。
5. **数据只在本机。** 任何"上传"字样都不出现。

### 1.3 已验证的本机环境

```
python 3.13.14   → C:\Users\86186\AppData\Local\... / D:\develop\python\python.exe
node   v22.22.2  → D:\develop\node\node.exe
```

两者都在，启动脚本优先用 python，找不到再用 node 兜底。

---

## 2. 启动方式

Windows 下双击项目根目录的 `start.cmd`。脚本只做三件事：切到脚本所在目录、找到 node（找不到退回 python）、把窗口交给服务器前台运行。

```bat
@echo off
setlocal
title lifeapp  -  http://127.0.0.1:8787/
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 goto :usenode
...
:usenode
node serve.js
```

打开浏览器的职责**不在** `.cmd` 里，而在 `serve.js` 的 `listening` 回调里。这个顺序不能反：先开浏览器再起服务，浏览器那一瞬间会拿到 `ERR_CONNECTION_REFUSED`，用户看到的是错误页而不是应用。`openBrowser()` 用 `cmd /c start "" <url>`（win32）、`open`（darwin）、`xdg-open`（linux），失败吞掉不抛错——打不开浏览器不影响服务本身。

`serve.js` 承担：MIME 表、`Cache-Control: no-store`、`safePath()` 防目录穿越、SPA fallback 到 `index.html`、`EADDRINUSE` 时不报错（说明服务已在跑，直接开浏览器后退出）、`--no-open` 关闭自动开窗。**不打印逐条请求日志**，否则窗口滚起来像一堆乱码代码。

端口固定 8787，不静默换端口（换端口等于换数据源）。占用检测不再用 `netstat` 正则匹配，交给 `server.on('error')` 判断 `EADDRINUSE`，少一层脆弱的外部命令。

脚本文件必须 CRLF 换行、纯 ASCII 内容。LF 换行在多数机器上仍能跑，但 `if (...)` 块与 `goto` 标签是已知的踩雷点；中文提示语会让 `cmd` 的 GBK 代码页显示成乱码，提示一律英文。

---

## 3. 目录结构

```
D:\飞书\APP\
├─ PRD.md
├─ DEVPLAN.md
├─ design\ui-spec.html
├─ index.html                 应用外壳
├─ start.cmd                  启动脚本
├─ serve.js                   node 兜底服务器
├─ css\
│  ├─ tokens.css              颜色变量、间距、圆角、字号（浅/深两套）
│  ├─ base.css                重置、排版、滚动条、焦点环
│  ├─ components.css          按钮、输入、chip、卡、抽屉、toast、空状态
│  └─ pages.css               各页专有布局
├─ js\
│  ├─ app.js                  启动、装配
│  ├─ core\
│  │  ├─ db.js                IndexedDB 封装
│  │  ├─ schema.js            仓库定义、字段默认值、版本号
│  │  ├─ save.js              保存状态点、写入队列、autosave
│  │  ├─ router.js            hash 路由
│  │  ├─ backup.js            导出、校验、导入
│  │  ├─ settings.js          设置读写与订阅
│  │  ├─ summary.js           首页六卡摘要查询
│  │  ├─ dates.js             日期工具（今天、本周、相对天数）
│  │  └─ undo.js              删除快照与撤销栈
│  ├─ ui\
│  │  ├─ el.js                h()、mount()、text 安全插入
│  │  ├─ toast.js             提示条 + 撤销
│  │  ├─ drawer.js            右侧抽屉
│  │  ├─ modal.js             确认框（只给导入与清空用）
│  │  ├─ empty.js             空状态
│  │  ├─ inline.js            行内文本/数字/日期编辑
│  │  ├─ dnd.js               指针拖拽排序（含跨列）
│  │  ├─ chart.js             折线、进度条、热力图
│  │  └─ keys.js              全局键位
│  └─ views\
│     ├─ home.js  today.js  media.js  dev.js  study.js
│     ├─ fitness.js  food.js  play.js  settings.js
└─ docs\
   └─ qa-checklist.md         验收清单（P6 生成，对齐 AC-01～38）
```

---

## 4. 数据层契约

### 4.1 仓库与前缀索引

`js/core/schema.js` 导出 `DB_NAME='lifeapp'`、`DB_VERSION=1`、`STORES`。

| 仓库 | keyPath | 索引 |
|---|---|---|
| plan | id | by_date(date)、by_module(module) |
| memos | id | by_createdAt(createdAt) |
| media | id | by_status(status)、by_plannedDate(plannedDate) |
| projects | id | by_status(status) |
| devTasks | id | by_project(projectId) |
| bugs | id | by_project(projectId)、by_status(status) |
| releases | id | by_project(projectId) |
| devLogs | id | by_project(projectId)、by_date(date) |
| refs | id | by_status(status)、by_year(year) |
| events | id | by_datetime(datetime) |
| outputs | id | by_kind(kind) |
| exercises | id | by_part(part) |
| workouts | id | by_date(date) |
| foods | id | by_name(name) |
| meals | id | by_date(date) |
| weights | id | by_date(date) |
| wishes | id | by_status(status) |
| settings | key | —（键值对，非 id） |

### 4.2 `db.js` 对外接口

```js
open()                                   // 建库、建索引，返回 db
get(store, id)
all(store)
byIndex(store, index, value, {limit})
put(store, rec)                          // 自动补 id / createdAt / updatedAt
putMany(store, recs)                     // 单事务批量
del(store, id)
delMany(store, ids)
count(store)
countByIndex(store, index, value)
clearStore(store)
tx(storeNames, mode, fn)                 // 低层事务，fn 内不得 await 非 IDB 操作
```

规则：`put` 一律走写入队列串行执行；`id` 用 `crypto.randomUUID()`；`updatedAt` 用 `Date.now()` 数字时间戳，便于比较大小。

### 4.3 写入与保存状态

- UI 层改动一律调用 `save.commit(fn)`，内部 400ms debounce，`blur` 与 `beforeunload` 时 flush。
- `save.js` 维护 `.pending` 计数与订阅者，状态点三态：`idle`（半透明）、`saving`（灰脉冲）、`error`（红）。
- 事务提交成功才转绿并 1 秒淡出，与 AC-07 对齐。

### 4.4 备份

```js
exportAll()                     // → {app:'lifeapp', schema:1, exportedAt, data:{store:[...]}}
validate(payload)              // → {ok:true} | {ok:false, reason:'...'}
importAll(payload, mode)       // mode: 'merge' | 'replace'
```

- `validate` 检查：`app` 与 `schema` 字段、仓库名白名单、每条记录有 `id`（settings 用 `key`）、日期字段格式。
- `merge`：按 `id` 去重，冲突取 `updatedAt` 大的。
- `replace`：先 `exportAll()` 触发一次下载作为安全网，再清空再写入。
- 失败一律整份拒绝，不写半截（AC-10）。

---

## 5. 应用骨架

### 5.1 `index.html`

```html
<div id="app">
  <nav class="rail"><!-- 8 个入口 + 底部设置 --></nav>
  <header class="topbar"><!-- 页面名 / 次要信息 / 搜索 / 状态点 --></header>
  <main id="view"></main>
</div>
<svg hidden><!-- symbol 精灵图 --></svg>
```

`html` 上挂 `data-theme="light|dark"`。所有脚本 `type="module"`，入口 `js/app.js`。

### 5.2 视图契约

每个 `views/*.js` 导出：

```js
export default {
  async render(root, ctx) {},   // ctx: {params, query, navigate}
  destroy() {}                  // 清定时器、解绑监听、销毁抽屉
}
```

路由切换时先调旧视图的 `destroy()` 再渲染新视图，避免监听器泄漏。

### 5.3 路由

```js
parse('#/dev/p_123/bug') → {view:'dev', params:{projectId:'p_123', tab:'bug'}, query:{}}
navigate(path, {replace:false})
```

规则：识别不了的路由回落到 `#/home`；切页只做 120ms 淡入；同一会话内按 `path` 记住 `#view` 的 `scrollTop`。

### 5.4 主题

三态：`auto`（`prefers-color-scheme`）、`light`、`dark`。切换写 `settings.theme`，同时更新 `data-theme` 与 `<meta name="color-scheme">`。

---

## 6. 通用交互原语

这七个组件被八个页面反复用，必须先做完再铺页面，否则会各写各的。

| 原语 | 文件 | 关键点 |
|---|---|---|
| 行内新增 | `ui/inline.js` | 列表末行永久存在；回车提交后清空并保持焦点；`e.isComposing` 为真时不提交（中文输入法选词会触发回车） |
| 行内编辑 | `ui/inline.js` | 点击文字变输入框；`Enter` 存、`Esc` 还原、失焦存 |
| 删除 + 撤销 | `ui/toast.js` + `core/undo.js` | 删除前把整条记录压栈，5 秒内可 `put` 回去；栈深 10 |
| 拖拽排序 | `ui/dnd.js` | pointer 事件，4px 阈值区分点击与拖拽；拖动时用 `transform` 位移，落位靠中点判断；跨列用 `elementFromPoint` |
| 抽屉 | `ui/drawer.js` | 右侧 480px，`Esc` 关闭，背景遮罩点击关闭，打开时焦点移入 |
| 空状态 | `ui/empty.js` | 一句话 + 一个主按钮，八个页面统一 |
| 图表 | `ui/chart.js` | 折线（含缺值断线）、进度条、12 周热力图，纯 SVG，不引库 |

---

## 7. 阶段划分

| 阶段 | 目标 | 依赖 | 覆盖验收 |
|---|---|---|---|
| P0 | 能跑起来的空壳 | — | AC-01 02 03 12 14 15 |
| P1 | 数据存得住、导得出、进得来 | P0 | AC-04 07 08 09 10 11 |
| P2 | 今日计划与备忘（引用层地基） | P1 | AC-06 29 31 32 33 |
| P3 | 首页接真实数据 | P2 | AC-13 26 36 |
| P4 | 三个内容型模块 | P1、P2 | AC-16 17 18 19 |
| P5 | 三个记录型模块 | P1、P2 | AC-20 21 22 23 24 25 30 |
| P6 | 收口与全量验收 | P0–P5 | AC-27 28 34 35 37 38 |

顺序的理由：**先把数据和备份做完**，后面每改一处都能导出比对自己会不会把旧数据搞坏；**今日计划先于所有模块**，它是引用层的宿主，模块做完才有东西可拉；**首页放在 P3 而不是最后**，因为它的六个摘要卡可以先用空实现占位，等模块做完只换查询函数，不用重排版。

---

## 8. 各阶段任务明细

### P0 · 空壳（约 8 个文件）

1. 建目录、`git init`、`.gitignore`（忽略 `.npm-cache`、`node_modules`）。
2. `start.cmd` + `serve.js`，验证 `http://127.0.0.1:8787/` 能打开目录。
3. `index.html`：三区骨架、九路由占位视图、SVG 精灵图（9 个图标：home/today/media/dev/study/fitness/food/play/settings）。
4. `css/tokens.css`：14 个颜色变量 ×2 套、8 个模块色、间距刻度、圆角、字号。
5. `css/base.css`：重置、系统字体栈、焦点环、`::selection`、滚动条。
6. `js/core/db.js` + `schema.js`：`open()` 建库建索引；DevTools → Application → IndexedDB 里能看到 18 个仓库。
7. `js/core/router.js` + `js/app.js`：路由表、导航高亮、视图挂载与销毁、九个空视图各显示一句占位。
8. `js/ui/toast.js`、`drawer.js`、`modal.js`、`empty.js`、`el.js` 基础件。
9. 主题切换接上（设置页先只有这一项）。

**完成判据**：九个页面点得开、地址栏 hash 对得上、刷新停在原页、深浅两套都没有白底黑字残留。

### P1 · 数据闭环

1. `db.js` 补全 12 个方法，`put` 走串行队列。
2. `core/save.js`：`commit()`、pending 计数、状态点三态、`beforeunload` flush。
3. `core/backup.js`：`exportAll` / `validate` / `importAll`，替换前自动下载安全副本。
4. `views/settings.js` 四分区：数据（导出、导入、最近导出时间）、条目数、目标、词库计数。
5. 清空单模块：模态框要求手打模块中文名。
6. 一个临时调试面板（`?debug=1` 才显示）：一键生成 20 条假数据，用来验证导出导入。

**完成判据**：造假数据 → 导出 → 清空 → 导入 → 条目数一致；故意改坏 JSON 的 `schema` 字段，导入被拒且原数据未动。

### P2 · 今日计划与备忘

1. `views/today.js` 列表：行内新增、勾选、拖拽、备注、筛选、日期切换。
2. 备忘区：新增、转任务、删除、归档。
3. 右栏三块：昨天遗留、从模块拉取、负荷条。拉取层先写接口 `getPullable(date)`，P4/P5 往里填实现。
4. `core/undo.js` 接上，删除给 5 秒撤销。
5. 空状态：今天没任务时给「安排今天」。

**完成判据**：新增 30 条不卡；拖拽改顺序刷新后保持；勾选后刷新仍是勾选态；删一条能撤销回来。

### P3 · 首页

1. `core/summary.js`：六个函数 `summaryMedia()` 等，先返回 `null`。
2. `views/home.js`：日期条、完成度、计划块（复用 today 的行渲染）、备忘块、六卡网格。
3. 六卡按 PRD 3.4 的两行结构实现，空数据时卡内显示引导语句。
4. 跨天提示：`settings.lastVisitDate` 与今天比较。
5. 卡片拖动排序与显隐存 `settings.homeCards`。

**完成判据**：首页勾选与今日计划双向同步；1440×900 不滚动；六卡在无数据时也不塌陷。

### P4 · 内容型三模块

**自媒体**：四列看板、拖拽换列、`statusHistory` 记录、已发布行内表单、480px 抽屉写稿、字数统计、平台筛选。

**开发**：左项目列表 + 右四标签页、任务三组、Bug 表与展开态记忆、版本里程碑、追加式日志、切项目保持标签、bug 徽标。

**学习**：14 天日程条、文献表（筛选排序搜索）、状态三态循环与进度联动、笔记面板、输出物全屏编辑。

**完成判据**：对应 AC-16～19。每个模块做完立刻回 P3 的 `summary.js` 填一个函数，首页那张卡就活了。

### P5 · 记录型三模块

**运动**：训练卡堆叠、动作库搜索与新建、Tab 键推进录入、上次重量提示、单动作曲线、12 周热力图、本周与连续周数。

**饮食**：日期条、四餐分栏、贴列搜索面板（非模态）、份量换算、营养三条横条、体重卡与 7 日趋势、「称一下」入口。

**娱乐**：卡片流、状态循环、钉本周上限 3、随机抽（仅 `want`）、归档折叠。

**完成判据**：对应 AC-20～25、AC-30。填完 `summary.js` 剩余三个函数。

### P6 · 收口

1. 引用层收尾：来源状态标记、来源删除转快照（AC-27、28）。
2. `⌘K` 全局搜索：只搜任务、文献、选题、bug、心愿五类标题，结果分组，键盘上下选。
3. 键位：`1`–`8`、`N`、`Esc`、`⌘Z`，输入框内屏蔽（AC-35）。
4. 全部空状态扫一遍（AC-34）。
5. 性能：列表超过 200 条时分段渲染，滚动到底再追加；1000 条压测（AC-38）。
6. 生成 `docs/qa-checklist.md`，把 AC-01～38 逐条转成可勾选的检查项。
7. 全量回归 + 深色模式逐页看一遍。

---

## 9. 已知技术坑

| 坑 | 现象 | 处理 |
|---|---|---|
| `file://` 无 IndexedDB | 双击打开报 `SecurityError` | 只用 `start.cmd` 启动，`index.html` 顶部加一行脚本检测 `location.protocol === 'file:'` 并给出提示页 |
| 端口变了像丢数据 | 换端口后所有模块空了 | 端口写死 8787，被占用就报错退出 |
| `localhost` 与 `127.0.0.1` 是两个源 | 浏览器地址栏输 `localhost:8787` 看不到数据 | 启动脚本直接开 `127.0.0.1`，并在提示页说明 |
| 中文输入法回车误提交 | 选词时按回车就把半截拼音存进去了 | 所有回车提交判 `e.isComposing \|\| e.keyCode === 229` |
| IndexedDB 事务自动关闭 | 在事务回调里 `await` 别的异步操作，事务已失效 | 事务内只做 IDB 操作，业务逻辑放在事务外 |
| 拖拽误触发点击 | 想拖动结果打开了详情 | 4px 位移阈值，超过才算拖拽 |
| 跨天不刷新 | 页面开着过夜，日期还停在昨天 | 每分钟检查一次 `new Date().toDateString()`，变了就重渲当前视图 |
| 大批量写入慢 | 逐条 `put` 一千条要好几秒 | 统一用 `putMany` 单事务 |
| `crypto.randomUUID` 在非安全上下文缺失 | 旧浏览器报 undefined | `http://127.0.0.1` 属安全上下文，正常可用；仍加一个 `Math.random` 兜底 |
| 深色模式漏改 | 某个卡片硬编码白底 | 颜色一律走变量，代码里禁止出现 `#fff` 之类的字面色值（图表除外） |

---

## 10. 代码规范

- 单文件不超过 400 行，超了就拆。
- 命名：仓库名与 PRD 字段名完全一致（`plannedDate`、`estimateMin`），不另起别名，避免两头对不上。
- 每个 `views/*.js` 顶部一行注释写清「这个页面读哪些仓库、写哪些仓库」。
- 颜色不写字面值；间距只用 `--sp-1`～`--sp-6`；圆角只用 `--r-1`～`--r-3`。
- 事件监听一律在 `destroy()` 里解绑，或用 `AbortController` 统一 `abort()`。
- 提交信息按阶段：`P2: 今日计划拖拽排序`。

---

## 11. 验收方式

1. P0 起每阶段结束手动跑对应 AC，跑不过不进入下一阶段。
2. P6 生成 `docs/qa-checklist.md`，格式：

```
- [ ] AC-04 新增任务后刷新仍在
      步骤：今日计划 → 底部输入"测试"回车 → 等 1 秒 → F5
      预期：列表第一行仍是"测试"，勾选框未选中
```

3. 回归必须包含：清一次浏览器站点数据 → 用导出的 JSON 恢复 → 九个页面数据完整。
4. 最后跑一遍 1000 条压测，记录首页、今日计划、饮食页三处的打开耗时。

---

## 12. 交付物

| 文件 | 说明 |
|---|---|
| `index.html` + `css/` + `js/` | 应用本体，双击 `start.cmd` 运行 |
| `start.cmd`、`serve.js` | 启动与兜底服务器 |
| `PRD.md` | 需求依据 |
| `DEVPLAN.md` | 本文件 |
| `design/ui-spec.html` | 结构线框与交互说明 |
| `docs/qa-checklist.md` | 38 条验收清单（P6 产出） |
| 一份示例导出 `lifeapp-2026-XX-XX.json` | 首次跑通后留一份，作为恢复演练素材 |
