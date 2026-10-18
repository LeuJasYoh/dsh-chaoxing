# 浏览器工具契约 v1

- 状态：设计定稿，实现未开始
- 日期：2026-10-18
- 插件：`dsh-xuexi-next` / 预设 `xuexi-next`
- 观察依据：[超星章节 DOM 与滚动观察](../research/chaoxing-chapter-dom.md)

## 0. 一句话

> 工具只描述“操作哪个对象、做什么物理动作”，不描述业务意图；  
> 默认后台执行，需要时显式切换前台；两种模式都不替模型判断成功；  
> 结果只报告事实和稳定句柄。

---

## 1. 执行模型：非前台模拟操作 ≠ 物理操作

这是本设计的第一约束，后续所有工具都按它设计。

### 1.1 两种执行模式

| 模式 | 典型实现 | 页面可见要求 | 事件 `isTrusted` | 是否切前台 |
|---|---|---|---|---|
| `background`（默认） | DOM/JS：`element.click()`、`scrollTop`、`video.play()` | 无 | `false` | 否 |
| `foreground`（显式） | CDP `Input.*`：鼠标、滚轮、按键 | 是 | 通常 `true` | 允许，仅限显式请求时 |

OS 物理输入不纳入工具实现；`foreground` 已经足够接近真实输入，同时仍可由插件统一控制。

### 1.2 必须记住的差异

DOM/JS 操作：

- `element.click()` 的 click 事件 `isTrusted = false`（已实测）；
- 没有真实 pointerdown / pointerup / hover / focus 序列；
- 不会产生 `:active` 等原生视觉状态；
- `scrollTop` 不产生真实 `wheel` 事件，只可能产生 `scroll`；
- `video.play()` 可能受 autoplay 策略影响；
- `Runtime.evaluate({ userGesture: true })` 可以提供用户激活，但**不会**把事件变成 trusted。

CDP `Input.*`：

- 更接近真实输入，通常产生 trusted 事件；
- 但页面 hidden 时：
  - `Input.dispatchMouseEvent` 的 `mouseWheel` 会挂起；
  - `Input.synthesizeScrollGesture` 返回 `ok` 但不产生滚动；
- 因此 `foreground` 模式必须先确保页面可见；不能把 CDP 输入当成“非前台可用的物理操作”。

### 1.3 工具规则

1. 需要选择投递路径的交互工具共享 `execution` 参数，默认值为 `"background"`；
2. `background` 不要求前台、不调用 `Page.bringToFront`，走 DOM/JS；
3. `foreground` 只在调用方显式指定时使用；允许把目标页面/窗口带到前台，再走 CDP trusted 输入；
4. `foreground` 失败时返回 `FOREGROUND_UNAVAILABLE`，不静默回退 `background`；
5. `background` 失败/无效果时，也不自动切前台；由模型看结果后决定是否显式重试 `foreground`；
6. 任何工具都不把“操作已发送”当成“页面已接受”；
7. 结果必须报告 `execution`、`method`、`trusted`、`fronted`。

页面 hidden 时视频可能被页面自己的 `visibilitychange` 逻辑暂停，这是页面行为，不是工具层的前台依赖；后续单独处理。

---

## 2. 命名

统一格式：

> **`<对象/范围>_<动作>`**，两段，snake_case。

名字只描述对象和动作，不出现 `select_chapter`、`submit_answer`、`play_video` 这类业务意图。

### 2.1 v1 工具

| 工具 | 类型 | 作用 |
|---|---|---|
| `page_snapshot` | 眼 | 当前页面/视口快照：frames、滚动域、模块、媒体、元素、浮层 |
| `page_outline` | 眼 | 完整章节/目录树，分页，稳定元素句柄 |
| `element_click` | 手 | 按元素句柄点击；默认后台，可显式前台 |
| `scroll_domain` | 手 | 滚动指定滚动域；默认后台，可显式前台 |
| `page_navigate` | 导航 | URL / 后退 / 前进 / 刷新 |
| `media_play` | 媒体 | 播放指定媒体元素 |
| `media_pause` | 媒体 | 暂停指定媒体元素 |

### 2.2 Phase 2

| 工具 | 作用 |
|---|---|
| `page_text` | 读取元素/区域文本，分页 |
| `keyboard_type` | 向输入框/可编辑元素输入文本 |
| `keyboard_press` | 发送按键 |
| `media_seek` | 跳转媒体时间 |

