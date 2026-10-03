# 小队技能监控悬浮窗 设计文档

> 状态：M1~M5 已实现；M6（职业资源追踪器）只定义了接口，尚未实现
> 最后更新：2026-10-02

## 1. 背景与目标

在 ACT + OverlayPlugin 环境下，做一个叠在游戏小队列表旁边的悬浮窗：**每个队员一行，行位置和游戏小队列表对齐**，显示该队员关键技能的冷却、充能和持续状态。

### 目标

1. 按队员分行，排序能和游戏小队列表一致：
   - 自己置顶（可关）；
   - 职能之间的顺序可以自定义（不限于坦克、治疗、输出）；
   - 按自己当前的职能切换排序预设；
   - 能手动调整行顺序，用于修正同职业、掉线重连等规则算不准的情况。
2. 布局可以独立调整：图标尺寸、行距、图标间距、起始偏移、排列方向，并提供校准模式。
3. 冷却模型正确：单次冷却、充能（串行恢复）、持续时间，以及职业资源导致的冷却缩短。
4. 核心逻辑不依赖 UI 框架，可以单独测试。
5. 技能数据来自游戏客户端，图标随站点发布，运行时不联网。

### 非目标

- 不读取游戏内存。小队显示顺序、真实冷却这些 ACT 拿不到的数据，一律不做。
- 不做 PvP。
- 暂不做多语言。技能名只用简体中文数据。
- 不支持驯兽师（ClassJob 43）和青魔法师（ClassJob 36）。它们基本不参与正常副本攻略，推迟处理。
- 不做“点击技能发送到小队频道”，也不做点击复制。悬浮窗锁定后可以设为鼠标穿透。

---

## 2. 功能清单与设计原则

### 2.1 功能清单

| 功能 | 说明 |
|---|---|
| 事件接入 | 监听小队、主角色、换区、日志行（第 6 节） |
| 技能槽 | 每个职业配置若干技能槽，基础职业沿用进阶职业的配置（5.3） |
| 释放识别 | 21/22 行，AOE 只取第一个目标（6.3） |
| 升级与共享复唱 | 低级版本和升级后的版本、共享复唱的技能对上同一个监视项（7.1） |
| 按等级显示 | 队员没学会的技能显示为不可用（灰色）；冷却、充能、持续时间、图标按队员等级取值（5.1） |
| 冷却显示 | 冷却倒计时、扫光遮罩、充能层数、效果持续时间（第 11 节） |
| 职业资源（M6） | 骑士忠义、暗骑 MP、学者以太超流和秘策、贤者蛇胆、白魔百合、绘灵涂层破盾减冷却（第 8 节） |
| 重置 | 团灭（33 行 `4000000F` / `40000010`）或换区时全部回到就绪 |
| 小队排序 | 自定义职能和职业顺序、三套预设、手动调整（第 9 节） |
| 布局与校准 | 图标尺寸、行距、间距、偏移、方向，校准网格（第 10 节） |
| 设置页 | 拖动排序、技能选择器、技能参数覆盖、导入导出、恢复默认（11.2） |
| 演示模式 | 悬浮窗未锁定时显示演示小队，可模拟全部释放（10.2） |
| 语音播报 | 监视的技能释放时，通过 ACT 的 TTS 播报；可选播报内容，每个技能槽单独开关（11.4） |

### 2.2 设计原则

1. **单一冷却状态。** 每个队员的每个复唱计时器只有一份状态，所有修改（释放、缩短、重置）都通过同一个状态机（第 7 节）。
2. **和游戏一致的冷却模型。** 充能串行恢复：一层恢复后，下一层才开始计时；后续释放只减层数，不影响正在恢复的那一层。
3. **核心逻辑和界面分离。** `core/` 是纯 TypeScript，不依赖 Vue，可以单独测试；模块按职责拆小。
4. **数据来自游戏，构建时生成。** 技能数据由脚本从游戏客户端数据生成并提交到仓库（5.1），运行时不请求任何接口，也没有多层缓存。
5. **不执行字符串代码。** 按等级变化的值用声明式的分段数组表示（`LevelValue`），导入的设置只做校验，不执行。
6. **排序和布局可配置。** 职能顺序、职业顺序、同职业规则都可以设置，算不准时用手动顺序修正；布局参数全部可调，不用 `zoom` 整体缩放。
7. **没有外部热链。** 图标、冷却遮罩、日志字段表都自带，不依赖其他站点或子模块。
8. **事件驱动的渲染。** 不按帧重算状态：遮罩交给 CSS 动画，倒计时文字只在有冷却时由共享时钟刷新（3.3、11.1）。

---

## 3. 技术选型

### 3.1 约束

- **运行环境**：OverlayPlugin 内嵌的 CEF（Chromium），同时要能在普通浏览器里打开调试。
- **渲染量很小**：最多 8 行，每行 5~8 个图标，也就是 40~64 个元素。倒计时文字每秒变一次。
- **设置页比悬浮窗复杂**：有表单、拖动排序列表、技能搜索选择器、导入导出。

### 3.2 候选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| **Vue 3 + Vite**（推荐） | 模板和响应式适合设置页这种表单较多的界面；生态成熟 | 运行时约 35KB（gzip），对这个规模没有实际影响 |
| Svelte 5 + Vite | 编译期响应式，产物最小，写法简洁 | 拖动排序这类库的适配没有 Vue 丰富 |
| SolidJS + Vite | 细粒度更新，性能最好 | 生态较小；在这个渲染量下性能优势用不上 |
| Preact + Signals | 体积小，React 生态 | 表单较多的设置页写起来比 Vue 繁琐 |
| 原生 TS + Web Components | 零运行时依赖 | 设置页要手写大量 DOM 更新代码，维护成本高 |

构建工具方面，Vite 是目前的标准选择，Rsbuild 等方案在这里没有明显优势。

### 3.3 结论

**选 Vue 3 + Vite + TypeScript。**

这个项目的性能瓶颈不在框架，而在渲染方式：如果按帧（比如每 33ms）让响应式系统重算所有技能状态，开销才会明显。本设计改为：

- **冷却遮罩用 CSS 动画驱动**：释放时写入开始时间和总时长，用 `animation-delay: -已过时间` 让浏览器自己播放扫光，不需要每帧更新数据；
- **倒计时文字用一个共享的 250ms 时钟**，只有正在冷却的图标会订阅它；所有技能都就绪时时钟自动停止，空闲时没有任何定时任务。

这样即使换成 Svelte 或 Solid，也拿不到可感知的收益。另外，核心逻辑放在 `core/`，是纯 TypeScript，不依赖 Vue。以后真要换框架，只需要重写界面层。

### 3.4 依赖清单

| 类型 | 选择 | 说明 |
|---|---|---|
| 框架 | `vue` 3 | |
| 路由 | `vue-router`（hash 模式） | 只有悬浮窗和设置两页，OverlayPlugin 加载的是静态文件 |
| 拖动排序 | `vue-draggable-plus`（SortableJS） | 设置页职业排序、技能槽排序 |
| 状态 | 不引入 Pinia | 用 composable 加模块级 `reactive`，规模不需要全局 store 框架 |
| UI 组件库 | 不引入 | 设置页控件不多，手写 CSS，避免 Element Plus 的体积和样式覆盖问题 |
| 测试 | `vitest` | 只测 `core/` |
| 代码规范 | ESLint + Prettier | |
| 包管理 | pnpm | |

---

