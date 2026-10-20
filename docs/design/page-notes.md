# 页面笔记与任务点复核

日期：2026-10-20
状态：第一版实现完成

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
- task_points：job_id、kind、title、state、signals、conflict、frame_id、观察代次；
- 模型字段：plan、tab note、task annotation/intent/needs_recheck。

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

已通过：

- 笔记存储/增量编辑单元测试；
- 真实页面 page_snapshot → page_notes → task_point_check 联调；
- 默认 3 秒复核未完成视频任务点，返回 incomplete，等待约 3.2 秒；
- 笔记写入工作区 .notes，文件名不含插件名；
- 敏感 enc 参数未进入笔记。