Phase 2 中 `keyboard_type` / `keyboard_press` 将支持 `execution`，默认 `background`；`page_text` / `media_seek` 固定 background。

### 2.3 暂不实现

- `point_click`（画布/坐标点击）
- `tab_list` / `tab_select`
- 对话框处理
- 右键、拖拽、悬停
- 文件上传

---

## 3. 通用契约

### 3.1 统一信封

```json
{
  "ok": true,
  "tool": "page_snapshot",
  "generation": 3,
  "page": {
    "url": "https://...",
    "title": "学生学习页面",
    "visibility": "hidden"
  },
  "data": {},
  "error": null
}
```

- `ok: true` 只表示**工具成功执行**，不表示业务成功；
- `ok: false` 一定带 `error`；
- `generation` 是操作后的文档代次；
- `page` 是操作后观察到的页面身份。

### 3.2 错误对象

```json
{
  "code": "FOREGROUND_UNAVAILABLE",
  "message": "foreground execution requested but the target page could not be made visible",
  "hint": "retry with execution=background, or make the page visible manually",
  "observed": {}
}
```

### 3.3 执行模式参数

所有需要选择投递路径的交互工具共享：

```json
{
  "execution": "background"
}
```

- `background`（默认）：DOM/JS，不切前台；
- `foreground`：显式请求前台，允许切前台 + CDP trusted 输入；
- `execution` 可省略，省略即 `"background"`；
- 结果中必须回显 `execution`；
- `method` 说明实际执行路径：`dom` / `cdp_input`；
- `fronted` 说明是否实际把页面带到前台。

`media_play` / `media_pause` 固定走 background，不提供 `execution`；需要 trusted 的播放按钮操作时，用 `element_click` + `execution: "foreground"`。

### 3.4 Target 绑定

- 插件一次只绑定一个 CDP page target；
- `page_snapshot` 返回 `target_id`；
- 不自动在多个标签页之间切换；
- 找不到 target 返回 `TARGET_NOT_FOUND`；
- 后续如需多标签，再加 `tab_list` / `tab_select`。

### 3.5 ID 与代次

| ID | 示例 | 作用域 |
|---|---|---|
| `element_id` | `e12` | 当前 generation，全局唯一 |
| `domain_id` | `d3` | 当前 generation |
| `module_id` | `m1` | 当前 generation |
| `frame_id` | CDP frame id | 当前 frame tree |

- 导航/刷新后 `generation` 递增；
- 旧 ID 操作返回 `STALE_ELEMENT` / `STALE_DOMAIN`；
- 不按文字回退查找；
- 不跨 frame 复用编号。

---

## 4. 滚动域模型

### 4.1 定义

滚动域是“一个真正可以被滚动的空间”，有三类：

1. **document**：某个 frame 的 `document.scrollingElement`；
2. **element**：某个 `overflow-y: auto|scroll` 且有溢出的元素；
3. 未来可扩展：overflow hidden 但支持 `scrollTop` 的容器。

每个域有：

```json
{
  "domain_id": "d3",
  "kind": "document",
  "frame_id": "1887B4...",
  "element_id": null,
  "label": "PDF：课程介绍 上",
  "related_module_id": "m1",
  "scroll_top": 0,
  "scroll_height": 14148,
  "client_height": 546,
  "max_scroll": 13602,
  "at_top": true,
  "at_bottom": false
}
```

element 类型：

```json
{
  "domain_id": "d2",
  "kind": "element",
  "frame_id": "main",
  "element_id": "e42",
  "label": "右侧章节目录",
  "related_module_id": null,
  "scroll_top": 0,
  "scroll_height": 1633,
  "client_height": 700,
  "max_scroll": 933,
  "at_top": true,
  "at_bottom": false
}
```

### 4.2 发现规则

- 对每个 frame 检查 `scrollingElement.scrollHeight - clientHeight > 1`；
- 对每个元素检查 `overflow-y` 为 `auto|scroll` 且 `scrollHeight - clientHeight > 1`；
- 不依赖 `body.scrollTop`；
- 不假设 iframe 自己可滚：可能出现 `iframe.scrollHeight == iframe.clientHeight`，真正滚动在父文档或更深层 frame；
- 每个域生成稳定 `domain_id`；
- 单次快照最多返回 30 个域，超出标记 `truncated`。

