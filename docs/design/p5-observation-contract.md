# P5.1 观察契约与句柄模型

状态：P5.1 契约已定稿；P5.3+ 已按此契约实现
日期：2026-10-20
相关：[P5 路线](../development-roadmap.md)、[工具契约 v1](tool-contract.md)

## 0. 范围

P5.1 只确定“观察什么、返回什么、句柄怎么失效”。

本阶段不实现：

- 页面/标签/frame 采集；
- 任务点采集；
- PDF panView 映射；
- 观察工具注册。

P5.1 完成的标准是：后续 P5.2–P5.7 可以按这份契约独立实现，不需要再改句柄模型。

## 1. 工具边界

P5 暴露两个只读观察工具。

### 1.1 page_snapshot

回答：当前页面是什么结构。

包含：

- page 身份；
- tabs 概览；
- frames 树；
- scroll_domains；
- generation；
- coverage / truncated。

不包含：

- 任务点；
- 题目；
- PDF 业务映射；
- 任何通用可点击元素清单。

### 1.2 task_points

回答：当前标签里有哪些任务点、完成状态如何、对应哪个文档 frame 和滚动域。

包含：

- page / tab 摘要；
- chapter 摘要；
- task_points；
- documents；
- generation；
- coverage / truncated。

不重复：

- 完整 frame 树；
- 全量滚动域指标；
- 页面所有元素。

### 1.3 独立调用

两个工具都可以独立调用，不要求先调用另一个。

- 先 page_snapshot，再 task_points：task_points 复用已有句柄；
- 先 task_points：内部补齐必要页面/标签/注册表信息；
- 两者共用同一个观察注册表和 generation。

## 2. 页面与标签模型

### 2.1 page

~~~json
{
  "url": "https://...",
  "title": "学生学习页面",
  "visibility": "hidden",
  "ready_state": "complete",
  "target_id": "CDP target id",
  "generation": 3
}
~~~

### 2.2 tabs

~~~json
{
  "items": [
    { "index": 1, "title": "视频", "active": false, "loaded": true },
    { "index": 2, "title": "章节测验", "active": true, "loaded": true }
  ],
  "active_index": 2,
  "coverage": "complete"
}
~~~

P5 只观察标签，不切换标签。

如果存在多个标签但无法判定当前标签：

- page_snapshot 返回 tabs，active_index = null；
- task_points 返回 TAB_UNRESOLVED 错误，不返回任务点。

## 3. frame 模型

~~~json
{
  "frame_id": "CDP frame id",
  "parent_id": "parent frame id or null",
  "frame_epoch": 3,
  "depth": 2,
  "name": "iframe",
  "url": "https://...",
  "rect": { "x": 100, "y": 300, "width": 888, "height": 600 },
  "evaluable": true,
  "cross_origin": false
}
~~~

- frame_id 使用 CDP 原生 frame id；
- frame_epoch 是该 frame 的失效代次；
- 跨域/OOPIF 无法读取 DOM 时，evaluable=false，不能假装观察成功；
- frame 树最多返回配置上限；超出时 truncated=true。

## 4. 句柄模型

### 4.1 不引入 module_id

P5 不生成 module_id，也不返回 null module_id。

未来如需 module_id：

- 作为可选扩展字段；
- 与 job_id 建立映射；
- 不替代 job_id；
- 不破坏现有输出。

### 4.2 组合句柄

所有帧内句柄都使用“局部 ID + frame_id + frame_epoch”：

元素句柄：

~~~json
{
  "element_id": "e0",
  "frame_id": "A...",
  "frame_epoch": 2
}
~~~

滚动域句柄：

~~~json
{
  "domain_id": "d2",
  "frame_id": "A...",
  "frame_epoch": 2,
  "kind": "document"
}
~~~

禁止只用 element_id 或 domain_id 做跨 frame 身份。

### 4.3 任务点身份

- job_id：学习通任务点外部身份；
- objectid：PDF 等文档的 objectid；
- job_id 在 task_points 中作为主身份；
- 不用文字标题查任务点。

## 5. 失效模型

### 5.1 顶层导航

- generation 递增；
- 所有 frame 句柄失效；
- 观察注册表清空；
- 旧句柄返回 STALE_HANDLE，reason = generation。

### 5.2 子 frame 导航

- 该 frame 及其全部后代 frame 的 frame_epoch 递增；
- 子树中的 element/domain 句柄失效；
- 其他 frame 句柄保持有效；
- 旧句柄返回 STALE_HANDLE，reason = frame_epoch。

### 5.3 页面 target 变化

- 视为新的观察上下文；
- generation 重新开始，注册表清空；
- 旧句柄 reason = target_changed。

### 5.4 统一错误

~~~json
{
  "ok": false,
  "error": {
    "code": "STALE_HANDLE",
    "reason": "frame_epoch",
    "message": "handle is no longer valid",
    "observed": {
      "expected_generation": 3,
      "current_generation": 3,
      "expected_frame_epoch": 2,
      "current_frame_epoch": 3
    }
  }
}
~~~

reason 取值：

- generation
- frame_epoch
- frame_missing
- target_changed

## 6. 观察注册表

- 每个 CDP session/page 一个观察注册表；
- page_snapshot 和 task_points 共用；
- 注册表按 generation 和 frame_epoch 管理；
- 同一次观察内，同一个 frame 的同一元素/滚动域得到同一个局部 ID；
- 顶层导航清空注册表；子 frame 导航只清空该子树；
- P5 不跨页面持久化句柄。

## 7. page_snapshot 输出

~~~json
{
  "page": { "...": "..." },
  "generation": 3,
  "tabs": { "...": "..." },
  "frames": [],
  "scroll_domains": [],
  "coverage": "complete",
  "truncated": false,
  "limits": {
    "frames": 80,
    "scroll_domains": 80
  }
}
~~~