## 4. 总体架构

### 4.1 分层

```
┌──────────────────────────────────────────────────────────────┐
│ UI 层（Vue）                                                   │
│   OverlayPage  ── MemberRow ── SkillIcon                      │
│   SettingsPage ── JobOrderEditor / SkillSlotEditor / ...       │
├──────────────────────────────────────────────────────────────┤
│ 应用层（composables）                                           │
│   useOverlayBridge  useSettings  useMonitor  useTicker         │
├──────────────────────────────────────────────────────────────┤
│ 核心层 core/（纯 TS，不依赖 Vue，可单测）                         │
│   overlay/   OverlayPlugin 接口封装、事件类型                   │
│   logline/   日志行解析 → 结构化事件                            │
│   game/      职业表、技能数据查询、升级链、复唱组、图标路径       │
│   cooldown/  冷却与充能状态机                                   │
│   gauges/    职业资源追踪器                                     │
│   party/     小队排序（规则 + 手动覆盖）                         │
│   settings/  设置结构、默认值、校验、版本迁移、导入导出           │
├──────────────────────────────────────────────────────────────┤
│ 数据层 data/                                                    │
│   generated/actions.json（由游戏数据生成，提交到仓库）            │
│   defaultWatchActions.ts  shownDuration.ts（手写的默认配置）     │
│   public/icons/（从本机解包资源复制的子集）                       │
└──────────────────────────────────────────────────────────────┘
```

数据流是单向的：

```
OverlayPlugin 事件
   │
   ├─ PartyChanged / ChangePrimaryPlayer ──▶ 小队状态 ──▶ party.sort() ──▶ 成员行
   │
   └─ LogLine ──▶ logline.parse() ──▶ GameEvent
                                        ├─▶ cooldown.onEvent()   （释放、团灭）
                                        └─▶ gauges.onEvent()     （资源；可以回调 cooldown.adjust）
                                                    │
                        UI 读取：cooldown.getView(owner, action, now)
                                 gauges.getView(owner, action, now)
```

### 4.2 目录结构

```
.
├── docs/
│   └── DESIGN.md
├── .github/
│   └── workflows/
│       └── deploy.yml            # Release 发布时，下载附件并部署到 GitHub Pages
├── scripts/
│   ├── import-game-data.ts       # 从游戏数据生成 data/generated/actions.json
│   ├── game-data/                # 下载与缓存、说明宏求值、特性文本解析
│   ├── copy-icons.ts             # 从本机解包资源复制用到的图标（只在本机，不提交）
│   └── release.ts                # 复制图标 → 测试 → 构建 → 打包 → 创建 Release
├── public/
│   └── icons/                    # 复制出来的图标子集，路径结构和解包一致（不提交）
├── src/
│   ├── core/
│   │   ├── overlay/
│   │   │   ├── overlayApi.ts     # 订阅 OverlayPlugin 事件（内嵌 / WebSocket 两种模式）
│   │   │   └── events.ts         # PartyChanged、LogLine 等事件类型
│   │   ├── logline/
│   │   │   ├── fields.ts         # 各行字段索引（参考 cactbot netlog_defs）
│   │   │   └── parse.ts          # string[] → GameEvent
│   │   ├── engine/
│   │   │   ├── monitorEngine.ts  # 小队 + 设置 → 显示行；日志行 → 冷却
│   │   │   └── demoParty.ts      # 演示小队
│   │   ├── game/
│   │   │   ├── jobs.ts           # 职业表：ID、简称、中文名、职能、基础职业、图标
│   │   │   ├── actions.ts        # 技能查询：名称、图标、冷却、充能、等级、所属职业
│   │   │   ├── upgrades.ts       # 升级链、按等级选版本、复唱组键
│   │   │   ├── skillMeta.ts      # 按队员的职业和等级解析技能槽
│   │   │   ├── levelValue.ts     # 按等级取值（替代字符串函数）
│   │   │   └── icons.ts          # 图标 ID → 路径
│   │   ├── cooldown/
│   │   │   └── cooldownTracker.ts
│   │   ├── gauges/
│   │   │   ├── types.ts
│   │   │   ├── gaugeManager.ts
│   │   │   └── jobs/             # paladin.ts darkKnight.ts scholar.ts sage.ts whiteMage.ts pictomancer.ts
│   │   ├── party/
│   │   │   └── sortParty.ts
│   │   └── settings/
│   │       ├── schema.ts         # 类型 + 默认值
│   │       ├── validate.ts       # 校验与修正
│   │       ├── migrate.ts        # 版本迁移
│   │       └── transfer.ts       # 导入导出
│   ├── data/                     # 生成的数据 + 手写的默认配置
│   ├── app/
│   │   ├── composables/
│   │   ├── components/
│   │   └── pages/
│   │       ├── OverlayPage.vue
│   │       └── SettingsPage.vue
│   └── main.ts
├── tests/                        # 对应 core/ 的单元测试
├── LICENSE                       # MIT
└── README.md
```

---

## 5. 数据层

### 5.1 技能数据 `data/generated/actions.json`

**来源**：游戏客户端数据，不依赖任何第三方整理的技能表。用了两份客户端导出：