### 4.3 已知场景

- 顶层文档：滚动整个模块列表；
- 右侧目录：独立元素滚动；
- PDF：`panView` frame 自己的 document 滚动，最大 `scrollTop` 可能上万；
- 多 PDF：每个 PDF 有独立的滚动域，不能混用。

`scroll_domain` 只接受 `domain_id`，不接受“向下滚”这种模糊描述。

---

## 5. 页面与模块模型

### 5.1 page_kind

`page_outline` 识别：

- `chaoxing_course_home`：课程主页章节列表；
- `chaoxing_studentstudy`：单章节学习页目录；
- `unknown`：未识别页面。

未知页面不伪造 outline；返回 `page_kind: "unknown"` 和空节点，让模型使用 `page_snapshot`。

### 5.2 module

`page_snapshot` 返回当前页面的任务模块摘要：

```json
{
  "module_id": "m1",
  "type": "pdf",
  "title": "课程介绍 上",
  "frame_id": "2A6442...",
  "scroll_domain_id": "d3",
  "task_state": {
    "value": "completed",
    "signals": ["icon_Completed"]
  },
  "rect": { "x": 100, "y": 168, "w": 888, "h": 602 }
}
```

- `type`：`pdf` / `video` / `quiz` / `document` / `other`；
- `scroll_domain_id` 指向模块内部真正可滚的文档（如果有）；
- `task_state.value` 只允许 `completed` / `incomplete` / `unknown`，并带原始 `signals`；
- 不从颜色或截图判断状态。

### 5.3 media

```json
{
  "element_id": "v1",
  "kind": "video",
  "frame_id": "...",
  "rect": { "x": 100, "y": 1445, "w": 888, "h": 566 },
  "paused": true,
  "current_time": 0,
  "duration": 0,
  "ready_state": 0,
  "ended": false,
  "muted": false,
  "volume": 1
}
```

---

## 6. 工具定义

## 6.1 `page_snapshot`

### 输入

```json
{
  "frame_id": null,
  "scope": "viewport",
  "limit": 120
}
```

- `frame_id`：可选；默认主 frame；
- `scope`：`viewport`（默认）或 `document`；
- `limit`：交互元素上限，默认 120，最大 300。

### 输出

```json
{
  "target_id": "3BF932...",
  "generation": 3,
  "page": {
    "url": "https://...",
    "title": "学生学习页面",
    "visibility": "hidden",
    "ready_state": "complete"
  },
  "frames": [
    {
      "frame_id": "main",
      "parent_id": null,
      "url": "https://...",
      "name": "",
      "rect": { "x": 0, "y": 0, "w": 1528, "h": 828 },
      "document_scroll": {
        "scroll_top": 0,
        "scroll_height": 5295,
        "client_height": 828,
        "max_scroll": 4467
      }
    }
  ],
  "scroll_domains": [],
  "modules": [],
  "media": [],
  "elements": [],
  "overlays": [],
  "truncated": {
    "frames": false,
    "domains": false,
    "modules": false,
    "elements": false
  }
}
```

`elements` 单项：

```json
{
  "element_id": "e12",
  "frame_id": "main",
  "tag": "SPAN",
  "role": "link",
  "name": "1.1 物质及其存在方式",
  "rect": { "x": 1088, "y": 361, "w": 424, "h": 40 },
  "visible": true,
  "enabled": true,
  "actionable": true,
  "signals": ["onclick", "pointer"]
}
```

- `actionable` 是事实信号，不是业务判断；
- 不做逐元素遮挡计算；遮挡由 `overlays` 和 `element_click` 的 foreground 结果报告；
- 不包含长文本；文本用后续 `page_text`；
- 默认只列视口内元素，避免上下文爆炸。

## 6.2 `page_outline`

### 输入

```json
{
  "frame_id": null,
  "limit": 100,
  "cursor": null
}
```

### 输出

```json
{
  "page_kind": "chaoxing_studentstudy",
  "outline_domain_id": "d2",
  "total": 68,
  "returned": 68,
  "next_cursor": null,
  "truncated": false,
  "nodes": []
}
```

`nodes` 单项：

