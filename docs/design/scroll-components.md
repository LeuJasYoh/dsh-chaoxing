# 通用滚动部件与工具设计

状态：内部部件已实现；工具 scroll_to / scroll_domain 已注册；慢翻只作为内部复合部件，尚未暴露成工具。

## 0. 决策

- scroll_domain 保持原子性：只滚动一个滚动域，并报告前后事实；
- 找 PDF、找 panView、慢翻、补发 scroll 事件放在内部部件；
- 慢翻 readDocument 先内部使用，等真实未完成 PDF 验证后再决定是否暴露；
- 不新增 scroll_pdf / read_pdf 这类业务工具。

## 1. 内部部件

### 1.1 就绪等待

文件：lib/scroll/readiness.mjs

- waitFor(check, { timeoutMs, intervalMs })
- 条件可以返回布尔值，或 { ready: boolean, ... }
- 超时返回 { ok:false, timeout:true, attempts, elapsedMs, error, value }
- 不做固定 sleep，不用“操作后立即读一次”判断完成。

### 1.2 滚动域

文件：lib/scroll/domain.mjs

- readDocumentMetrics(session, frameId)
- scrollDocument(session, frameId, { to, delta_y, dispatch_scroll, settleMs })
- waitForDocumentStable(session, frameId, { samples, intervalMs, timeoutMs })
- 纯计算辅助：computeScrollTop / isAtBottom
- 只处理 frame document 的 document.scrollingElement；元素滚动域以后扩展。
- dispatch_scroll 为 true 时补发 window scroll 事件，并在结果中明确标记。

### 1.3 通用目标滚动

文件：lib/scroll/target.mjs

- listTaskPoints(session)：按 iframe jobid 找任务点，不按文字/DOM id。
- findTaskPoint(session, jobId)。
- scrollTaskPointIntoView(session, jobId, { align, settleMs })：
  - 在任务点所在 frame 调用 scrollIntoView；
  - 逐层累加同源 frame 的视口原点，得到目标在顶层视口中的位置；
  - 返回外层滚动前后、目标视口 rect、visible。
- 不判断任务完成，不关心 PDF/视频类型。

### 1.4 PDF/文档解析与慢翻

文件：lib/scroll/document.mjs

- resolvePdfTarget(session, jobId)：
  - 任务点 iframe data.objectid；
  - 找到 URL 包含 file_<objectid> 的 panView frame；
  - 返回 module_frame_id / pan_frame_id / objectid。
- listPdfTargets(session)。
- readDocument(session, frameId, { stepPx, dwellMs, maxSeconds, dispatch_scroll })：
  - 等内容高度稳定；
  - 回顶；
  - 小步向下，每步停 dwellMs；
  - 报告 steps、at_bottom、bottom_gap、elapsed_ms、stop_reason。
- 慢翻是内部复合部件，不是工具。

## 2. 工具

### 2.1 scroll_to

文件：tools/scroll-to.mjs

输入：

~~~json
{ "job_id": "...", "align": "center", "timeout_ms": 5000 }
~~~

输出：

- target：job_id / kind / title / frame_id；
- before / after：外层文档滚动指标；
- target_viewport_rect / viewport / visible；
- wait：attempts / elapsed_ms。

边界：

- 只滚动页面；
- 不滚 PDF 内部；
- 不判断完成；
- 目标还没加载时，带 timeout 轮询，超时返回 TARGET_NOT_READY 和当前事实。

### 2.2 scroll_domain

文件：tools/scroll-domain.mjs

输入：

~~~json
{
  "frame_id": "...",
  "to": "bottom",
  "dispatch_scroll": true,
  "settle_ms": 120,
  "execution": "background"
}
~~~

或 delta_y。

输出：

- frame_id / url / title；
- before / after：scroll_top / scroll_height / client_height / max_scroll / bottom_gap；
- moved / at_top / at_bottom；
- dispatch_scroll；
- execution / method / trusted / fronted。

边界：

- 只滚一个滚动域；
- 不找 PDF、不解析 objectid、不判断完成；
- 当前只实现 background；
- 需要页面自己响应 scroll 时，显式传 dispatch_scroll=true；这不是默认的物理滚轮事件。

## 3. 对“第六条”的修正

不采用“操作后立即重新观察”。

采用：

1. 等目标出现（waitFor）；
2. 执行滚动；
3. 等内容高度稳定；
4. 需要时补发 scroll 事件；
5. 再观察任务点状态；
6. 超时返回 action_sent=true、at_bottom=true，但 task_state 仍是当前事实，不伪造完成。

工具返回的是事实，不是业务成功。

## 4. 验证结果

当前页面（隐藏状态）验证：

- 7 个任务点全部能通过 scroll_to 滚入视口；
- 7 个 PDF 都能按 objectid 找到独立 panView；
- scroll_domain 滚到底后 bottom_gap ≤ 0.4px；
- 慢翻部件在短 PDF 上 600px × 4 步到底；
- 工具组装测试通过（mock ctx + 真实页面）。

隐藏页面下原生 scroll 事件为 0，补发 scroll 后父 frame 收到 isFinished；因此 dispatch_scroll 是显式可选项。

## 5. 已知限制

- 慢翻路径已在真实未完成 PDF 上验证 completed 状态翻转；单步直接跳到底仍待验证；
- foreground 未实现；
- 只有 frame document 滚动域，元素滚动域待扩展；
- 任务点/PDF 的身份目前通过 job_id/objectid 解析，未来应由 page_snapshot/page_outline 提供稳定句柄；
- 慢翻默认参数（300px/1000ms）已在两个真实未完成 PDF 上验证；仍需更多文档样本；
- 任务点外壳更新快，章节目录行异步更新（本次约晚 4 秒），观察时要分别处理。