scroll_domains 使用组合域句柄：

~~~json
{
  "domain": {
    "domain_id": "d0",
    "frame_id": "A...",
    "frame_epoch": 2,
    "kind": "document"
  },
  "label": "PDF：函数的概念",
  "related_job_id": null,
  "scroll_top": 0,
  "scroll_height": 6758,
  "client_height": 546,
  "max_scroll": 6212,
  "at_top": true,
  "at_bottom": false
}
~~~

## 8. task_points 输出

~~~json
{
  "page": { "...": "..." },
  "tab": { "index": 2, "title": "章节测验", "active": true },
  "generation": 3,
  "chapter": {
    "chapter_id": "1110065988",
    "title": "分段函数、反函数、复合函数",
    "unfinished_count": 1,
    "state": "incomplete",
    "signals": ["orangeNew=1", "no_icon_Completed"]
  },
  "task_points": [
    {
      "job_id": "1679495717357753",
      "objectid": "ef1e...",
      "kind": "pdf",
      "title": "PPT第一章 第1节函数02 分段函数，反函数，复合函数.pdf",
      "order": 0,
      "frame_id": "A...",
      "frame_epoch": 2,
      "wrapper_element": { "element_id": "e4", "frame_id": "A...", "frame_epoch": 2 },
      "iframe_loaded": true,
      "state": "incomplete",
      "signals": ["no_completion_signal"],
      "conflict": false
    }
  ],
  "documents": [
    {
      "job_id": "1679495717357753",
      "objectid": "ef1e...",
      "module_frame_id": "B...",
      "pan_frame_id": "C...",
      "scroll_domain": { "domain_id": "d0", "frame_id": "C...", "frame_epoch": 1, "kind": "document" },
      "loaded": true
    }
  ],
  "ignored_containers": 0,
  "coverage": "complete",
  "truncated": false
}
~~~

task_points 不返回 module_id。

## 9. 就绪、覆盖与截断

coverage：

- complete：当前观察范围内的事实已稳定返回；
- partial：已知只观察到一部分；
- pending：关键目标尚未加载。

truncated：

- 达到数量上限时 true；
- 不静默丢弃；
- 输出 limits 说明上限。

P5 不强行加载其他标签；当前标签未加载时返回 pending/partial。

## 10. 输出与渲染

- 工具返回值为 JSON，受 DSH lossless JSON 校验；
- render 输出紧凑 JSON，不能只渲染 Markdown 摘要而丢掉句柄；
- Markdown 只能作为人读辅助，不是数据契约；
- 输出字段名保持稳定。

## 11. P5.1 验收

P5.1 的产出是契约，不是功能。验收方式：

- 后续 P5.2–P5.7 不再修改句柄模型；
- 所有工具输出可以按本契约映射；
- page_snapshot 与 task_points 的职责边界清楚；
- task_points 独立调用和先 snapshot 后 tasks 两种路径都有明确语义。

## 12. P5.2 调研补充（2026-10-20）

已用真实全模块内联页确认：

- tabs 只表示内容/模块标签；右侧 .tabs/.tabCatalog 是侧栏标签，不是内容标签；
- 没有内容标签时，tabs.items 为空，task_points 分析全部内联模块；
- frame 输出默认过滤 about:blank / javascript / 工具 frame，并记录 hidden_frame_count；
- frame_id 与 iframe 元素可通过 DOM.getFrameOwner + DOM.describeNode 映射；
- 任务点身份使用 jobid/objectid，不使用重复 DOM id/name；
- element 滚动域需要纳入（例如 #coursetree）；
- PDF 域在跨域 panView frame 的 document 上。

已补充内容标签页样本：

- 内容标签容器为 div#prev_tab.prev_list，标签项为 ul.prev_ul > li[id^=dct][role=option]；
- active 在 li 上；title/.spanText 是标签名；
- 侧栏标签 .tabCatalog > ul > li#tit* 不是内容标签；
- 有内容标签时，只加载当前标签模块；其他标签的模块 frame 不存在；
- 当前标签可以没有任务点（例如“笔记”），此时 task_points 返回空 task_points，coverage 仍可为 complete，不是 TAB_UNRESOLVED；
- 没有 #prev_tab 时，视为全模块内联页，分析当前页面全部模块。

## 13. 交给 P5.2 的研究问题

P5.2 需要真实页面结构信息：

- 标签 DOM 和 active 判定；
- iframe 元素与 CDP frame_id 的稳定映射；
- 任务点容器/懒加载行为；
- element 滚动域的真实分布；
- PDF 之外的文档类型；
- 当前页面类型识别。

这些属于 P5.2 调研，不在 P5.1 继续展开。

## 14. 实现状态（2026-10-20）

已实现：

- ObservationRegistry：generation / frame_epoch / 局部 element_id / domain_id；
- page_snapshot：page、content tabs、frame 树、document + element 滚动域、hidden_frame_count、coverage / truncated；
- task_points：当前内容标签任务点、完成状态、module frame、wrapper 句柄、PDF document 映射、content_tabs 摘要；
- 两个工具共用同一个 CDP session 和观察注册表；
- 已在真实页面验证：全内联页、内容标签有任务、内容标签无任务、PDF 页面、任务点先调用再 page_snapshot。

尚未完成：

- scroll_domain 仍接收 frame_id，尚未改为接收 domain 组合句柄；
- TAB_UNRESOLVED 已用真实可逆异常状态复现；
- 限速加载中的 pending → complete 已验证；更复杂的截断/OOPIF 页面仍待补样本；
- 尚未安装到真实 DSH。
