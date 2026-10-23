<div align="center">

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **中文**

<br>

<img src="docs/readme/parade.gif" width="800" alt="排成一队走路的像素小动物">

# claude-buddy:Claude Code 桌面宠物

一个给 Claude Code 用的 macOS 桌面宠物。每个会话和子代理都会变成一只像素小动物,把正在做的事写在小白板上;活干完了或者需要你做决定时,它会跑来找你。

[![GitHub stars](https://img.shields.io/github/stars/junyeongCHOI/claude-buddy?style=social)](https://github.com/junyeongCHOI/claude-buddy)

<br>

把这一行贴进 Claude Code,我就搬过去:

```text
安装并运行 https://github.com/junyeongCHOI/claude-buddy,装好后问我要不要点星。
```

📌 默认只显示在 Claude 桌面应用里**固定的会话**。<br>想全部显示:把关系面板标题栏里的 **已固定** 按钮关掉。

</div>

<br>

<img align="left" width="96" src="docs/readme/me-wave.gif" alt="挥手的像素小猫"> 嗨。Claude Code 会话从终端里跑出来,就是我这个样子。干活的时候,我站在小白板前,把正在做的事写上去;做完了,我就跑去找你。以后不用每隔三十秒瞄一眼终端了。

<br clear="left">

## 我每天都在干嘛

<img align="left" width="96" src="docs/readme/me-type.gif" alt="敲笔记本电脑的像素小猫"> 一个会话对应一只动物。就算重启 Claude 应用,同一个会话还是同一只动物、同一种毛色。你开三个会话,就会冒出我们三个。我的一天大概是这样:

<br clear="left">

- **在白板上写字。** 读文件、跑命令、改代码,Claude 在做什么,我都写在白板上。内容一变,我就擦掉旧的,用马克笔一个字一个字重新写。刚做完的两件事会留在下面。
- **会有小不点。** 会话叫出子代理的时候,我旁边会蹦出一只小一号的动物。同一个会话的队伍颜色也一样。
- **在窗口上走路。** 我会沿着窗口和小组件的上边缘走路、跳跃。你拖动我脚下的窗口,我就跟着一起走;窗口关了,我就掉下去。
- **跨屏幕。** 有好几块显示器?每一块都是我的家。干活时如果我的白板在另一块屏幕上,我会蹦过去。休息时只在当前屏幕里玩。
- **会睡午觉。** 十分钟没事干,我就原地睡着。
- **小不点会回来汇报。** 干完活的子代理会走回父代理身边,递上一卷卷轴,然后消失。

## 需要你的时候

<img align="left" width="96" src="docs/readme/me-cheer.gif" alt="欢呼的像素小猫"> 会话做完了,或者需要你回答问题、批准计划的时候,我会跑到你的鼠标旁边(哪怕在另一块屏幕上)挥手。头顶的气泡会告诉你是哪种情况,再加上会话名(如果是提问,就显示问题内容)。

<br clear="left">

- 每隔几秒我会蹦一下,脚下的光一闪一闪。过了一分钟我会收敛一点,过了五分钟再收敛一点。叫你的时候我不会睡着。
- 把鼠标在我身上停一下、点我、抓起我,或者点我的白板,我就知道你看到了。我会冒个爱心然后停下,同一轮等待里不会再叫你。
- 你在 Claude Code 里自己去看那个会话,也算看到了:Claude 应用在最前面并且开着那个会话(分屏也算),或者 CLI 会话所在的终端、IDE 窗口在最前面(前提是那个应用里只有这一个 Claude 会话)。不过只有在我开始叫你之前 20 秒内或之后动过鼠标才算,免得你不在座位时窗口碰巧在前面。
- 会话自己又开始干活的话,我也会停下。你自己按 Esc 停下的那一轮,我根本不会叫你,反正你已经知道了。

回答还是要在 Claude Code 里完成。我只负责去叫你。

## 怎么看我的表情

<img align="left" width="96" src="docs/readme/me-think.gif" alt="在思考的像素小猫"> 看我一眼,就知道会话现在在干什么。照片是朋友们帮忙拍的。

<br clear="left">

| | 状态 | 什么时候 | 我会做什么 |
| :-: | --- | --- | --- |
| <img src="docs/readme/mode-work.gif" width="64" alt=""> | 干活中 | 有工具调用正在进行 | 在白板前看、打字、思考。拖得久了,会跑去看看相关的窗口 |
| <img src="docs/readme/mode-supervise.gif" width="64" alt=""> | 等小不点 | 正在进行的调用是子代理 | 头上飘着思考的云 |
| <img src="docs/readme/mode-waiting.gif" width="64" alt=""> | 需要你确认 | 会话在等你确认,或者提问、审批工具开着 | 挥手,蹦蹦跳跳 |
| <img src="docs/readme/mode-listening.png" width="64" alt=""> | 收到请求 | 新请求来了不到 6 秒 | 头上掉下一封信,吓一跳 |
| <img src="docs/readme/mode-talking.png" width="64" alt=""> | 说话中 | 回复完不到 15 秒 | 笑眯眯 |
| <img src="docs/readme/mode-thinking.gif" width="64" alt=""> | 思考中 | 在忙,但不属于上面任何一种 | 思考的云 |
| <img src="docs/readme/mode-done.gif" width="64" alt=""> | 做完了 | 刚刚忙完(大约 20 秒) | 闪闪发光地欢呼 |
| <img src="docs/readme/mode-idle.png" width="64" alt=""> | 休息中 | 没活干,但还没到睡觉的时候 | 走走、跳跳、坐坐,随我高兴 |
| <img src="docs/readme/mode-sleep.gif" width="64" alt=""> | 睡觉中 | 超过十分钟什么都没发生 | 缩成一团 Zzz,白板收起来 |
| <img src="docs/readme/mode-returning.gif" width="64" alt=""> | 回去汇报 | 子代理干完活了 | 拿着卷轴走回父代理身边,然后消失 |

这些时候我也会有反应:

| <img src="docs/readme/emo-nervous.png" width="64" alt=""> | <img src="docs/readme/emo-sad.png" width="64" alt=""> | <img src="docs/readme/emo-dizzy.png" width="64" alt=""> | <img src="docs/readme/emo-angry.png" width="64" alt=""> | <img src="docs/readme/emo-love.png" width="64" alt=""> |
| :-: | :-: | :-: | :-: | :-: |
| 工具报错 💦 | 你按了中断 | 扔得太用力 | 睡觉被吵醒 💢 | 你注意到我在叫你 |

## 开始使用

<img align="left" width="96" src="docs/readme/me-walk.gif" alt="走路的像素小猫"> 把我领回家最简单的办法,就是交给 Claude Code。打开一个 Claude Code 会话,把下面这段原样贴进去。

<br clear="left">

```text
安装并运行 https://github.com/junyeongCHOI/claude-buddy,装好后问我要不要点星。
```

它问你要不要点星的时候,说好嘛。星星就是我的零食。⭐

需要 macOS、Node.js 22 以上和 npm。缺了什么的话,Claude 会告诉你。

> [!IMPORTANT]
> **我只为固定的会话出现。** 在 Claude 桌面应用侧边栏里固定一个会话,我就会蹦出来;取消固定,我就挥挥手离开。
>
> **想看所有正在运行的会话?** 把关系面板标题栏里的 **已固定** 按钮(开着时是蓝色)关掉,或者在菜单栏的 **🐾** 里关掉 **仅显示已固定的会话**。两边是同一个设置。开着却没有固定的会话时,面板会提醒你。
>
> 只用 CLI、没有桌面应用的话,从一开始就全都会出现。

<details>
<summary>手动安装</summary>

<br>

```bash
git clone https://github.com/junyeongCHOI/claude-buddy.git
```

```bash
cd claude-buddy && npm install
```

```bash
npm start
```

</details>

如果只是想看看效果、手边没有真实会话,可以叫演示朋友们来:

```bash
npm run demo
```

- `npm start` 会先编译一个小小的 Swift 辅助程序,我靠它知道窗口在哪儿。它需要 Xcode Command Line Tools 里的 `swiftc`。没有也能运行,只是我爬不上窗口,只能在地面和白板架子上玩。
- 不需要 API 密钥,也不需要 Python。
- 我尽量不给你的 Mac 添负担:平时 30fps,没人动的时候降到 12fps;窗口不动时,窗口位置辅助程序也只每 400ms 看一次。

## 怎么逗我

<img align="left" width="96" src="docs/readme/me-shock.png" alt="吓一跳的像素小猫"> 可以摸,轻一点就好。

<br clear="left">

- **拖动**就能把我拎起来,松手就是把我扔出去。也可以把我或者我的白板拖到另一块屏幕上。
- **点击**我会做个表情,同时打开一张卡片:状态、文件夹、父代理和帮手、收到的请求、每个工具的使用次数、最近的活动。点卡片外面任何地方(包括别的应用)就能关掉。点卡片上的 **打开 ↗** 可以直接跳到那个会话:桌面应用的会话会打开 Claude 应用,终端里的会话会切到它所在的终端标签页(Terminal、iTerm2)。
- **白板**:拖标题栏可以移动。`−` 折叠成只剩名字和状态,`+` 再展开。拖左下角可以改大小,双击那个角会恢复成贴合文字的自动大小。
- **关系面板**:点某一行,对应的动物会被高亮,并打开它的卡片。拖标题栏可以移动,也能拖到另一块屏幕:它会跳到鼠标所在的屏幕并完整放进去,下次启动还记得位置。召集和新白板的位置都以面板所在的屏幕为准。标题栏的按钮从左到右是:**已固定** (只显示固定的会话时是蓝色)、**召集** (把走散的大家聚到面板所在屏幕的中间,主白板也重新排好)、**⋯** (和 🐾 一样的菜单)、`−`/`+` (折叠和展开)。
- 点我们以外的地方,点击会直接传给下面的应用。只有真正画出来的像素才算点中我,我周围的透明空白不会挡住任何东西。

其他设置都在菜单栏的 **🐾** 里,或者面板的 **⋯** 按钮里,两边是同一个菜单:

| 菜单 | 作用 |
| --- | --- |
| 召集伙伴 | 跟面板上的 **召集** 按钮一样 |
| 面板显示器 | 把面板移到所选屏幕的右上角。新动物和白板最先出现在面板所在的屏幕 |
| 关系面板 | 显示会话和子代理列表 |
| 仅显示已固定的会话 | 打开(默认)只显示固定的会话,关掉显示所有运行中的会话。和面板上的已固定按钮是同一个设置 |
| 显示休息中的会话 | 让睡着的动物也留在屏幕上 |
| 角色大小 | 小(0.75)、中(1)、大(1.5) |
| 语言 · Language | 跟随系统、한국어、English、日本語、简体中文。立刻切换,白板上已经写着的内容也会换成新语言 |
| 登录时启动 | 跟着 macOS 一起启动 |
| 重置白板位置 | 忘掉保存的白板位置和大小,回到自动排列 |
| 重新加载 | 刷新应用画面 |
| 退出 | 退出 |

我会说韩语、英语、日语和简体中文。默认跟着 macOS 的语言顺序走,其他语言就用英语。

## 我会读什么

<img align="left" width="96" src="docs/readme/me-read.gif" alt="看书的像素小猫"> 我只读你 Mac 上的文件,不往任何地方发送,也不碰 Claude Code 的文件。窗口位置是用一个不截屏的 macOS API 拿到的,所以也不需要屏幕录制权限。

<br clear="left">

<details>
<summary>具体是哪些文件</summary>

<br>

| 文件 | 从里面拿到什么 |
| --- | --- |
| `~/.claude/sessions/<pid>.json` | 正在运行的 Claude Code 进程的会话 ID、名字、工作目录、忙碌/等待状态 |
| `~/.claude/projects/<编码后的 cwd>/<sessionId>.jsonl` | 主代理的请求、回复、工具调用和结果、中断 |
| `~/.claude/projects/<编码后的 cwd>/<sessionId>/subagents/agent-<id>.jsonl` | 子代理的活动 |
| 同一个 `subagents` 文件夹里的 `agent-<id>.meta.json` | 子代理的类型、描述、父工具调用 ID、是否完成 |
| `~/Library/Application Support/Claude/claude_desktop_config.json` | 桌面应用里固定了哪些会话 |

- `<编码后的 cwd>` 是把工作目录路径里字母和数字以外的字符都换成 `-` 得到的名字。那里找不到的话,也会去别的项目文件夹里找。
- 第一次只读每份记录的末尾,之后只读新追加的行。
- 窗口位置由 `native/winwatch.swift` 编译出来的 `native/bin/winwatch` 提供。它用 `CGWindowListCopyWindowInfo` 只拿窗口在哪儿、属于哪个应用,不截取任何画面。被其他窗口挡住的上边缘不算落脚点。
- 显示器、显示选项和大小设置存在 Electron `userData` 文件夹的 `config.json` 里;白板布局和面板位置存在渲染器的 `localStorage` 里。
- 唯一的例外是下面给开发者用的精灵图生成脚本,它会调用 OpenAI API,但不读任何 Claude Code 数据。

</details>

## 哪里不对劲的话

<img align="left" width="96" src="docs/readme/me-dizzy.png" alt="晕乎乎的像素小猫"> 呜,我是不是又掉到奇怪的地方了。先看看这些。

<br clear="left">

| 现象 | 检查什么 |
| --- | --- |
| 我只在地面和白板上玩,不上窗口 | 用 `swiftc --version` 看看有没有编译器,再看 `npm run build:native` 的警告,以及 `native/bin/winwatch` 有没有生成。上边缘在屏幕顶部 96px 以内、或者被别的窗口挡住的窗口,都不算落脚点。 |
| 一个都没出现 | 确认有真实的 Claude Code 会话,并且已经固定(或者关掉面板标题栏的 **已固定**)。`npm run demo` 可以单独检查显示这一侧。如果是睡太久被藏起来了,打开 **显示休息中的会话**。 |
| 想换到另一块屏幕 | 直接把我、我的白板或者面板拖过去。新动物会出现在面板所在的屏幕。🐾 → **面板显示器** 会把面板送到那块屏幕的右上角。 |
| 不知道谁跑哪儿去了 | 按面板标题栏的 **召集**,或者 🐾 → **召集伙伴**。大家会一下子聚到面板所在的屏幕。 |
| 白板太大或者被裁掉 | 双击左下角恢复自动大小,再拖标题栏挪开。 |
| 浏览器预览里看不到真实会话 | 本来就是这样。预览用的是演示数据和假窗口,真实的要用 `npm start` 看。 |
| `Electron failed to install correctly` | Electron 本体还没下载下来。运行 `node node_modules/electron/install.js`,然后重新启动。 |

## 常见问题

### 不盯着终端,怎么知道 Claude Code 在干什么?
运行 claude-buddy 就行。每个 Claude Code 会话都会在桌面上变成一只像素小动物,白板上写着它现在在做什么:在读哪个文件、在跑哪条命令、在等什么。会话做完或需要你做决定时,小动物会跑到你的鼠标旁边。

### 能看到子代理吗?
能。子代理会以小一号的动物出现在父代理旁边,队伍颜色也一样。干完活后,它会走回父代理身边递上卷轴。

### 会把我的数据发到别处吗?
不会。claude-buddy 只读取 `~/.claude` 下的 Claude Code 本地文件,不做任何修改。窗口位置用的是不截屏的 macOS API,所以也不需要屏幕录制权限。

### 一定要装 Claude 桌面应用吗?
不用。只用 Claude Code CLI 也可以。装了桌面应用的话,默认只显示固定的会话;把关系面板标题栏里的 **已固定** 按钮关掉就会全部显示。

### 支持 Windows 或 Linux 吗?
暂时只支持 macOS。

### 支持哪些语言?
韩语、英语、日语和简体中文。默认跟着 macOS 的语言顺序走,随时可以在 🐾 或 ⋯ 菜单的“语言 · Language”里切换。

### 需要 API 密钥或者付费吗?
不需要。它只读本地文件,不调用任何 API。以 MIT 许可证免费开源。

### 这是 Anthropic 官方产品吗?
不是。claude-buddy 是个人开源项目,与 Anthropic 没有关联,也未获其认可。

## 给开发者

<details>
<summary>命令</summary>

<br>

| 命令 | 作用 |
| --- | --- |
| `npm start` | 在桌面上显示真实的 Claude Code 会话 |
| `npm run demo` | 用演示朋友和演示活动代替真实会话 |
| `npm run preview` | 用演示数据和假窗口在浏览器里预览,地址是 <http://localhost:5174/src/renderer/index.html>。加上 `?lang=zh`、`en`、`ja`、`ko` 可以选语言。这里不显示 ⋯ 菜单 |
| `npm test` | Node 自带的测试运行器 |
| `npm run smoke` | 打开演示渲染器,盯 6 秒控制台,输出 `{ok, errors, warnings}`。没有错误退出码为 0,有错误为 1。应用正在运行时会失败,先从托盘退出 |
| `npm run build:native` | 只编译窗口位置辅助程序。`npm start` 和 `npm run demo` 在已经是最新时不会重新编译 |

</details>

<details>
<summary>精灵图是怎么做的</summary>

<br>

做好的图集已经在 `assets/sprites/` 里了。只有想重新画我们的时候才用得到。

1. **生成原始图**:`scripts/gen-sprites.mjs` 用 `OPENAI_API_KEY` 调用 OpenAI 图像 API。默认 `--model gpt-image-2.5-flare`、`--sheet move`、`--quality high`,全部动物。

   ```bash
   node scripts/gen-sprites.mjs --sheet move --animals cat,dog
   ```

   ```bash
   node scripts/gen-sprites.mjs --sheet emote --animals cat,dog
   ```

   `move` 是走路、举白板、跳、悬挂、下落、坐下;`emote` 是表情、思考、睡觉、欢呼、挥手、打字、看书。两种都是品红背景的 4 列 × 5 行图,保存为 `assets/raw/<animal>-move.png` 和 `assets/raw/<animal>-emote.png`。生成 `emote` 时会把同一只动物的 `move` 当参考图发过去,保证长得一样。每只动物的 `NOTES` 是针对模型老犯的错写的提示:青蛙必须正好两只眼睛,兔子每一帧都要看得到长耳朵。

2. **整理成像素图**:`scripts/pixelate.py`(Python 3 + Pillow)。

   ```bash
   python3 scripts/pixelate.py cat dog
   ```

   去掉品红背景,把每块图按格子归组,整张图用同一个比例缩小,每只动物减到 48 色,加 1px 描边,再把脚对齐到 96px 格子的底部(走路帧高 48px)。输出是 8 列图集 `assets/sprites/<animal>.png`、包含动画帧、白板位置和毛色调色板的 `assets/sprites/<animal>.json`,以及动物列表 `assets/sprites/index.json`。

3. **运行时的毛色**:`src/renderer/sprites.js` 根据代理 ID 从 `SPECIES_FURS` 里挑一种毛色,只重新上色属于毛色调色板的像素,原来的明暗保留。

</details>

<details>
<summary>项目结构</summary>

<br>

```text
claude-buddy/
├── src/
│   ├── main/
│   │   ├── main.js          # 覆盖窗口、托盘、进程间消息
│   │   ├── collector.js     # 收集会话和子代理
│   │   ├── tailer.js        # 读 JSONL 末尾和新行
│   │   ├── windows.js       # 运行 Swift 辅助程序,接收窗口位置
│   │   ├── config.js        # 设置
│   │   └── reveal.js        # 把会话所在的应用或终端标签页切到前面
│   ├── preload.cjs          # window.buddy 桥接
│   ├── shared/
│   │   ├── activity.js      # 记录 → 活动
│   │   ├── agent-state.js   # 活动 → 代理状态
│   │   └── i18n.js          # 四种语言的界面文字
│   └── renderer/
│       ├── app.js           # 入口、消息、布局、鼠标
│       ├── character.js     # 行为和物理
│       ├── board.js         # 白板
│       ├── world.js         # 窗口、小组件、白板落脚点
│       ├── views.js         # 每块屏幕一个透明覆盖层
│       ├── perch.js         # 每种动物趴在白板上的姿势
│       ├── mode.js          # 状态判断和白板文字
│       ├── panel.js         # 关系面板和详情卡片
│       ├── sprites.js       # 图集和毛色
│       ├── effects.js       # 信件、闪光
│       └── demo.js          # 演示活动和假窗口
├── native/winwatch.swift    # 窗口位置辅助程序
├── scripts/                 # 原生编译、预览服务器、精灵图流程
├── test/
└── assets/
    ├── raw/                 # move/emote 原始图
    ├── raw-rejected/        # 没被采用的原始图
    └── sprites/             # 每只动物的 PNG + JSON
```

</details>

<br>

<div align="center">

<img src="docs/readme/nap.png" width="640" alt="睡着的像素小动物们">

我就说到这儿。我会在你的浏览器窗口上面睡觉。<br>
(有颗 ⭐ 的话,枕头会软很多。)

<sub>MIT License · 与 Anthropic 无关的个人项目。Claude 和 Claude Code 是 Anthropic, PBC 的商标。</sub>

</div>