| 来源 | 用途 |
|---|---|
| [XIVAPI](https://v2.xivapi.com)：国际服客户端的表，列名由 EXDSchema 维护，按版本锁定 | 全部结构和数值：Action（图标、ClassJob、ClassJobCategory、习得等级、Recast100ms、CooldownGroup、MaxCharges）、ClassJobCategory、Trait 和特性说明、技能英文说明 |
| [thewakingsands/ffxiv-datamining-cn](https://github.com/thewakingsands/ffxiv-datamining-cn)：国服客户端的 SaintCoinach 导出，按 commit 锁定 | 中文字符串：技能名，以及带等级宏的技能说明（XIVAPI 会把宏渲染掉）；另外是游戏技能列表用的 ClassJobActionUI（XIVAPI 的 schema 没有给这张表定义列）。它的 CSV 表头和实际的列错位，所以按原始列号读取 |

国际服和国服版本同步。脚本对每个技能比对两边的图标和习得等级，不一致就停止，以此保证中文名确实属于同一行。

**每个字段怎么来**：

| 字段 | 推导 |
|---|---|
| `name` | 国服 Action 的名称 |
| `icon` `jobs` `level` | Action.Icon；ClassJobCategory 里勾选的职业（含基础职业）；ClassJobLevel |
| `recastGroup` | Action.CooldownGroup，是公共复唱（58）时取 AdditionalCooldownGroup。复唱组相同的技能在游戏里共用一个计时器：升级链的各级、失血箭和死亡箭雨、各种构想 |
| `recast` | Recast100ms，再叠加特性说明里的 “Reduces X recast time to N seconds”，从特性的等级起生效。“by N seconds upon …” 这类战斗中的条件缩短不算数据 |
| `charges` | 把国服技能说明里的宏按职业和等级求值，取“积蓄次数”；没有就用 MaxCharges。再和特性说明的 “Maximum Charges: N” / “Allows a third charge of X” 交叉核对，不一致就停止 |
| `durations` | 同样求值后，说明里出现的全部“持续时间”，按出现顺序 |
| `upgradesTo` | 特性说明的 “Upgrades X to Y” 各种写法。排除状态期间的临时替换（升级后的技能写着“无法设置到热键栏”而原技能可以，比如血乱期间的血溅 → 血红乱），以及宠物、分身执行的技能 |
| `listed` | 是否出现在游戏的「技能与特性」列表里：ClassJobActionUI（每个职业一行，每个技能一个子行）列出的职业技能，加上职能技能（Action.IsRoleAction，在列表的职能技能页）。单色~四色技巧舞步结束、结印和忍术的变体、宝石耀的各色变体这类只由游戏替换出来的动作不在列表里。技能选择器只列 `listed` 的技能 |
| `replaces` | ActionIndirection：战斗中顶替另一个按钮、自身没有复唱计时器的动作，指向被顶替的那个动作。计时器属于被顶替的动作，它被使用时就已经开始计时。目前有 14 组：各色标准舞步结束/技巧舞步结束和提拉纳（舞步）、猛兽爪和凶禽爪（烈牙）、支配之心和终结之心（血壤）、掘地飞轮（回转飞锯） |

**收录哪些技能**：非 PvP、习得等级 ≥ 1、类别是魔法/战技/能力、ClassJobCategory 含受支持的职业；并且是 IsPlayerAction，或者 ClassJob ≥ 0 且有复唱组（舞步结束这类只能通过替换使用的职业技能）。ClassJob = -1 的宠物、分身、副本技能，以及没有复唱组的效果变体，都不收录。

**说明宏**：国服技能说明只用到 `<If(Equal(PlayerParameter(68),职业))>`、`<If(GreaterThanOrEqualTo(PlayerParameter(72),等级))>` 和颜色标签，和游戏 tooltip 的逻辑一致。求值器（`scripts/game-data/seString.ts`）遇到其他宏直接报错，避免新版本加了新宏时悄悄算错。

**格式**（数值按等级给出，见 `LevelValue`）：

```jsonc
{
  "source": { "xivapi": "7.56x1/latest 541c0c12e07da325", "cn": "<commit> ver 2026.09.15.0000.0000" },
  "actions": {
    "7518": {                       // 促进
      "name": "促进", "icon": 3214, "jobs": [35], "level": 50,
      "recastGroup": 20,
      "recast": 55,
      "charges": [[1, 1], [88, 2]],     // 88 级“促进效果提高”起 2 层
      "durations": [20, [[1, 0], [96, 30]]]
    }
  }
}
```

```ts
/** 固定值，或按等级分段：[[起始等级, 值], ...]，按等级从低到高排列 */
type LevelValue = number | ReadonlyArray<readonly [minLevel: number, value: number]>;
```

**更新**：`pnpm import-data [--xivapi <版本>] [--cn <git ref>]`，默认取两边的最新版本。下载内容缓存在 `node_modules/.cache/game-data/`。脚本会打印和上一次结果的差异；有任何规则处理不了的情况（不认识的宏、特性里的技能名对不上、两边的行不一致），列出来后停止，不写文件。

**技能选择器**直接用本地数据筛选，不走网络。

### 5.2 取值优先级和显示选择

**取值优先级**：用户覆盖 > 游戏数据。没有内置的手写覆盖表。

`data/shownDuration.ts` 决定倒计时显示说明里的哪一段持续时间，默认第一段，`null` 表示不显示。它只在游戏给出的数值之间选择，不改数值：

| 技能 | 显示 | 原因 |
|---|---|---|
| 疾风怒涛之计 | 第 2 段（怒涛之计 20 秒） | 第 1 段是加速（10 秒），减伤才是要看的 |
| 整体论 | 第 2 段（减伤 20 秒） | 第 1 段是护盾（30 秒） |
| 即刻咏唱 | 不显示 | 效果持续到下一个魔法，10 秒会误导 |

### 5.3 默认技能槽

- 共享冷却直接用游戏的复唱组（见 5.1 的 `recastGroup`），不再有手写的映射表。
- `data/defaultWatchActions.ts`：默认以**团减和团辅**为主，不放个人减伤和资源技能。另外，防护职业加上各自的无敌，治疗和法系职业加上即刻咏唱。每一行按“团减 → 团辅 → 其他”的顺序排列。

| 职业 | 团减 | 团辅 | 其他 |
|---|---|---|---|
| 骑士 PLD (19) | 雪仇 7535、圣光幕帘 3540、武装戍卫 7385 | | 神圣领域 30 |
| 战士 WAR (21) | 雪仇 7535、摆脱 7388 | | 死斗 43 |
| 暗黑骑士 DRK (32) | 雪仇 7535、暗黑布道 16471 | | 行尸走肉 3638 |
| 绝枪战士 GNB (37) | 雪仇 7535、光之心 16160 | | 超火流星 16152 |
| 白魔法师 WHM (24) | 全大赦 7433、节制 16536 | | 即刻咏唱 7561 |
| 学者 SCH (28) | 疾风怒涛之计 25868、野战治疗阵 188、异想的幻光 16538 | 连环计 7436 | 即刻咏唱 7561 |
| 占星术士 AST (33) | 中间学派 16559 | 占卜 16552 | 即刻咏唱 7561 |
| 贤者 SGE (40) | 坚角清汁 24298、整体论 24310、泛输血 24311 | | 即刻咏唱 7561 |
| 武僧 MNK (20) | 牵制 7549 | 义结金兰 7396 | |
| 龙骑士 DRG (22) | 牵制 7549 | 战斗连祷 3557 | |
| 忍者 NIN (30) | 牵制 7549 | 介毒之术 36957 | |
| 武士 SAM (34) | 牵制 7549 | | |
| 钐镰客 RPR (39) | 牵制 7549 | 神秘环 24405 | |
| 蝰蛇剑士 VPR (41) | 牵制 7549 | | |
| 吟游诗人 BRD (23) | 行吟 7405 | 战斗之声 118、光明神的最终乐章 25785 | |
| 机工士 MCH (31) | 策动 16889、武装解除 2887 | | |
| 舞者 DNC (38) | 防守之桑巴 16012 | 技巧舞步结束 16004、进攻之探戈 16011 | |
| 黑魔法师 BLM (25) | 昏乱 7560 | | 即刻咏唱 7561 |
| 召唤师 SMN (27) | 昏乱 7560 | 灼热之光 25801 | 即刻咏唱 7561 |
| 赤魔法师 RDM (35) | 昏乱 7560、抗死 25857 | 鼓励 7520 | 即刻咏唱 7561 |
| 绘灵法师 PCT (42) | 昏乱 7560 | 星空构想 34675 | 即刻咏唱 7561 |

疾风怒涛之计带团队减伤，归为团减。大治疗（天赐祝福、礼仪之铃、大宇宙）默认不放，用户可以在设置页自己添加。

行尸走肉之后的“死而不僵”状态暂不单独处理。

### 5.4 职业表 `core/game/jobs.ts`

手写一张表，所有职业相关的映射都从这里取：

```ts
interface JobInfo {
  id: number;           // ClassJob ID
  abbr: string;         // "PLD"
  name: string;         // "骑士"
  role: "tank" | "healer" | "melee" | "ranged" | "caster";
  baseJob?: number;     // 进阶职业对应的基础职业，例如 PLD → GLA(1)
  iconId: number;       // 062100 + id
}
```

- 职能细分为近战、远敏、法系，便于显示颜色；排序时这三类都算“输出”。
- 职业表要做成数据驱动：排序、选择器、默认值都从表里取，不在各处写死职业列表。
- 驯兽师（ClassJob 43）和青魔法师（ClassJob 36）暂不放进职业表。遇到表里没有的职业时，这个队员照常占一行（保证行位置对齐），但不显示技能。以后要支持时，只需要在表里加一行，再补默认技能槽。

### 5.5 图标

**来源**：本机解包的游戏图标（游戏里的 `ui/icon`）。目录结构是 `{分组6位}/{图标ID 6位}.png`，例如 `000000/000806.png`，尺寸 80×80，相当于高清版。

- 技能图标：`actions.json` 里的 `icon` 字段；
- 职业图标：`062100 + ClassJob ID`，例如 `062119.png` 是骑士。

**`scripts/copy-icons.ts`**（和图标一样只在本机，不提交）：
1. 收集 `actions.json` 里所有技能的图标 ID，加上职业表里的职业图标 ID；
2. 从解包目录复制到 `public/icons/`，保持同样的子目录结构；
3. 解包目录用环境变量 `FFXIV_ICON_DIR` 指定；
4. 缺失的图标输出清单，但不中断。

运行时的图标路径是 `icons/000000/000806.png`（相对路径，打包后随站点一起发布）。缺图时显示占位图，不请求在线接口。

**不提交到 git**：`public/icons/` 放在仓库目录里，但加进 `.gitignore`，只在发布时打进发布包，见第 14 节。

**冷却遮罩、图标边框**用 CSS 实现：`conic-gradient` 扫光遮罩，加一个圆角描边，不需要游戏界面的序列帧图片。

---

## 6. 事件接入

### 6.1 OverlayPlugin 接口 `core/overlay/overlayApi.ts`

不依赖 cactbot 子模块，自己实现最小封装，支持两种运行方式：

- **内嵌模式**：页面在 OverlayPlugin 的悬浮窗里运行，使用注入的 `window.OverlayPluginApi`；
- **WebSocket 模式**：URL 带 `?OVERLAY_WS=ws://127.0.0.1:10501/ws` 时，通过 WebSocket 连接。用于在普通浏览器里调试，或者从浏览器打开设置页。

对外暴露 `addOverlayListener(event, handler)`、`getConnectionMode()`，以及调用不需要回复的处理器的 `callOverlayHandler(msg)`（目前只用于语音播报的 `say`，见 11.4）。未连接时的调用直接丢弃，不排队：播报是即时的，晚到没有意义。

**内嵌模式的坑（已在 ACT 实测中踩过）**：`OverlayPluginApi.callHandler` 是通过 CefSharp 绑定的 C# 方法，调用时**必须传两个参数**（消息和回调函数）。只传一个参数会报“Missing Parameters”，所有订阅都会失败，悬浮窗收不到任何事件。`tests/overlayApi.test.ts` 和端到端检查的内嵌模式都覆盖了这一点。

**锁定状态**：监听 `document` 上的 `onOverlayStateUpdate` 事件（`detail.isLocked`），用来切换编辑模式（见第 10 节）。

### 6.2 订阅的事件

| 事件 | 用途 |
|---|---|
| `ChangePrimaryPlayer` | 主角色 ID（`charID` 转成十六进制大写） |
| `PartyChanged` | 小队成员：`id`、`name`、`job`、`level`、`inParty` |
| `ChangeZone` | 换区时重置所有冷却和资源 |
| `LogLine` | 技能释放、buff、死亡、团灭、战斗状态等 |
| `onOverlayStateUpdate`（DOM 事件） | 悬浮窗是否锁定 |

以下行为已在 OverlayPlugin 源码（`FFXIVRequiredEventSource`、`FFXIVOptionalEventSource`、`EventDispatcher`）里确认：

- `PartyChanged` 和 `ChangePrimaryPlayer` 是**缓存事件**：订阅后立刻收到当前值，悬浮窗中途打开也不需要等待后续事件。
- **单人时 `PartyChanged` 推送只有自己的一人小队**，不会是空小队，所以不需要额外的单人处理。
- 队员的**职业或等级变化时会重新推送** `PartyChanged`（定时读取小队数据并比较），升级和等级同步都能及时反映（见 7.3）。
- 成员 `id` 是大写十六进制，和日志行里的施放者 ID 格式一致。
- 订阅了 OverlayPlugin 不认识的事件时，它只记一条错误日志，不影响同一批里其他事件的订阅。

### 6.3 用到的日志行字段 `core/logline/fields.ts`

字段索引参考 cactbot `resources/netlog_defs.ts`：

| 行类型 | 名称 | 用到的字段索引 |
|---|---|---|
| `21` / `22` | Ability / NetworkAOEAbility | 1 时间戳，2 施放者 ID，4 技能 ID（十六进制），6 目标 ID，36 施放者当前 MP，45 目标序号（AOE 只处理 `0`） |
| `25` | WasDefeated | 2 死亡者 ID |
| `26` | GainsEffect | 1 时间戳，2 状态 ID（十六进制），4 持续时间，5 来源 ID，7 目标 ID |
| `30` | LosesEffect | 1 时间戳，2 状态 ID，5 来源 ID，7 目标 ID |
| `33` | ActorControl | 3 指令：`4000000F`、`40000010` 视为团灭或重置 |
| `39` | NetworkUpdateHP | 2 ID，6 当前 MP |
| `260` | InCombat | 2 ACT 战斗中，3 游戏战斗中 |

`parse.ts` 把原始数组转成带类型的事件，后面的模块不再直接按下标取字段：

```ts
type GameEvent =
  | { type: "ability"; time: number; sourceId: string; actionId: number; targetId: string; sourceMp?: number }
  | { type: "death"; time: number; targetId: string }
  | { type: "gainEffect"; time: number; effectId: number; duration: number; sourceId: string; targetId: string }
  | { type: "loseEffect"; time: number; effectId: number; sourceId: string; targetId: string }
  | { type: "hpUpdate"; time: number; id: string; mp: number }
  | { type: "combat"; time: number; inCombat: boolean }
  | { type: "wipe"; time: number };
```

`time` 取日志行里的时间戳（毫秒），只给资源追踪器计算两个事件之间的时间差用。

---

## 7. 冷却模型 `core/cooldown/cooldownTracker.ts`

**唯一的冷却状态来源**（设计原则 1）。

### 7.1 键

`${ownerId}:${recastKey}`

`recastKey` 是游戏的复唱计时器：`g<复唱组>`。升级链的各级、共享复唱的技能（失血箭和死亡箭雨等）复唱组相同，释放其中任何一个都对上同一个监视项。没有自身复唱组的技能（只走公共复唱）退回到升级链顶端的技能 ID：`a<ID>`。

### 7.2 状态

```ts
interface CooldownState {
  recastMs: number;
  maxCharges: number;         // 单次冷却技能为 1
  durationMs: number;         // 效果持续时间，0 表示不显示
  charges: number;            // 当前可用层数
  rechargeStartAt: number | null; // 当前这一层开始恢复的时间；满层时为 null
  lastUsedAt: number | null;  // 最近一次影响这一项的释放（释放时的闪光）
  effectStartAt: number | null; // 正在倒计时的效果从何时开始
}
```

单次冷却技能也按 `maxCharges = 1` 处理，和充能技能共用同一套逻辑。

### 7.3 规则

- **使用计时器所属的技能**（`use(key, now, startsEffect)`）：
  - 如果 `charges > 0`：`charges -= 1`。如果之前是满层，令 `rechargeStartAt = now`。后续释放只减层数，不影响正在恢复的那一层；
  - 如果 `charges == 0`，说明本地模拟有误差（日志证明游戏里这一层其实已经好了），把恢复周期从 `now` 重新开始；
  - 记录 `lastUsedAt = now`；`startsEffect` 时记录 `effectStartAt = now`。
- **释放顶替动作**（`startEffect(key, now)`，见 5.1 的 `replaces`）：不消耗计时器，只开始效果倒计时。
  - 技能槽显示的就是顶替动作（比如默认的技巧舞步结束）时：按下被顶替的动作（技巧舞步）只开始冷却，之后释放的、本身带持续时间的顶替动作（任意一种技巧舞步结束）开始效果倒计时；不带持续时间的（提拉纳）不影响；
  - 技能槽显示的是计时器本身的动作（比如烈牙）时：它自己的释放同时开始冷却和效果，后续的顶替动作不影响。
- **推进时间**（读取时惰性计算，不需要每帧推进）：从 `rechargeStartAt` 开始，每过 `recastMs` 恢复一层，直到满层后置为 null。**串行恢复**，和游戏一致。
- **缩短冷却**（`adjust(key, deltaMs)`）：把 `rechargeStartAt` 往前移。给绘灵涂层破盾这类机制用。
- **重置**（团灭、换区）：全部回到满层。
- **小队或配置变化**：只新增、删除对应的键，已有状态保留。如果 `recastMs` 或 `maxCharges` 变了（升级、等级同步；OverlayPlugin 在队员等级变化时会重新发送 PartyChanged），按新值重新计算：
  - 计时器没在走（满层）：保持满层，层数等于新的上限。比如 87 → 88 级的促进，升级后直接有 2 层；
  - 计时器在走：保留正在恢复的那一层，层数不超过新的上限。升级时多出的那一层怎么恢复，游戏数据里没有写，按串行恢复处理（排在当前这一层后面），还没有在游戏里核实。

### 7.4 读取视图

```ts
interface CooldownView {
  charges: number;
  maxCharges: number;
  /** 下一层就绪的时间；满层时为 null */
  nextReadyAt: number | null;
  /** 效果结束时间；不在效果期内时为 null */
  activeUntil: number | null;
}
```

UI 用 `nextReadyAt`、`recastMs` 生成 CSS 动画参数（见第 11 节），用全局时钟计算倒计时文字。

### 7.5 时间基准

技能释放的时间用**收到日志行时的 `Date.now()`**。原因是：UI 也用 `Date.now()` 画倒计时，统一时钟可以避免 ACT 和浏览器之间的时区、时钟偏差问题。代价是有几十毫秒的转发延迟，对秒级的冷却显示没有影响。

资源追踪器内部需要比较两个日志事件的时间差（比如绘灵的 300ms 观察窗口），用日志行里的时间戳，只取差值，不和 `Date.now()` 混用。

---

## 8. 职业资源追踪 `core/gauges/`

6 个职业的资源追踪器，统一接口；只读取解析后的事件，缩短冷却也只通过 `ctx.adjustCooldown`：

```ts
interface GaugeTracker {
  readonly job: number;
  setPlayers(ids: string[]): void;
  onEvent(e: GameEvent, ctx: GaugeContext): void;
  reset(): void;
  fill?(): void;                                  // 演示模式用
  /** 技能图标上显示的资源信息；不相关的技能返回 undefined */
  getView(ownerId: string, actionId: number, now: number): GaugeView | undefined;
}

interface GaugeContext {
  adjustCooldown(ownerId: string, actionId: number, deltaMs: number): void;
}

interface GaugeView {
  value?: number;       // 当前资源量，显示在左下角
  ready: boolean;       // 资源是否足够，不够时图标变暗
  extraText?: string;   // 附加文字，例如学者秘策的冷却
}
```

| 职业 | 追踪内容 | 说明 |
|---|---|---|
| 骑士 | 忠义量谱：普通攻击 +5，盾阵、圣盾阵、干预、保护 -50 | 无 |
| 暗黑骑士 | MP：从 21/22、39 行读取 | 无 |
| 学者 | 以太超流层数、秘策 buff、秘策冷却 | 秘策冷却从技能数据读取 |
| 贤者 | 蛇胆层数，每 20 秒恢复 | 无 |
| 白魔法师 | 治疗百合，战斗中每 20 秒恢复 | 无 |
| 绘灵法师 | 涂层提前破碎时缩短冷却 | 通过 `ctx.adjustCooldown` 调用 |

资源消耗表放在各自的追踪器里，不单独放一个全局表。

**优先级较低**：默认技能槽以团减、团辅为主，另有无敌和即刻咏唱（见 5.3），其中只有贤者的坚角清汁会用到资源（蛇胆）。其他追踪器只在用户自己添加了圣盾阵、至黑之夜、以太超流技能、百合技能、坦培拉涂层时才起作用。所以资源追踪放在最后一个里程碑，接口在 M2 先定好，保证以后接入时不用改冷却模型。

---

## 9. 小队排序 `core/party/sortParty.ts`

### 9.1 背景

- ACT 和 OverlayPlugin **拿不到游戏小队列表的显示顺序**。`PartyChanged` 的顺序来自服务器数据包，不是界面顺序。
- 游戏的排序是在特定时机执行一次的（`/psort`、“队员排序”菜单等），掉线重连后顺序可能会变。
- 游戏里**可以按自己当前的职能（坦克、治疗、输出）分别设置排序**（已确认）。
- 同职业两个人的先后：**实测改变入队顺序和队长后，`/psort` 的结果不变**。说明游戏用的是某个固定的键，而不是入队顺序，但具体是 ActorID、Content ID 还是名字，目前没法确认。

所以采用“规则排序作为默认值，手动调整作为修正”。

### 9.2 排序设置

```ts
type RoleGroup = "tank" | "healer" | "dps";

interface SortPreset {
  roleOrder: RoleGroup[];   // 职能之间的顺序，例如 ["tank", "healer", "dps"]
  jobOrder: number[];       // 职能内部的职业顺序（只放进阶职业，基础职业跟随进阶职业）
}

interface PartySortSettings {
  selfFirst: boolean;       // 默认 true
  /** 按自己当前的职能选择预设，对应游戏里三套独立的排序设置 */
  presets: Record<RoleGroup, SortPreset>;
  sameJobTieBreak: "actorIdDesc" | "actorIdAsc"; // 默认 actorIdDesc
}
```

三套预设互相独立，和游戏设置一一对应。设置页提供“复制到其他预设”按钮，方便三套相同时一次配好。

### 9.3 排序算法

1. 如果开启了 `selfFirst`，自己排第一；
2. 按“自己当前的职能”选用预设；
3. 其他人先按职能在 `roleOrder` 里的位置，再按职业在 `jobOrder` 里的位置排序；
4. 同职业按 ActorID 排序，方向由 `sameJobTieBreak` 决定。**不使用入队顺序**（实测证明游戏不看入队顺序）。默认 `actorIdDesc`；如果实际遇到同职业时总是反的，把设置切换成 `actorIdAsc`。如果两个方向都有对不上的情况，说明游戏用的不是 ActorID，只能靠手动覆盖；
5. 最后应用手动覆盖（见 9.4）。

### 9.4 手动覆盖

- 在悬浮窗编辑模式下，每行显示上移、下移按钮，也可以直接拖动。
- 覆盖结果按“小队成员集合”保存：

  ```ts
  interface ManualOrder {
    memberKey: string;   // 成员 ID 排序后拼接，例如 "10001234,10005678,..."
    order: string[];     // 成员 ID 的显示顺序
    savedAt: number;
  }
  ```

- 只要成员集合没变（比如换职业、掉线重连），手动顺序一直有效；成员变了，自动回到规则排序。
- 最多保留最近 20 条，旧的自动淘汰。这样在几个固定队之间切换时，每个队的顺序都能记住。
- 编辑模式里提供“清除手动顺序”按钮。

---

## 10. 布局与校准

### 10.1 布局参数

```ts
interface LayoutSettings {
  iconSize: number;        // 图标边长，px，默认 32
  rowPitch: number;        // 行距：一行顶部到下一行顶部，px，默认 40
  iconGap: number;         // 同一行图标之间的横向间距，px，默认 3
  offsetX: number;         // 第一个图标的起始偏移，px
  offsetY: number;
  direction: "ltr" | "rtl"; // 图标从左往右还是从右往左排（悬浮窗放在小队列表左侧时用 rtl）
  textScale: number;       // 倒计时和层数文字的缩放，默认 1
  opacity: number;         // 整体不透明度，默认 1
  showDuration: boolean;   // 效果期间是否显示持续时间，默认 true
  announce: boolean;       // 语音播报总开关，默认 false（见 11.4）
  announceText: "skill" | "jobAndSkill" | "memberAndSkill"; // 播报内容，默认 "skill"
}
```

- 用 `rowPitch`（行距）而不是“行间隔”，因为游戏小队列表每一格的高度是固定的，直接对应最方便：在游戏截图里量出第 1 个人到第 8 个人的距离，除以 7 就是 `rowPitch`。
- 行内图标垂直居中在这一格里。图标比行距还大时，不裁剪，允许溢出。
- 所有尺寸通过 CSS 变量传给界面，不使用 `zoom`。

### 10.2 编辑模式

悬浮窗本身**始终只显示技能图标**，不显示名字、按钮或工具条。所有编辑操作都在设置页里完成：

- **右键打开设置页**：悬浮窗上任意位置右键，弹出设置窗口（和悬浮窗同源、共享 localStorage）。
- **未锁定时**：整个窗口显示一圈虚线边框和很淡的底色，方便调整窗口大小；图标行叠在边框层之上，不会被遮挡。
- **校准网格**：设置页“布局”里的开关。只在未锁定时显示 8 行半透明色带，行号显示在和图标相反的一侧。
- **演示小队**：未锁定且没有小队（单人）时自动使用；设置页里也可以强制开启。
- **模拟全部释放、重置冷却**：设置页“布局”里的按钮。模拟释放按游戏里的顺序来：技能槽是顶替动作（比如技巧舞步结束）时，先模拟它顶替的那个按钮（技巧舞步），再模拟它自己，所以冷却遮罩和效果倒计时都会出现。模拟释放不触发语音播报。
- **手动调整顺序**：设置页“小队排序”顶部的“当前小队的顺序”，显示悬浮窗正在显示的顺序，可以上下移动。

**跨窗口通信**（`app/composables/useOverlayBridge.ts`）：两个窗口共享 localStorage，`storage` 事件只在另一个窗口触发，正好符合需要的方向。不用 BroadcastChannel，因为 `file://` 页面在 Chromium 里是不透明来源。

| 键 | 方向 | 内容 |
|---|---|---|
| `skills-monitoring:live-party` | 悬浮窗 → 设置页 | 当前显示的队员顺序（内容不变时不重复写入） |
| `skills-monitoring:command` | 设置页 → 悬浮窗 | `castAll` / `reset` / `sayTest`（试听），带时间戳，保证重复指令也能触发事件 |
| `skills-monitoring:preview` | 设置页 → 悬浮窗 | 校准网格、强制演示小队两个开关 |
| `skills-monitoring:settings` | 双向 | 设置本身，包括手动顺序 |

### 10.3 存储

布局属于“这个悬浮窗实例”的设置，可能同时开多个实例（比如一个放左边、一个放右边）。所以：

- 默认存在 localStorage 的 `layout` 下；
- 如果 URL 带 `?profile=xxx`，改存在 `layout:xxx` 下，不同悬浮窗实例互不影响。

---

## 11. 界面

### 11.1 悬浮窗 `OverlayPage`

```
MemberRow（每个队员一行，高度 = rowPitch）
  └─ SkillIcon × N
       ├─ 图标
       ├─ 冷却遮罩（CSS conic-gradient 扫光，CSS 动画驱动）
       ├─ 中间文字：效果期间显示金色的剩余持续时间，冷却期间显示白色的剩余冷却
       ├─ 右下角：充能层数（0 层时为橙色）
       └─ 左下角：资源值或附加文字（资源不足时为红色，图标变暗）
```

**渲染方式**：
- 冷却遮罩：在 `nextReadyAt` 变化时设置 CSS 变量 `--duration: recastMs` 和 `animation-delay: -(now - rechargeStartAt)`，然后由浏览器播放动画，不需要每帧更新数据；
- 倒计时文字：共享的 `useTicker()` 每 250ms 更新一次。图标只在有冷却或效果进行中时持有它，并在 `settledAt`（全部恢复且效果结束的时刻）用一个定时器释放。超过 100 秒的剩余时间按分钟显示（如 `7m`），避免三位数溢出图标；
- 刚释放时的闪光：使用时切换一个 class，播放一次 CSS 动画。

**交互**：锁定状态下没有任何点击交互，悬浮窗可以设为鼠标穿透，不会挡住游戏操作。所有交互都在未锁定的编辑模式里（见 10.2）。

**等级处理**：队员用不了的技能（等级不够还没学会、等级同步到习得等级以下，或者基础职业用不了的职业技能）不留空，而是显示为灰色的不可用图标（`UnavailableSkillIcon`），每行图标保持完整、对齐。图标用这个职业最先学会的那一级，基础职业永远学不到的就用技能槽配置的技能。不可用的技能槽没有冷却状态，也不参与释放识别和语音播报。

### 11.2 设置页 `SettingsPage`

在悬浮窗上右键打开（`#/settings`），窗口 735 × 955px，每个标签页都在 735px 宽度下验证过没有横向溢出。窗口从上次关闭的位置打开（`app/settingsWindow.ts`）：设置窗口关闭时（`pagehide`）记下自己的屏幕坐标，悬浮窗下次打开时把它作为 `window.open` 的 `left` / `top` 传入；第一次打开在浏览器默认的位置。不做居中：悬浮窗是离屏渲染，读不到真实显示器（OverlayPlugin 的 `Renderer` 没有提供 `GetScreenInfo`），ACT 的浏览器也不允许网页移动窗口，居中没法每次都一致。设置窗口打开时如果发现自己大半在屏幕外（比如副屏已经拔掉），就清掉记下的位置，下次回到默认位置。标签页按使用频率排列：

| 标签页 | 内容 |
|---|---|
| 小队排序 | 当前小队的顺序（手动上下调整）；自己置顶开关；坦克、治疗、输出三套预设，每套的职能顺序和职业顺序（拖动）；复制到其他预设；同职业 ActorID 方向 |
| 技能槽 | 按职业列出技能槽：拖动排序、打开技能选择器（本地数据搜索，只列游戏技能列表里有的技能，见 5.1 的 `listed`）、增删、恢复这个职业的默认值、每个技能是否播报。基础职业自动沿用进阶职业的配置 |
| 布局 | 悬浮窗预览（校准网格、演示小队、模拟全部释放、重置冷却）、布局参数、语音播报（开关、播报内容、试听） |
| 技能参数 | 对单个技能覆盖冷却、持续时间、充能层数、最低等级，用按等级分段的文本输入，不接受代码 |
| 导入导出 | 导入、导出、恢复默认 |

### 11.3 跨窗口同步

悬浮窗和设置页是两个窗口，但同源，共享 localStorage。设置保存后，另一个窗口通过 `storage` 事件重新加载。保存时防抖 200ms。

### 11.4 语音播报

监视的技能释放时，悬浮窗调用 OverlayPlugin 的 `say` 处理器，由 ACT 用它自己配置的 TTS 播报。OverlayPlugin 的实现（`MiniParseEventSource`）是 `ActGlobals.oFormActMain.TTS(text)`，内嵌和 WebSocket 两种连接方式都能用；内嵌模式同样必须传回调参数（见 6.1）。

**什么时候算“触发”**（`MonitorEngine.onTrigger`）：和冷却模型对“刚释放”的定义一致（7.3）。

- 普通技能槽：每次释放都触发，包括充能技能的后续释放；
- 显示顶替动作的技能槽（比如技巧舞步结束）：按下被顶替的动作（技巧舞步）不触发，之后带持续时间的顶替动作（任意一种技巧舞步结束）才触发，提拉纳不触发；
- 演示模式的“模拟全部释放”不触发；
- 同一个队员有多个技能槽在同一个计时器上时（比如同时监视失血箭和死亡箭雨，或者技巧舞步和技巧舞步结束），每次释放归到对应的那个技能槽：先按升级链找，找不到再按种类找（顶替动作归显示顶替动作的技能槽，计时器本身的动作归显示它的技能槽）。播报开关因此能分别生效。

**播报内容**（`announceText`）：只有技能名（默认）、职业 + 技能名、队员名 + 技能名。技能名是技能槽上设置的那个技能（按队员等级取对应的版本），不是游戏内部替换出来的变体：跳了几步都播“技巧舞步结束”。

**开关**：

- 总开关 `announce` 放在布局里（10.1），按悬浮窗分别保存，默认关闭。同时开两个悬浮窗（`?profile=`）时，只有打开了开关的那个会播报，不会每句重复两遍；
- 每个技能槽是否播报放在设置里（`silentActions`，12.1），所有悬浮窗共用。只记录关掉的技能，所以打开总开关后默认全部播报；技能槽被移除时，对应的记录一起删掉；
- 设置页“布局”里的“试听”通过跨窗口指令 `sayTest` 让悬浮窗播报一句“语音播报测试”，用来确认 ACT 的 TTS 能出声。指令带上设置窗口的 `profile`，只有打开这个设置页的那个悬浮窗会播报，和总开关的范围一致。

---

## 12. 设置的存储和迁移 `core/settings/`

### 12.1 结构

```ts
interface Settings {
  version: 1;
  watchActions: Record<number, number[]>;          // 进阶职业 → 技能 ID 列表
  skillOverrides: Record<number, SkillOverride>;    // 用户对技能参数的覆盖
  silentActions: Record<number, number[]>;          // 进阶职业 → 不播报的技能槽（见 11.4）
  partySort: PartySortSettings;
  manualOrders: ManualOrder[];
}
// 布局单独存储，见第 10.3 节
```

- 存储键：`skills-monitoring:settings`、`skills-monitoring:layout`、`skills-monitoring:layout:<profile>`（加前缀的原因见 14.3）。
- 读取时统一经过 `validate()`：缺字段补默认值、非法值丢弃、未知职业忽略但保留数据，不抛异常导致页面白屏。

### 12.2 版本迁移

- `version` 从 1 开始，每次结构变化加 1，在 `migrate.ts` 里写一个 `vN → vN+1` 的函数，依次执行。
- v1 → v2：技能槽只放游戏技能列表里有的技能（5.1 的 `listed`）。已保存的不在列表里的顶替动作，换成同一个按钮下、说明里持续时间相同、在列表里的那个（单色~四色技巧舞步结束 → 技巧舞步结束），合并重复项；找不到对应的就保留。

### 12.3 导入导出

- 导出：`Settings`（不含布局）序列化为 JSON，再做 Base64 编码，方便复制粘贴。
- 导入：只接受本工具导出的文本，解码、迁移、校验后替换。手动顺序和具体角色绑定，不在导出里，导入时保留当前的。

---

## 13. 测试

`core/` 用单元测试（Vitest）。构建产物另有端到端检查（`tests/e2e/overlay.e2e.mjs`，`pnpm e2e`）：用无头 Chrome 以 `file://` 打开 `dist/`，分别模拟 OverlayPlugin 的内嵌（CefSharp）和 WebSocket 两种连接，走一遍小队、释放、团灭、换区、排序、设置页和语音播报。Chrome 用 `--remote-debugging-port=0` 自己挑端口，结束时用 `Browser.close` 关闭，避免连到上一次残留的浏览器。

| 模块 | 重点用例 |
|---|---|
| `logline/parse` | 21/22 行字段解析；AOE 只取目标序号 0；33 行团灭指令；非法行返回 null |
| `cooldown` | 单次冷却的倒计时；充能串行恢复（连用两层，第二层在 2×recast 后才回来）；0 层时仍然使用；`adjust` 缩短冷却；团灭重置；`recastMs` 变化后重新计算 |
| `engine` | 释放识别、顶替动作、升级和等级同步；语音播报的触发时机、播报内容、按技能槽关闭 |
| `overlay` | 内嵌模式调用处理器时总是带回调；未连接时不发送 |
| `game/*` | 低级技能归一到最高级；按等级选版本；基础职业可用版本；复唱组；按等级取冷却、充能、持续时间 |
| `game/levelValue` | 固定值；分段取值的边界等级 |
| `party/sortParty` | 自己置顶；职能顺序自定义；按自己的职能切换预设；同职业兜底规则；手动覆盖生效和失效 |
| `gauges/*` | 每个职业的资源变化；绘灵破盾调用 `adjustCooldown` |
| `settings` | 缺字段补默认值；非法值修正；导入导出；版本迁移 |
| 数据导入 | 说明宏求值器、特性文本解析、CSV 解析的单元测试；生成时逐行比对国服和国际服、交叉核对特性和说明里的积蓄次数（导入脚本里校验） |

---

## 14. 发布与部署（GitHub Pages）

### 14.1 GitHub Pages 对私有仓库的限制

| 账号类型 | 私有仓库能否开 Pages | 发布出来的站点谁能访问 |
|---|---|---|
| 个人 GitHub Free | **不能**，只支持公开仓库 | — |
| 个人 GitHub Pro | 能 | **公开**，任何人拿到网址都能访问 |
| 组织 GitHub Team | 能 | 公开 |
| 组织 GitHub Enterprise Cloud | 能 | 可以设为仅限有仓库读权限的人访问 |

需要注意的几点：

- **仓库私有只能保护源码，站点本身一定是公开的。** Enterprise Cloud 的“私有站点”需要登录 GitHub 才能访问，但 OverlayPlugin 的悬浮窗加载网址时不会带 GitHub 登录状态，所以实际上用不了。也就是说，打包后的 JS 和图标，任何知道网址的人都能下载。
- **如果账号是 Free**：可以用“私有源码仓库 + 公开发布仓库”的组合。源码仓库保持私有，只把构建产物发布到另一个公开仓库的 Pages。效果和 Pro 一样，不用付费。
- **本项目的做法**：源码仓库 [garfieldzasv/Skills-Monitoring](https://github.com/garfieldzasv/Skills-Monitoring) 本身是公开的，Pages 直接从这个仓库部署，站点是 <https://garfieldzasv.github.io/Skills-Monitoring/>。

参考资料：[GitHub Docs：Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)、[GitHub Docs：Changing the visibility of your GitHub Pages site](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)

### 14.2 发布流程

约束：图标不进 git，但 GitHub Actions 访问不到本机的解包目录，所以**构建必须在本机完成**。采用“本机打发布包，上传为 GitHub Release 附件，Actions 负责部署”：

```
本机 pnpm release
  ├─ 1. copy-icons     从解包目录复制图标到 public/icons/
  ├─ 2. test + build   运行测试，vite build 输出 dist/（包含图标）
  ├─ 3. 打包           dist/ → release-vX.Y.Z.zip
  └─ 4. 上传           创建 GitHub Release vX.Y.Z，附上 zip

GitHub Actions（Release 发布时触发）
  ├─ 下载 Release 附件 zip 并解压
  ├─ actions/upload-pages-artifact
  └─ actions/deploy-pages → https://<用户名>.github.io/<仓库名>/
```

这样做的好处：
- 图标不进任何 git 分支，也不需要 `gh-pages` 分支；
- 每个版本都有一个完整的发布包，想回滚只要对旧的 Release 重新运行一次部署；
- 部署步骤在 Actions 里，不需要在本机配置 Pages 相关的权限。

第 4 步需要本机安装并登录 `gh` CLI，也可以在 GitHub 网页上手动创建 Release 并上传 zip。先建草稿、上传附件后再发布，可以避免 workflow 在附件上传完之前就开始运行。

仓库需要一次性设置两项：

- Settings → Pages 的来源选 **GitHub Actions**。新建的仓库可能默认是“从分支部署”，那样站点上放的是源码里的开发用 `index.html`，页面跑不起来。
- Settings → Environments → `github-pages` 的部署规则里加上标签 `v*`。这个环境默认只允许 `main` 分支部署，而 Release 触发的运行是在标签上，不加规则会被拦下。

如果采用“私有源码仓库 + 公开发布仓库”的组合，部署 workflow 放在公开发布仓库里，从私有仓库的 Release 下载附件（需要一个有读权限的 token，存在发布仓库的 Secrets 里）；也可以直接把 Release 建在公开发布仓库上。

### 14.3 构建配置

- Vite 的 `base` 设为 `./`，全部使用相对路径，不依赖仓库名。路由使用 hash 模式，GitHub Pages 不需要额外配置 404 回退。
- 在 OverlayPlugin 里添加悬浮窗时，网址填 `https://<用户名>.github.io/<仓库名>/`，设置页是 `.../#/settings`。
- **localStorage 键加上项目前缀**：同一个用户名下所有仓库的 Pages 都在同一个域名 `<用户名>.github.io` 下，共享同一个 localStorage。所以存储键统一用 `skills-monitoring:` 开头（见 12.1），避免和同域名下的其他页面冲突。本地文件（`file://`）下所有本地页面也共用一个 localStorage，前缀同样必要。

### 14.4 本地文件方式

发布包解压后，可以直接把 `file:///.../index.html` 填进 OverlayPlugin，不需要网络，也不需要本地服务器。为此构建产物采用**传统脚本格式**：

- Chromium（包括 OverlayPlugin 的 CEF）会拦截 `file://` 下的 ES 模块脚本（`<script type="module">`），所以 Vite 输出改为 IIFE 单文件，`index.html` 里用 `<script defer>` 引用，并去掉 `crossorigin` 属性（见 `vite.config.ts` 里的 `classicScriptHtml` 插件）。CSS 由 Vite 打进同一个 JS 文件，运行时注入。
- 代价是失去按需加载：设置页的代码也会打进悬浮窗加载的 JS（约 245KB，gzip 后约 91KB），只在加载时解析一次，对运行时没有影响。
- 同一份产物同时用于 GitHub Pages 和本地文件，不需要维护两种构建。
- 限制：localStorage 按来源隔离，GitHub Pages 地址和本地文件地址的设置互不相通，换地址时需要导出再导入。设置页也必须在 ACT 内置浏览器里打开（悬浮窗编辑工具条里的“打开设置”），系统浏览器的 localStorage 和 ACT 是分开的。

已在无头 Chrome 里用 `file://` 验证过渲染、图标加载、冷却显示、localStorage 写入和设置页。ACT 的 CEF 里还需要实测，重点看关闭 ACT 后再打开时，localStorage 是否还在。

---

## 15. 决策记录与待定项

### 15.1 已确认

| 问题 | 结论 | 影响的章节 |
|---|---|---|
| 同职业在游戏里的排序 | 改变入队顺序和队长后，`/psort` 的结果不变 | 9.3：不用入队顺序，按 ActorID 排，方向可切换，再加手动覆盖 |
| 游戏能否按自己的职能分别设置排序 | 能 | 9.2：三套独立预设 |
| 图标是否提交 | 放在仓库目录里但不提交，发布时打进发布包 | 5.5、14.2 |
| 默认技能槽 | 以团减和团辅为主；防护加无敌；治疗和法系加即刻咏唱 | 5.3 |
| 发布仓库 | 公开的源码仓库直接部署 Pages；构建产物以 Release 附件发布，不提交构建目录（产物里有图标，图标不进 git） | 14 |
| 同职业的 ActorID 方向 | 先按默认值 `actorIdDesc` 实现，遇到实际情况再核实修改 | 9.3 |
| 点击技能发送到小队频道 | 不做 | 1、11.1 |
| 部署方式 | GitHub Pages | 14 |
| 驯兽师（ClassJob 43） | 特殊职业，推迟处理 | 1、5.4 |
| 技能数据来源 | 游戏客户端数据：XIVAPI 国际服（结构、数值）+ 国服导出（中文名、说明宏） | 5.1 |

### 15.2 待定（不阻塞实现）

1. **同职业的 ActorID 方向**：实战遇到同职业时核实。
2. **青魔法师**：和驯兽师一样暂不支持，需要时再提。

---

## 16. 里程碑

| 阶段 | 内容 | 完成标准 |
|---|---|---|
| M1 骨架和数据 | 项目初始化；导入脚本、复制图标脚本；`game/` 数据查询；默认技能槽 | 测试通过；能按技能 ID 查到名称、图标、冷却、持续时间 |
| M2 核心逻辑 | `overlay/`、`logline/`、`cooldown/`、`party/`、`settings/`；资源追踪器接口 | 核心测试全部通过 |
| M3 悬浮窗 | 按队员分行显示；冷却、充能、持续时间；布局参数；编辑模式、校准模式、手动排序 | 在 ACT 里用演示小队完成校准，实战验证冷却显示 |
| M4 设置页 | 技能槽、技能参数、小队排序、布局、导入导出 | 能完成所有配置，并和悬浮窗实时同步 |
| M5 发布 | `pnpm release` 脚本、部署 workflow | GitHub Pages 上的网址能在 ACT 里正常加载 |
| M6 职业资源（可选） | 6 个职业的资源追踪器 | 追踪器测试通过，实战验证 |

---

## 附录：许可

本项目使用 MIT 许可（见 `LICENSE`）。技能数据和图标来自 FINAL FANTASY XIV 游戏客户端，版权归 SQUARE ENIX 所有。
