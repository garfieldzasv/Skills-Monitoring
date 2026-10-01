# Skills Monitoring · 小队技能监控

ACT + OverlayPlugin 悬浮窗：每个队员一行，和游戏小队列表对齐，显示团减、团辅等关键技能的冷却、充能和持续时间。

技能数据来自游戏客户端（FINAL FANTASY XIV © SQUARE ENIX）。设计说明见 [docs/DESIGN.md](docs/DESIGN.md)。

## 使用

在 OverlayPlugin 里新建一个“自定义悬浮窗”（MiniParse 类型），网址填以下任意一种：

```
https://<用户名>.github.io/<仓库名>/           # GitHub Pages
file:///<解压目录>/index.html                     # 解压发布包后直接用本地文件
```

发布包 `skills-monitoring-v*.zip` 解压后就是完整的站点，包括图标，不需要网络，也不需要本地服务器。

悬浮窗只显示技能图标。解锁时会显示一圈虚线边框，方便调整窗口大小。

- **设置页**：在悬浮窗上**右键**打开。设置保存在 ACT 内置浏览器的 localStorage 里，所以**不要用系统浏览器打开设置页**，那边的修改传不到 ACT 里的悬浮窗。需要在两边之间搬运设置时，用“导入导出”。
- **对齐**：解锁悬浮窗，在设置页“布局”里勾选“显示校准网格”，调整“行距”和偏移，直到 8 条色带和游戏小队列表的 8 格重合。行距 = 游戏里第 1 人到第 8 人的距离 ÷ 7。没有小队时，解锁后会自动显示演示小队。
- **排序**：在设置页的“小队排序”里，照游戏的“小队列表排序”设置好三套预设。个别对不上时（比如同职业），在同一页上方的“当前小队的顺序”里上下调整，会按当前小队记住。
- **换地址会丢设置**：GitHub Pages 地址和本地文件地址的 localStorage 互相独立。换地址前先导出设置，换完再导入。布局需要重新校准。
- **多个悬浮窗**：网址加 `?profile=left` 这类参数，每个悬浮窗使用独立的布局。
- 锁定后悬浮窗没有任何点击交互，可以在 OverlayPlugin 里开启鼠标穿透。

## 开发

```bash
pnpm install
pnpm copy-icons          # 从本机解包复制图标到 public/icons/（脚本和图标都只在本机，不在仓库里）
pnpm dev                 # 浏览器打开 http://localhost:5173/?demo=1 使用演示小队
pnpm test                # 核心逻辑单元测试
pnpm typecheck
```

在普通浏览器里连接真实的 ACT：网址加 `?OVERLAY_WS=ws://127.0.0.1:10501/ws`（需在 OverlayPlugin 里开启 WebSocket 服务）。

### 更新游戏数据

```bash
pnpm import-data                                  # 默认取最新版本
pnpm import-data --xivapi 7.56x1 --cn <commit>    # 指定版本
```

从游戏客户端数据生成 `src/data/generated/actions.json`：数值来自 [XIVAPI](https://v2.xivapi.com)（国际服），中文名和带等级宏的技能说明来自 [ffxiv-datamining-cn](https://github.com/thewakingsands/ffxiv-datamining-cn)（国服）。按等级变化的冷却、充能、持续时间从技能说明和特性说明推导，规则见 [DESIGN.md §5.1](docs/DESIGN.md)。脚本会打印和上次结果的差异，遇到处理不了的情况会列出来并停止，不写文件。

### 发布

```bash
pnpm release                          # 复制图标 → 测试 → 构建 → release/skills-monitoring-v<版本>.zip
pnpm release --publish --repo owner/name   # 同时创建 GitHub Release（需要 gh CLI）
```

Release 发布后，`.github/workflows/deploy.yml` 会下载发布包并部署到 GitHub Pages（仓库设置里 Pages 的来源选 GitHub Actions）。图标只存在于发布包里，不进 git。

## 目录

| 路径          | 内容                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| `src/core/` | 纯 TypeScript 核心逻辑，不依赖 Vue：日志解析、冷却状态机、小队排序、设置、引擎 |
| `src/app/`  | Vue 界面：悬浮窗、设置页                                                       |
| `src/data/` | 生成的游戏数据 + 手写的默认配置                                                |
| `scripts/`  | 数据导入、复制图标、发布                                                       |
| `tests/`    | 单元测试                                                                       |
