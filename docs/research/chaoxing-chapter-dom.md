# 超星章节列表 DOM 观察（临时记录）

- 时间：2026-10-18 21:00 左右
- 浏览器：Edge / CDP 9222 / 独立 profile
- 页面：
  - 课程主页（马原，iframe `frame_content-zj`）
  - 单章节学习页（`studentstudy`）

## A. 课程主页的章节列表

章节列表在 iframe `frame_content-zj` 内，页面本身是：

`https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?...`

结构：

- 小节：`div.chapter_item`
  - `id="cur<chapterId>"`
  - `onclick="toOld('courseId','chapterId','clazzid',0)"`
  - `href="javascript:;"`（不是真实 URL）
  - `title` 属性是干净标题
- 单元标题：同样是 `div.chapter_item`，但没有 `id`、没有 `onclick`，不能当章节点点
- 全列表 68 项（8 个单元 + 60 个小节）
- iframe 内文档滚动：`scrollHeight=4010`，视口高 `776`

`toOld` 的 URL 逻辑（iframe 主世界）：

```js
var enc = "0f37a4a54ef3782ce2861c7ab9041a7d";
var cpi = 489489147;
var referUrl = mooc1Domain + "/mycourse/studentstudy?chapterId=" + knowledgeId
  + "&courseId=" + courseid + "&clazzid=" + clazzid + "&cpi=" + cpi
  + "&enc=" + enc + "&mooc2=1&hidetype=0&fanyaVersion=0";
var transferUrl = mooc1Domain + "/mycourse/transfer?moocId=" + courseid
  + "&clazzid=" + clazzid + "&linkTime=" + Date.now() + "&ut=s&refer="
  + encodeURIComponent(referUrl);
top.location.href = transferUrl;
```

注意：

- 课程主页面地址栏里的 `enc=128096...` **不是** `toOld` 用的 `enc`；
- 用课程主页地址栏的 `enc` 拼 `studentstudy`，实测返回“温馨提示 / enc校验失败”；
- `toOld` 源码里写死 `enc=0f37...`，这个才是可用的 studentstudy 参数。

## B. 单章节学习页的目录

页面：

`https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=...`

结构：

- 滚动容器：`#coursetree`
  - `rect: x=1088, y=161, w=432, h=700`
  - `scrollHeight=2753`，`clientHeight=700`
- 章节目录行：`div.posCatalog_select`
  - 小节行：`id="cur<chapterId>"`，可点的是内部 `span.posCatalog_name`
  - `onclick="getTeacherAjax('courseId','clazzid','chapterId')"`
  - `title` 属性是干净标题
  - 当前章节有 `posCatalog_active` class
- 单元行：`div.posCatalog_select.firstLayer`，无 `onclick`，不能当章节点
- 点击是 AJAX：`getTeacherAjax` 请求 `/mycourse/studentstudyAjax`，替换 `#mainid`，不一定整页跳转

直接 URL：

- 把当前 `studentstudy` URL 的 `chapterId` 替换成目标章节 ID；
- 实测 `2.2`：返回 `200`，页面包含目标章节标题，没有 `enc校验失败`；
- 说明单章节页的 URL 可以从当前 URL + chapterId 稳定派生。

## C. 图三的遮挡物

`cx-robot-wrapper`（学习助手/星星机器人）：

- class：`cx-robot-wrapper root-class cx-mooc small`
- `position: fixed`
- `right: 20px; bottom: 100px`
- `z-index: 999999`
- `pointer-events: auto`
- 当前 rect：`x=1260, y=668, w=240, h=60`
- 内部包含 `IMG.small-figure`

命中测试（单章节页，`#coursetree.scrollTop=0`）：

- `2.1 科学的实践观及其意义` 行中心 `(1300, 701)` → 最上层是 `IMG.small-figure`，不是章节；
- 同一行左侧 `(1130, 701)` → `SPAN.posCatalog_name`，能命中真正的章节点击区；
- `2.2` 行中心 `(1300, 741)` → `SPAN.posCatalog_name`，因为已在浮层下方。

结论：

- 不能无脑点元素中心；
- 但可以在元素内部做 `elementsFromPoint` 命中测试，选一个真正落在目标/目标子孙上的点；
- 如果整块目标都被遮挡，退回 DOM 点击并报告 `method=dom`；
- 不改变目标、不猜文字、不换元素。

## D. 对后续工具设计的直接结论

1. 章节元素没有可直接使用的 `href` URL；只有 `chapterId` 和页面 JS。
2. 单章节页可以直接派生 URL；课程主页只能从 `toOld` 源码/执行结果拿，或 DOM 点击让页面自己跳。
3. `page_outline` 应输出稳定节点：
   - `chapter_id`
   - `title`
   - `level`（unit / section）
   - `element_id`
   - `state`（current / completed / 其他）
   - `task_count`（与章节号分开）
   - `url` / `url_source`（href / derived / js / unknown）
   - `frame_id`
