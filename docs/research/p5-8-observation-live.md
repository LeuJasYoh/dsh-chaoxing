# P5.8 观察工具真实页面联调

日期：2026-10-20
范围：page_snapshot / task_points / 共享句柄与 generation

## 1. 测试环境

- CDP 9223：内容标签页样本（英语、生物化学、马原）
- CDP 9222：全内联页样本（6.1 商函）
- 页面隐藏状态
- 只读调用，没有点击、播放、提交或改变学习进度

## 2. 已验证页面

### A. 英语 Unit 2 Stress（3 个内容标签）

- page_snapshot：
  - 当前页面、3 个内容标签；
  - 当前标签：微课；
  - 3 个有意义 frame：顶层 + knowledge + 当前视频模块；
  - hidden_frame_count = 7；
  - 页面 document 和 #coursetree element 滚动域。
- task_points：
  - 当前标签 1 个视频任务点；
  - 未完成；
  - 模块 frame、wrapper 句柄、module frame 映射存在；
  - chapter unfinishCount = 5，coverage = partial。

### B. 生物化学 氨基酸性质（当前标签“笔记”）

- page_snapshot：
  - 3 个内容标签；
  - 当前标签：笔记；
  - 只有顶层 + knowledge frame；
  - 侧栏“目录/讨论/笔记/标注”没有被当成内容标签。
- task_points：
  - 当前标签任务点为空；
  - coverage = complete；
  - chapter = completed；
  - 没有误报 TAB_UNRESOLVED。

### C. 马原 1.2 世界的多样性统一于物质（2 个内容标签）

- page_snapshot：
  - 2 个内容标签：视频 / 章节测验；
  - 当前标签：视频；
  - 当前标签 1 个视频模块。
- task_points：
  - 1 个视频任务点；
  - 状态 completed；
  - 视频 aria 与完成 class 一致。

### D. 6.1 商函全内联页（CDP 9222）

- 先独立调用 task_points，再调用 page_snapshot：
  - 4 个任务点：3 个视频 + 1 个 PDF；
  - 每个任务点都有 job_id、module frame、wrapper 句柄；
  - PDF 映射到独立 panView frame 和 document 滚动域；
  - 1 个视频出现“完成 class + aria 未完成”的冲突，被正确标出；
  - page_snapshot 返回 7 个有意义 frame、12 个隐藏 frame；
  - 页面 document、#coursetree、panView document 三个滚动域都返回。
- 证明 task_points 可以独立调用，不依赖 page_snapshot 先执行。

## 3. 实现中确认并修复的问题

1. 任务点文档映射最初取了错误的字段名，导致 documents.job_id 为 null；
2. panView 的 objectid 需要从 iframe src 查询参数补读；
3. 过滤 max_scroll 只有 1px 的 knowledge document 噪声；
4. 增加 TAB_UNRESOLVED 的单元测试路径；
5. 增加 content tabs 无标签/多标签 active 无法判定的边界测试。

## 4. 测试结果

- npm test 全部通过：8 组测试；
- 真实页面 page_snapshot / task_points 调用成功；
- 隐藏页面仍能读取；
- 跨域 panView 能通过 CDP 读取；
- 内容标签、无任务标签、全内联页、PDF 页面四类样本通过。

## 5. 已知限制

- 尚未用真实异常页面复现 TAB_UNRESOLVED（仅单元测试覆盖错误路径）；
- scroll_domain 仍接收 frame_id，尚未接入 domain 组合句柄；
- 6.1 页面只有一个内容标签且标题为空，tab.title 为 null；
- 内容标签切换仍属 P6，P5 不切换；
- 尚未安装到真实 DSH，工具列表端到端验证放 P8。

## 6. 结论

P5 的观察工具已经能在真实页面上独立回答：

- 当前页面是什么结构；
- 当前内容标签是哪一个；
- 当前标签有哪些任务点；
- 任务点完成状态如何；
- PDF 对应哪个 panView 和滚到哪里；
- 哪些 frame/滚动域可以后续操作。

P5.8 的剩余工作主要是异常页面与更复杂懒加载样本，不是核心链路阻塞。