```json
{
  "kind": "section",
  "index": "1.1",
  "title": "物质及其存在方式",
  "chapter_id": "1210980902",
  "task_count": 5,
  "state": {
    "current": false,
    "completed": true,
    "signals": ["icon_Completed"]
  },
  "element_id": "e12",
  "frame_id": "main",
  "actionable": true,
  "url": null,
  "url_source": "unknown"
}
```

规则：

- `unit` 节点 `actionable: false`，不能当章节点；
- `index`、`title`、`task_count` 分开；
- `url` 只在可验证时返回；`url_source` 为 `href` / `derived` / `js` / `unknown`；
- 不静默截断；
- 分页时原样返回 `next_cursor`。

## 6.3 `element_click`

### 输入

```json
{
  "target": {
    "kind": "element",
    "element_id": "e12"
  },
  "execution": "background",
  "pre_scroll": true
}
```

- `execution`：`background`（默认）或 `foreground`；
- `pre_scroll`：默认 `true`；只把目标滚进视口，不改变目标；
- v1 只支持左键单击，不接收文字参数。

### 输出

background：

```json
{
  "execution": "background",
  "method": "dom",
  "trusted": false,
  "fronted": false,
  "target_rect": { "x": 1088, "y": 201, "w": 424, "h": 40 },
  "pre_scroll": {
    "domain_id": "d2",
    "before": 0,
    "after": 120
  }
}
```

foreground 额外返回：

```json
{
  "execution": "foreground",
  "method": "cdp_input",
  "trusted": true,
  "fronted": true,
  "clicked_at": { "x": 1130, "y": 701 },
  "hit_chain": ["span.posCatalog_name", "div#cur1210980929"]
}
```

`foreground` 模式：

- 允许把目标页面/窗口带到前台，仅限本次显式请求；
- 页面 hidden 时先尝试恢复可见；失败 → `FOREGROUND_UNAVAILABLE`；
- 点击点中心被浮层覆盖时，先做命中测试，选目标内部安全点；
- 整个目标被遮挡 → `BLOCKED_BY_OVERLAY`；
- 不自动降级成 DOM 点击。

`background` 模式：

- 在目标 frame 的主世界执行 `element.click()`；
- 不切前台，不保证 `isTrusted`；
- 事件已发送即 `ok: true`，页面是否接受由模型后续观察；
- 不因为页面无反应而自动切前台。

## 6.4 `scroll_domain`

### 输入

```json
{
  "domain_id": "d3",
  "to": "bottom",
  "execution": "background"
}
```

或：

```json
{
  "domain_id": "d3",
  "delta_y": 800,
  "execution": "background"
}
```

- `to`：`top` / `bottom`；
- `delta_y`：正数向下，负数向上；
- `to` 和 `delta_y` 二选一；
- `execution`：`background`（默认）或 `foreground`。

`background`：

- 直接设置目标 document / element 的 `scrollTop`；
- 不切前台；
- hidden 下可用。

`foreground`：

- 允许切前台，然后向该滚动域的可见区域发送 trusted 滚轮手势；
- 滚动域必须可见；不能把域滚进视口后再滚（那会变成两步操作）；
- 页面无法恢复可见 → `FOREGROUND_UNAVAILABLE`；
- 不自动降级成 DOM 滚动。

### 输出

```json
{
  "domain_id": "d3",
  "execution": "background",
  "method": "dom",
  "trusted": false,
  "fronted": false,
  "before": {
    "scroll_top": 0,
    "max_scroll": 13602
  },
  "after": {
    "scroll_top": 13602,
    "max_scroll": 13602
  },
  "moved": 13602,
  "at_top": false,
  "at_bottom": true
}
```

foreground 时 `method = "cdp_input"`、`trusted = true`、`fronted = true`。

- 只改变位置；
- 不判断任务点是否完成；
- 不自动寻找“下一个章节”；
- 不自动跨滚动域链式滚动。

## 6.5 `page_navigate`

### 输入

```json
{
  "url": "https://..."
}
```

或：

```json
{
  "action": "back"
}
```

- `action`：`back` / `forward` / `reload`；
- `timeout_ms` 可选，默认 15000；
- 走 CDP 导航，不依赖前台。

### 输出

```json
{
  "url": "https://...",
  "title": "学生学习页面",
  "ready_state": "complete",
  "generation": 4,
  "timeout": false
}
```

导航超时仍返回 `ok: true`，带 `timeout: true` 和当前 `ready_state`；由模型决定是否继续等待/观察。

