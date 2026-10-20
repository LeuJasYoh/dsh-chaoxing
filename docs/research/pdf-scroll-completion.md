# PDF 慢翻完成验证（未完成任务点）

日期：2026-10-20
环境：Edge CDP 9222，页面隐藏状态
结论：**慢速滚动到文档底部 + 每步补发 scroll 事件，确实能把未完成 PDF 任务点变成已完成。**

## 1. 测试页面

- 课程页面：学生学习页面
- 章节：函数的概念
- 任务点：PPT第一章 第1节函数01 函数的概念.pdf
- job_id：1679495122264105
- panView：pan-yz.chaoxing.com/screen/v2/file_c8fb41d3924e5a96263e696c778cbdd4

## 2. 测试前

- 任务点外壳：ans-attach-ct
- 没有 ans-job-finished
- 图标 aria：null
- 文档滚动：scrollTop 0 / max 6212，scrollHeight 6758，clientHeight 546
- 章节行：unfinishCount 1，completed false
- 任务点状态部件：unknown（没有完成/未完成信号）

## 3. 操作

1. 外层页面滚动到该任务点；
2. 在 panView 内慢翻：
   - stepPx 300
   - dwellMs 1000
   - 每步设置 scrollTop 并补发 scroll 事件；
3. 共 21 步，耗时约 23.6 秒；
4. 到达底部：scrollTop 6212，bottomGap 0；
5. 父 PDF frame 收到：
   {"data":{"isFinished":1},"origin":"https://pan-yz.chaoxing.com"}

## 4. 测试后

立即观察到：

- 任务点外壳变成 ans-attach-ct ans-job-finished；
- 任务点状态部件变为 completed；
- 章节目录行此时仍是旧值：unfinishCount 1，completed false。

稍后（异步）刷新观察：

- 章节行变为 unfinishCount 0，completed true；
- 任务点状态仍为 completed。

## 5. 结论

- 未完成 PDF 的真实完成状态变化已经验证；
- 慢翻路径有效；
- 页面隐藏时原生 scroll 事件不触发，补发 scroll 事件是必要的；
- 任务点外壳状态更新很快，但章节目录行是异步刷新，短时间内可能仍是旧值；
- 观察层不能把“章节行暂时没变”当成动作失败，也不能把“外壳已完成”直接等同于章节已完成，应分别报告并允许延迟重读；
- 单步直接跳到底部是否也能完成，本次没有验证；旧代码经验提示大步快跳可能不被页面接受，因此慢翻继续作为内部默认策略。

本次测试只做了滚动，没有点击答案、没有提交。


## 6. 二次验证：换章节 + 实际 scroll_to 工具

日期：2026-10-20

### 测试前

- 章节：分段函数、反函数、复合函数；
- 任务点：PPT第一章 第1节函数02 分段函数，反函数，复合函数.pdf；
- job_id：1679495717357753；
- 任务点外壳：ans-attach-ct（未完成）；
- 章节行：unfinishCount 1、completed false；
- PDF 最大滚动：3525px。

### 主页面滚动测试

直接调用已注册的 scroll_to 工具：

- 外层滚动前：320；
- 外层滚动后：180.8；
- 目标视口矩形 top ≈ 49.2，height ≈ 729.6；
- visible = true；
- 工具 attempts = 1，耗时约 250ms。

结论：实际工具 scroll_to 能把指定任务点滚入视口。

### 文档翻阅测试

- 慢翻参数：300px × 12 步，每步停 1 秒；
- 耗时约 13.7 秒；
- 到达底部：scrollTop 3524.8 / max 3525，bottomGap 0.2；
- 父 PDF frame 收到 isFinished；
- 任务点外壳约在总开始后 14.9 秒变为 ans-job-finished；
- 章节行约在总开始后 19.0 秒更新为 unfinishCount 0、completed true；
- 章节行比任务点外壳晚约 4 秒。

结论：换章节后再次验证成功；慢翻完成路径稳定；章节目录行异步更新的延迟再次出现，观察层必须支持延迟重读。

这次测试同样只做了滚动，没有点击答案、没有提交。
