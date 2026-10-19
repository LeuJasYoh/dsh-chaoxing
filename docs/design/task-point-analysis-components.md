# 任务点分析内部小部件设计

状态：已实现（不是 Agent 工具）
相关：[page_questions 设计](page-questions.md)、[学习通题目页与字体加密观察](../research/quiz-encryption-observations.md)

## 0. 定位

这两个小部件是插件内部复用的分析模块，不注册给 Agent，不暴露成工具。

它们只回答两个事实问题：

1. 当前标签内部有几个任务点（analyzeTaskPointCount）；
2. 当前标签内部每个任务点完成没有（analyzeTaskPointCompletion）。

它们不点击、不切换标签、不播放视频、不提交测验，也不判断“整门课是否学完”。

标签识别是这两个小部件的上游前置步骤，不包含在这里：

- 上游先判断“这一章有几个标签、当前是第几个标签”；
- 然后把“当前标签”的范围交给本模块；
- 当前标签完成后，由上游决定切换到下一个标签。

## 1. 输入：当前标签范围

两个小部件都不直接操作整个页面，只接受一个当前标签范围：

~~~ts
interface TaskScope {
  activeTab: { index: number; title: string; elementId?: string } | null
  chapter: {
    chapterId: string
    title: string
    unfinishCount: number | null
    completed: boolean | null
  } | null
  reader: PageReader
}
~~~

PageReader 由上层实现，至少要能：

- 在当前标签的内容 frame 内查询 DOM；
- 读取属性、class、可见性；
- 等待页面稳定/轮询（由上层提供）；
- 不负责点击、切标签或加载媒体。

## 2. 共享原始事实采集

两个小部件共用一个很薄的采集层：

~~~ts
interface TaskPointFact {
  key: string
  jobId: string | null
  kind: 'video' | 'pdf' | 'work' | 'unknown'
  title: string | null
  frameId: string
  wrapperFinished: boolean
  iconAria: string | null
  hasJobIcon: boolean
  iframeLoaded: boolean
  visible: boolean
}
~~~

采集规则：

- 只找当前标签范围内带任务点图标的模块容器（div.ans-attach-ct + .ans-job-icon）；
- 不用 DOM id 当任务点身份（实测多个模块会出现重复的 ext-gen* id）；
- jobId 从 iframe 的 jobid / data 读取；
- 类型从 iframe 的 src 或图标 class 判断；
- 标题从 iframe 的 data JSON 读取；
- 只读任务点外壳，不等视频/PDF 内容加载。

## 3. 小部件一：任务点数量分析

~~~ts
interface TaskPointInventory {
  total: number
  points: Array<{ key: string; jobId: string | null; kind: TaskPointFact['kind']; title: string | null }>
  coverage: 'complete' | 'partial' | 'pending'
  pendingCount: number
  source: 'module_containers'
}
~~~

规则：

- 只统计当前标签内部带任务点图标的模块容器；
- 非任务点附件（没有任务点图标）不计入；
- 同一容器重复出现时按 key 去重；
- 任务点外壳还没齐时返回 partial 或 pending，不报一个假的准确总数；
- 不要求视频/PDF 内容加载完成；
- 不切换标签，不加载其他标签。

coverage 判定建议：

- pending：当前标签内容还没出现任务点外壳；
- partial：已出现部分外壳，但页面仍在增加/内容不稳定；
- complete：连续两次扫描任务点数量一致，且没有待加载占位。

## 4. 小部件二：任务点完成情况分析

输入是任务点清单（或重新采集的事实）+ 章节目录行信息。

~~~ts
interface TaskPointCompletion {
  points: Array<{
    key: string
    state: 'completed' | 'incomplete' | 'unknown'
    signals: string[]
    conflict?: boolean
  }>
  summary: { completed: number; incomplete: number; unknown: number; conflicts: number }
  chapter: { unfinishedCount: number | null; state: 'completed' | 'incomplete' | 'unknown'; consistent: boolean | null }
  coverage: 'complete' | 'partial' | 'pending'
  unobservedIncomplete: number | null
}
~~~

### 单个任务点的判定顺序

1. 外层有 ans-job-finished → completed（主信号）；
2. 外层没有完成类，但图标 aria 是“任务点未完成” → incomplete；
3. 有任务点图标和已加载 iframe，但没有任何完成/未完成信号 → unknown（不硬猜）；
4. 任务点外壳/图标缺失 → unknown。

冲突处理：

- 外层有 ans-job-finished，但 aria 还是“任务点未完成” → 判 completed（以页面完成类为主），同时标记 conflict: true，把两个信号都返回；
- 实测当前“商函”页面 7 个任务点都完成，其中 4 个视频的 aria 仍是“未完成”；不能因为 aria 旧而误判未完成。

### 章节目录交叉校验

目录行数字是未完成数，不是总数：

- unfinishCount === summary.incomplete → 视为一致；
- unfinishCount > summary.incomplete → 还有未观察到的未完成任务点，返回 coverage: partial 和 unobservedIncomplete；
- unfinishCount < summary.incomplete → 页面信号冲突，consistent: false；
- 目录行显示已完成，但已观察任务点里有未完成 → consistent: false，不要下“已完成”结论。

## 5. 懒加载处理

不强行一次性加载全部任务点。

- 上游按标签顺序处理，小部件只处理当前标签；
- 当前标签内部只等任务点外壳出现，不等视频/PDF 内容加载；
- 如果外壳没出现或只出现一部分，返回 pending/partial；
- 不自动切换到其他标签，不自动播放/滚动来触发加载；
- 需要看其他标签时，由上游显式切换，之后重新分析。

如果未来确实需要一次性看到所有标签的状态，可以另做一个显式的“逐标签扫描”流程：切到每个标签、读取当前标签的任务点、再切回原标签。但那不是这两个小部件的职责。

## 6. 非目标

- 不判断“这一门课学完了没有”；
- 不判断答案对错；
- 不自动播放视频、不自动滚动、不自动提交；
- 不把“已点击/已播放/已提交”当作完成状态；
- 不靠颜色、截图或视觉判断；
- 不把未观察到的任务点当成不存在。

## 7. 实现落点

- 事实采集：lib/tasks/collect.mjs
  - collectTaskPointScan(session, options)：只读当前页面/当前标签已加载的任务点外壳与章节目录行
- 小部件一：lib/tasks/count.mjs
  - analyzeTaskPointCount(scan)
- 小部件二：lib/tasks/completion.mjs
  - analyzeTaskPointCompletion(scan, { inventory })
- 单元测试：test/tasks.test.mjs
- 真实页面联调：test/live-tasks.mjs（npm run test:live:tasks）

## 8. 验收用例（实现后至少覆盖）

1. 全部加载页面（当前“商函”页）：7 个任务点，全部完成；其中 4 个视频 aria 仍是“未完成”。
   期望：数量 7，7 个 completed，4 个 conflict 标记，章节一致。
2. 懒加载页面（之前 4.4）：当前标签只加载 1 个模块；目录显示 1 个未完成。
   期望：当前标签数量 1；若加载的是已完成测验，则 coverage=partial，unobservedIncomplete=1，不报章节完成。
3. 未提交测验（之前 5.5）：当前标签 1 个测验任务点，外层无完成类，aria 未完成。
   期望：incomplete。
4. 无标签页面：所有任务点同页加载。
   期望：activeTab=null，分析整个页面。
5. 重复 DOM id：多个模块有重复的 ext-gen* id。
   期望：按 jobId/顺序区分，不合并。
