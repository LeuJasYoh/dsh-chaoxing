# P8 真实 DSH 安装、笔记与任务点复核验证

日期：2026-10-20
状态：通过

## 1. 安装状态

DSH profile：

~~~text
C:\Users\23500\.dsh\profiles\desktop
~~~

profile 已包含：

- dependencies: dsh-xuexi-next = file:D:/Projects/XueXi/dsh-xuexi-next
- dsh.profile.bundles: dsh-xuexi-next
- node_modules: dsh-xuexi-next@0.2.0

## 2. 真实 DSH 会话验证

在学习模式会话中，模型工具列表包含：

- page_snapshot
- page_notes
- task_points
- task_point_check
- scroll_to
- scroll_domain

只读调用结果：

- xuexi_health 返回 v0.3-notes；
- page_snapshot 读取商函页面：10 个内容 frame、17 个隐藏 frame、4 个滚动域；
- task_points 返回 7 个任务点，全部 completed；
- page_notes get 读到 revision 2；
- page_notes patch 设置 plan 后 revision 3；
- task_point_check 复核首个 PDF 任务点 completed，等待约 3.3 秒，笔记 revision 4。

## 3. 工作区笔记

生成文件：

~~~text
.notes/course-217785077-chapter-425590906.json
~~~

检查结果：

- 文件大小约 4.7 KB；
- 不包含 enc/token；
- 文件名不包含插件名；
- 包含 1 个 tab；
- tab 包含 7 个任务点；
- plan 为“先观察，再复核”。

## 4. 已知事实与优化点

- 4 个视频出现 completed class 与 aria 未完成冲突，工具正确报告 conflict=true，没有自行裁决；
- 首个任务点已经 completed，task_point_check 仍等待了整个 3 秒窗口；
- 已在 0.2.1 优化：initial completed 时立即返回，只有 incomplete/unknown 才等待；本地模拟验证约 79ms 返回。

## 5. 结论

真实 DSH 链路已打通：

~~~text
安装插件
→ 预设加载
→ 工具出现在模型工具列表
→ 观察页面
→ 自动写工作区笔记
→ 读取/编辑笔记
→ 复核指定任务点
~~~