## 6.6 `media_play` / `media_pause`

### 输入

```json
{
  "target": {
    "kind": "element",
    "element_id": "v1"
  }
}
```

### 输出

```json
{
  "element_id": "v1",
  "method": "dom",
  "trusted": false,
  "user_gesture": true,
  "state": {
    "paused": false,
    "current_time": 1.2,
    "duration": 300,
    "ready_state": 4,
    "ended": false,
    "muted": false,
    "volume": 1
  }
}
```

规则：

- `media_play` / `media_pause` v1 固定走 background DOM/JS，不提供 `execution` 参数；
- 如果页面只接受 trusted 的播放按钮点击，用 `element_click` + `execution: "foreground"` 操作按钮；
- `media_play` 调用 `play()`，带 `userGesture: true`；
- 不等待播放结束；
- 不自动播放下一个；
- 多个媒体且未指定 target 时返回 `AMBIGUOUS_MEDIA`；
- 页面 hidden 时 `play()` 可能被页面暂停，这是页面行为；
- `PLAY_REJECTED` 表示浏览器/页面拒绝播放。

---

## 7. 错误码

| code | 含义 |
|---|---|
| `STALE_ELEMENT` | 元素句柄已失效 |
| `STALE_DOMAIN` | 滚动域句柄已失效 |
| `NOT_VISIBLE` | 目标不可见，且 pre_scroll 无法解决 |
| `FOREGROUND_UNAVAILABLE` | 显式请求前台，但页面无法恢复可见/前台 |
| `BLOCKED_BY_OVERLAY` | foreground 点击时目标内部找不到安全点击点 |
| `CLICK_FAILED` | DOM 点击抛错 |
| `DOMAIN_NOT_SCROLLABLE` | 滚动域 max_scroll 为 0 或不可滚 |
| `AMBIGUOUS_MEDIA` | 未指定 target 且存在多个媒体 |
| `NO_MEDIA` | target 不是媒体元素 |
| `PLAY_REJECTED` | play() 被拒绝 |
| `FRAME_NOT_FOUND` | frame 不存在 |
| `TARGET_NOT_FOUND` | CDP page target 不存在 |
| `UNSUPPORTED_PAGE` | 页面结构无法识别为已知类型 |
| `NAVIGATION_FAILED` | CDP 导航失败 |
| `INVALID_ARGUMENT` | 参数组合非法 |
| `INTERNAL_ERROR` | 未分类内部错误 |

错误对象统一包含 `observed`，例如：

```json
{
  "code": "NOT_VISIBLE",
  "message": "target is outside viewport and pre_scroll failed",
  "observed": {
    "element_id": "e12",
    "rect": { "x": 1088, "y": 1500, "w": 424, "h": 40 },
    "domain_id": "d2",
    "max_scroll": 933
  }
}
```

---

## 8. 非目标

v1 明确不做：

- `select_chapter` / `next_chapter` / `submit_answer` / `watch_video` 这类业务工具；
- 按文字点击；
- 自动把“滚到底”判定为任务完成；
- `background` 模式自动切前台；
- `foreground` 模式在未显式请求时启动；
- 自动打开新标签页并切换；
- 自动处理对话框；
- 截图作为主要感知手段；
- 自动等待视频播完；
- 自动选择“下一章”。

这些应由模型根据观察结果决策，或由后续明确的工作流层处理。

---

## 9. 待验证

1. PDF 任务点是否由 `scroll` 事件触发完成，还是只接受真实 `wheel`；需要在**未完成**的 PDF 任务上验证。
2. 视频在页面 hidden 时是否被页面自己的 `visibilitychange` 暂停；若是，后续单独做可见性覆盖。
3. DOM click 在各前端框架上的接受程度；拒绝时是否需要 `execution: "foreground"` 重试。
4. `foreground` 模式下窗口恢复/置前在不同平台上的行为（`Page.bringToFront` 是否足够，是否需要恢复最小化窗口）。
5. `Input.*` 在 visible 但非聚焦窗口下的行为。
6. OOPIF（跨进程 iframe）中的 trusted 输入与坐标换算。

---

## 10. 参考

- [超星章节 DOM 与滚动观察](../research/chaoxing-chapter-dom.md)
- [DSH 集成说明](../dsh-integration.md)