4. `mouse_click` 不接受文字选择，只接受稳定元素 ID 或坐标；
   - 内部做命中测试选点；
   - 返回 `clicked_at`、`hit_chain`、`method`、`blocked_by`；
   - 不用中心点硬点。
5. `wheel_scroll` 要显式指定滚动对象：
   - frame（滚文档）
   - 元素（滚最近可滚动祖先，或指定 `#coursetree`）
   - 点（真实滚轮落点）
   - 返回实际滚动的容器和前后位置。
6. 所有页面判断都可以不依赖截图：DOM、命中测试、URL、页面 JS 足够。

## E. 已知风险

- `enc` 可能有时效/会话绑定；拼出的 URL 仍要实际打开验证。
- `toOld` 的 enc/cpi 是页面内写死的值，换课程/会话可能变化；不能当作全局常量。
- 机器人浮层的位置会随窗口尺寸/页面变化；每次观察都应重新做命中测试。
- `getTeacherAjax` 是 AJAX 局部刷新，页面 URL 不一定同步变化；不能只靠 URL 判断当前章节。

## F. 标签页 3 的滚动观察（马原单章节页）

页面布局：

- 顶层文档可滚动：
  - `document.scrollingElement.scrollHeight = 2141`
  - `clientHeight = 828`
  - 最大 `scrollTop = 1313`
  - `body` 自身 `scrollHeight = 828`，不是 body 滚
- 左侧主内容：`iframe#iframe`
  - rect：`x=0, y=166, w=1088, h=1827`
  - 它自己的文档：`scrollHeight = 1827`，`clientHeight = 1827`
  - **iframe 内部不能滚**，内容按 1827 高度完整铺开，靠顶层文档滚动
- 右侧目录：`#selector` 固定定位，`x=1088, y=40, w=432, h=788`
- 目录列表：`#coursetree`
  - rect：`x=1088, y=161, w=432, h=700`
  - `scrollHeight = 2753`，`clientHeight = 700`
  - 最大 `scrollTop = 2053`
  - 和顶层文档是两条独立滚动轴

实测（页面可见时）：

1. 鼠标滚动落在左侧主内容 `(600, 500)`：
   - 顶层文档 `scrollY` 增加 500；
   - `#coursetree.scrollTop` 保持 0；
   - 说明滚轮穿透了 iframe，滚动链最后落到顶层文档。
2. 鼠标滚动落在顶部 header `(600, 100)`：
   - 同样滚动顶层文档；
   - 说明不是只有 iframe 区域才能滚。
3. 鼠标滚动落在右侧目录 `(1300, 400)`：
   - `#coursetree.scrollTop` 增加 500；
   - 顶层文档 `scrollY` 不变；
   - 说明目录是独立滚动容器。
4. 反向滚动可以恢复，两个轴互不影响。
5. touch 手势在这个桌面页面没有产生滚动。

CDP 输入行为：

- `Input.dispatchMouseEvent` 的 `mouseWheel` 在当前页面会挂起（5 秒无响应）；
- `Input.synthesizeScrollGesture` + `gestureSourceType: "mouse"` 可以正常滚动；
- 页面 `visibilityState = "hidden"` 时：
  - `synthesizeScrollGesture` 返回 `ok`，但没有滚动；
  - `Runtime.evaluate` 里执行 `window.scrollTo()` / `coursetree.scrollTop = ...` 仍然有效。

结论：

- “滚动”不能只按当前页面/document 处理，必须先确定要滚的是：
  - 顶层文档；
  - 某个 iframe 的文档；
  - 某个 `overflow: auto/scroll` 的元素（如 `#coursetree`）。
- 不能假设 iframe 一定内部可滚：这里 iframe 高度等于内容高度，真正的滚动在父文档。
- 隐藏/最小化状态下，物理输入事件可能不生效，但 DOM/JS 级滚动仍可用；这与“非视觉工具”方向一致，但也说明 `wheel_scroll` 不能只依赖 CDP 鼠标滚轮，必须有 frame/container 级滚动路径。

## G. 标签页 2：沟通与写作，内嵌文档滚动

页面：

`https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=605891420&courseId=217785077...`

### 结构

- 顶层文档：
  - `scrollingElement.scrollHeight = 5295`
  - `clientHeight = 828`
  - 最大 `scrollTop = 4467`
