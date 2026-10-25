# 页面笔记与任务点复核

更新日期：2026-10-25
状态：第一版已实现；不完整观察的笔记保护已补齐并通过本地回归测试

## 1. 目标

把“观察到的页面事实”保存为工作区里的结构化笔记，解决：

- 上下文压缩后忘记页面结构；
- 切换标签后忘记之前看过什么；
- 模型重复观察同一页；
- 没有地方记录计划、备注和待复核任务。

笔记不是页面真相。页面事实仍以观察工具为准。

## 2. 存储位置

笔记放在会话工作区的相对路径：

~~~text
<工作区>/.notes/
~~~

不硬编码工作区绝对路径。工具通过 DSH 的：

~~~ts
ctx.workingDirectory.ensure(exec.agent, exec.signal)
~~~

取得当前工作区，再拼接：

~~~ts
join(workspaceRoot, '.notes', noteId + '.json')
~~~

当前文件名按课程/章节：

~~~text
.notes/course-217785077-chapter-425590906.json
~~~

文件名不包含插件名；插件名尚未最终确定，也不应该进入用户数据路径。

不把 enc、token、签名等敏感 URL 参数写入笔记。

## 3. 笔记结构

- note_id / revision；
- scope：课程、章节；
- page：标题、generation、观察时间、stale；
- tabs：标签索引、标题、active、observed、任务点；
- task_points：job_id、kind、title、state、signals、conflict、frame_id、观察代次、观察时间、stale；
- 模型字段：plan、tab note、task annotation/intent/needs_recheck。

任务级 `stale=true` 表示本次没有重新观察到该任务，当前展示的是保留的旧记录，不是新的完成证据。它与页面级 `page.stale` 分开；`needs_recheck` 仍是模型设置的待复核标记，不会被自动清除。

未观察标签：

~~~json
{ "observed": false, "task_points": null }
~~~

已观察但没有任务：

~~~json
{ "observed": true, "task_points": [] }
~~~

两者不能混为一谈。

## 4. 写入策略

- page_snapshot 自动 capture 页面/标签事实；
- task_points 自动 capture 当前标签任务点事实；
- page_notes get 读取紧凑摘要；
- page_notes patch 使用 expected_revision 做增量编辑；
- task_point_check 复核后自动 capture 最新事实；
- 模型不能直接写任务完成状态；
- 只有观察到完成信号，任务 state 才可能为 completed。

### 不完整任务观察的合并规则

只有同时满足以下条件，当前任务清单才可以整体替换旧清单：

- `coverage === 'complete'`；
- `truncated !== true`；
- `page.ready_state === 'complete'`。

否则按任务 job_id 合并：

- 本次看见的任务更新状态、证据信号、frame 与观察时间，`stale=false`；
- 本次没看见的旧任务继续保留，`stale=true`，保留原来的状态、观察代次与观察时间，不冒充新观察；
- 原任务顺序保留，新出现的任务追加；重复观察不重复添加同一个 job_id；
- 已有任务的 annotation、intent、needs_recheck 保留，标签备注和页面计划不变；
- 首次通过任务观察创建标签记录但尚未读到任务时，保存 `observed=false`、`task_points=null`，而不是“确认没有任务”；
- 完整观察允许删除没有返回的任务；完整空观察才会将任务清单清为 `[]`。

例如：笔记里原有视频 A 的备注，页面加载中返回空任务列表，视频 A 与备注仍保留但标记为旧记录。下次重新读到视频 A 后更新事实并清除任务级 stale，备注不会丢失。只刷新页面结构快照不会清除任务级 stale；必须重新观察到该任务。

这些规则保护已有笔记，不能恢复修复前已经被清掉的备注，也不改变 CDP 导航代次或句柄校验机制。

## 5. page_notes 工具

动作：

- get：读取当前 note_id 或指定 note_id；
- list：列出工作区里的笔记；
- capture：保存最近一次观察；
- patch：写 plan、标签备注、任务备注/intent/needs_recheck。

不允许 set_task_state；模型想标记待复核时用：

~~~json
{ "op": "mark_task_needs_recheck", "job_id": "..." }
~~~

## 6. task_point_check 工具

输入：

~~~json
{ "job_id": "...", "wait_ms": 3000 }
~~~

- 默认最多等 3000ms；
- 复用任务点扫描与完成分析部件；
- 通过 CDP 重新读取 DOM，不刷新页面；
- 不点击、不播放、不提交；
- 当前标签找不到任务点时返回 TASK_POINT_NOT_FOUND；
- 只报告观察事实，不把“没观察到”判成失败。

## 7. 验证

真实 DSH 0.2.0 会话已通过：

- 笔记存储/增量编辑单元测试；
- 真实页面 page_snapshot → page_notes → task_point_check 联调；
- 默认 3 秒复核未完成视频任务点，返回 incomplete，等待约 3.2 秒；
- 笔记写入工作区 .notes，文件名不含插件名；
- 敏感 enc 参数未进入笔记。

2026-10-25 笔记保护的本地回归已通过：

- pending/partial 的空结果、被截断的结果、页面加载中的结果不删除旧任务；
- 部分观察更新已看见的任务、保留遗漏任务、追加新任务，重复观察不重复添加；
- 重新观察后状态与任务级 stale 正常更新，人工备注、intent、needs_recheck 保留；
- 完整观察仍可移除已不存在的任务，完整空观察仍可清空清单；
- 首次不完整空观察保留未知状态，其他标签记录不受任务合并影响；
- 自动 capture 到临时目录后重新读取，旧记录标记和备注保持一致；
- npm test 七组全部通过；本次修复尚未重新安装到真实 DSH 验证。