- 左侧内容容器 `iframe#iframe`：
  - rect：`x=0, y=116, w=1088, h=5031`
  - 自身 `scrollHeight = clientHeight = 5031`
  - 同样不是 iframe 内部滚，而是顶层文档滚
- `iframe#iframe` 内部是多个任务模块：
  - 2 个 PDF 文档模块
  - 5 个视频模块
- 每个 PDF 模块内部又有一个 `panView` iframe，例如：
  - 第 1 个：`panView` frame id `1887B4...`，`scrollHeight=14148`，`clientHeight=546`，最大 13602
  - 第 2 个：`panView` frame id `DCDA06...`，`scrollHeight=7666`，`clientHeight=546`，最大 7120
- PDF 文档自己才是滚动容器：
  - `document.scrollingElement` 是 scroller；
  - `body.scrollTop` 始终是 0，`body.scrollHeight` 等于内容高度；
  - 不能看 body。

### 实测

- 在 `panView` 里程序化设置：
  - `scrollingElement.scrollTop = 500` → 实际到 500；
  - `scrollingElement.scrollTop = scrollHeight` → 到 13602（底部）；
  - 页面 `visibilityState = "hidden"` 时仍然有效。
- 这说明“滚到底完成任务点”的滚动域是**PDF 文档自己的 frame document**，不是顶层页面，也不是外层 iframe。

### 结论

- 页面里可能存在**多层、多个独立文档滚动域**：
  1. 顶层文档（滚模块列表）；
  2. 右侧目录 `#coursetree`；
  3. 每个 PDF 的 `panView` 文档（各自有不同的最大 scrollTop）；
  4. 视频模块可能以后出现自己的内部滚动/控制域。
- `page_snapshot` 必须对每个 frame 输出：
  - `document_scrollable`
  - `scroll_top / scroll_height / client_height / max_scroll`
  - 以及 iframe 自身的 rect（用于判断它在顶层的位置）。
- 只滚顶层文档只能把 PDF 模块带到视口，不能完成 PDF 的阅读任务点；必须继续滚 `panView` 文档。
- 只滚 `iframe#iframe` 也不行，因为它 `scrollHeight == clientHeight`。
- 所以 `wheel_scroll` 的 `target` 必须能指向“某个 frame 的 document”，而不只是当前页面或某个元素。
- 对这类“必须滚到底才算完成”的任务，工具应支持滚到 `max_scroll`，然后重新观察任务点状态；不要根据 `scrollTop` 自己判定完成。

### 前台依赖

- 页面 hidden 时：
  - 物理滚轮手势无效；
  - `Runtime.evaluate` 里的 `scrollTop` 设置有效；
  - `element.click()` 这类 DOM 事件也不依赖前台。
- 因此默认执行路径应是 CDP DOM/JS，而不是 `Input.*` 真实输入。
- `Input.*` 只能作为“页面确实要求 trusted event”时的可选回退；如果 hidden 状态下不可用，应明确返回 `REQUIRES_FOREGROUND`，不能静默假成功。
- 视频播放可优先用 `HTMLMediaElement.play()`；页面自己的 `visibilitychange` 暂停逻辑是另一个独立问题。

## H. 非前台操作的语义差异

后台/非前台执行有三层，不能混为一谈：

1. **DOM/JS 操作**
   - `element.click()` 触发的事件 `isTrusted = false`（已实测）；
   - 没有真实的 pointerdown / pointerup / hover / focus 序列；
   - 某些框架能正常处理，某些反自动化/安全检查会拒绝；
   - `scrollTop` 会改变位置，但不会触发真实 `wheel` 事件，只可能触发 `scroll`；
   - `video.play()` 可能受 autoplay 策略影响，可通过 `Runtime.evaluate({ userGesture: true })` 提供用户激活，但事件仍不是 trusted。

2. **CDP `Input.*`**
   - 更接近真实输入，通常能产生 trusted 事件；
   - 但实测页面 hidden 时：
     - `Input.dispatchMouseEvent` 的 `mouseWheel` 会挂起；
     - `Input.synthesizeScrollGesture` 返回 `ok` 但不产生滚动；
   - 所以“CDP 非前台输入”并不等于“物理输入”，也不能保证在最小化时有效。

3. **OS 级物理输入**
   - 最接近用户操作；
   - 但必须前台/可见，和插件初衷冲突。

结论：

- 默认路径应是 **DOM/JS**，它能在 hidden 状态下工作；
- `delivery: "trusted"` 只能作为显式可选回退；
- hidden 状态下需要 trusted 输入时，应返回 `REQUIRES_FOREGROUND`，不能静默失败或偷偷切前台；
- 工具结果必须报告 `method` 和 `trusted`，让模型知道这次操作是 DOM 合成还是 trusted 输入。
