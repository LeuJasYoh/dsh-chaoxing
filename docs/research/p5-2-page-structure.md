# P5.2 页面结构调研：全模块内联页

日期：2026-10-20
页面：学生学习页面（6.1 商函）
目的：为 P5 观察层确认真实页面中的页面、标签、frame、任务点和滚动域结构。

## 1. 页面类型

- URL：/mycourse/studentstudy
- 标题：学生学习页面
- visibility：hidden
- readyState：complete
- knowledge/cards URL 带 num=0；
- 7 个任务点全部内联在同一 knowledge 页面；
- 没有发现“视频 / 章节测验”这种内容模块标签；
- 右侧存在“目录 / 讨论 / 笔记 / 标注”侧栏标签。

这是“全模块内联页”样本，不是“内容标签懒加载页”样本。

## 2. frame 结构

总 frame 数：28。

分类：

| 类型 | 数量 |
|---|---|
| 顶层 studentstudy | 1 |
| knowledge/cards | 1 |
| PDF module | 2 |
| video module | 5 |
| panView | 2 |
| about:blank / 工具 frame | 17 |

结论：不能把全部 frame 原样输出，否则一半以上是空白工具 frame。P5 应该过滤空白/脚本 frame，并记录 hidden_frame_count。

## 3. iframe 元素与 frame_id 的映射

已验证 CDP 方法：

1. DOM.enable；
2. DOM.getFrameOwner({ frameId })；
3. DOM.describeNode({ backendNodeId })；
4. 从 node.attributes 读取 iframe 的 src、jobid、data、id、class。

实际结果：

- knowledge/cards 的 owner iframe：id=iframe，src=/mooc-ans/knowledge/cards...
- PDF module 的 owner iframe：jobid 存在，data 里有 objectid/name；
- video module 的 owner iframe：jobid 存在，data 里有 objectid/name；
- panView 的 owner iframe：id=panView，src 带 objectid；
- 两个 PDF module frame 的 name 都是 ext-gen1050，不能靠 frame.name 区分。

结论：frame_id 与 iframe 元素可以稳定映射；身份优先使用 jobid/objectid，不使用重复的 DOM id/name。

## 4. 任务点

knowledge frame 中：

- .ans-attach-ct 总数：7；
- 带 .ans-job-icon 的任务点：7；
- 普通附件 ignored：0。

任务点：

1. PDF：商函教案.pdf；
2. 视频：1.商务性沟通概述.mp4；
3. 视频：2.函的本质与商函的特点.mp4；
4. 视频：3.商函的沟通思路.mp4；
5. 视频：4.商函的写作格式与行文逻辑.mp4；
6. 视频：5.温馨提示(2).mp4；
7. PDF：商务性沟通与商务性文书写作之商务信函.pdf。

观察到的坑：

- wrapper id 重复：ext-gen1050、ext-gen1051；
- PDF iframe id 重复：ext-gen1050；
- 视频 iframe id 为空；
- 所以 DOM id 不能当任务点身份，必须使用 jobid；
- 所有 wrapper 都有 ans-job-finished；
- 但 4 个视频的 aria 仍是“任务点未完成”，PDF 的 aria 为 null；
- 说明完成判断必须以完成 class 为主，aria 只作辅助。

## 5. 滚动域

### 顶层页面

- document：scrollHeight 6627，clientHeight 828；
- 只有一个 element 滚动域：#coursetree；
- #coursetree：scrollTop 932.8，scrollHeight 1633，clientHeight 700，overflow-y=auto。

### knowledge frame

- document 本身不滚：scrollHeight=clientHeight=6363；
- 没有 element 滚动域。

### video module

- document 不滚；
- 没有 element 滚动域。

### PDF panView

- 每个 PDF 的 document 可滚：
  - PDF1：scrollHeight 2542，clientHeight 546；
  - PDF2：scrollHeight 13476，clientHeight 546；
- 没有发现 element 滚动域。

结论：滚动域不只在主页面；element 滚动域真实存在（#coursetree），PDF 域在跨域 panView frame 的 document 上。

## 6. 标签识别风险

右侧存在：

~~~html
<div class="tabs">
  <div class="tabCatalog">
    <ul>
      <li id="tit1" class="active">目录</li>
      <li id="tit2">讨论</li>
      <li id="tit3">笔记</li>
      <li id="tit5">标注</li>
    </ul>
  </div>
  <div class="showcontent">
    <div id="content1" class="chapter">...</div>
    ...
  </div>
</div>
~~~

这是侧栏标签，不是内容模块标签。

风险：

- 不能用“所有 .tabs 下的 li”当内容标签；
- .tabs 里还嵌套了 #coursetree 的大量目录 li；
- 当前 active 是 #tit1（目录），不是任务内容标签；
- 如果 task_points 把侧栏标签当内容标签，会误判“当前标签”。

结论：P5 的 tabs 只表示内容/模块标签；侧栏标签不计入任务标签；没有内容标签时 tabs 为空，task_points 分析全部内联模块。

## 7. 其他发现

- 顶层 #coursetree 内部有隐藏 input#_studystate，value 不是严格 JSON（类似对象字面量），当前 JSON.parse 失败时 studyState 为 null；不要把它作为唯一依据。
- 顶层 document 只有 #coursetree 一个真实 element 滚动域。
- hidden 页面下 DOM 和 CDP 观察仍正常。

## 8. 对 P5.2/P5.3 的影响

已经可以确定：

- frame_id ↔ iframe 元素映射方法可用；
- 任务点身份用 jobid/objectid；
- 空白工具 frame 需要过滤；
- 侧栏 tabs 必须和内容 tabs 分开；
- element 滚动域需要纳入；
- 全内联页没有内容标签，task_points 应处理“无内容标签”的情况；
- 完成状态继续复用现有任务点小部件。

## 9. 内容标签页补充样本（2026-10-20）

后续一次性只访问一个页面，补充了三个内容标签页样本。

### 样本 A：英语 Unit 2 Stress

- 3 个内容标签：微课 / Video 1 / video 2；
- 当前标签：微课；
- 只加载了当前标签的视频模块（frame 摘要：knowledge + 1 video module）；
- 当前标签有 1 个任务点：微课 Unit 2 stress.mp4；
- 任务点未完成；
- 其他两个标签没有加载对应模块 frame。

### 样本 B：生物化学 氨基酸性质

- 3 个内容标签：笔记 / 微课 / 分光光度法；
- 当前标签：笔记；
- frame 摘要只有 knowledge，没有模块 frame；
- 当前标签任务点数量：0；
- 章节状态：已完成；
- 说明“当前标签没有任务点”是合法情况，不是错误。

### 样本 C：马原 1.2 世界的多样性统一于物质

- 2 个内容标签：视频 / 章节测验；
- 当前标签：视频；
- 只加载了当前标签的视频模块；
- 当前标签 1 个任务点：视频已完成；
- 其他标签（章节测验）没有加载对应模块 frame。

## 10. 内容标签 DOM

三页共用同一套结构：

~~~html
<div class="prev_list" id="prev_tab">
  <ul class="prev_ul clearfix">
    <li id="dct1" class="active" title="微课" cardid="..." role="option"
        onclick="changeDisplayContent(1,3,'...','...','...','');">
      <div class="prev_white" aria-hidden="true">
        <span class="num">1</span>
        <span class="spanText">微课</span>
      </div>
    </li>
    <li id="dct2" title="Video 1" cardid="..." role="option" ...>...</li>
    <li id="dct3" title="video 2" cardid="..." role="option" ...>...</li>
  </ul>
</div>
~~~

稳定特征：

- 容器：div#prev_tab.prev_list；
- 直接列表：ul.prev_ul.clearfix；
- 标签项：li[id^=dct][cardid][role=option]；
- active 在 li 上；
- 标题在 li[title] / .spanText；
- onclick 的 changeDisplayContent(当前序号, 总数, ...) 带有标签总数；
- 侧栏标签是另一套：.tabCatalog > ul > li#tit1..#tit5，不能混用。

## 11. 页面类型结论

目前确认三种页面：

1. 全模块内联页：没有 #prev_tab，所有模块在同一 knowledge 页面；
2. 内容标签页：有 #prev_tab，只加载当前标签的模块；
3. 当前标签不是任务（例如“笔记”）：没有任务点，task_points 返回 0 也是合法结果。

内容标签页的“当前标签任务点”只应分析当前加载的模块，不主动加载其他标签。

## 12. 仍然需要补的样本

- 真实点击/切换内容标签后的加载过程（P6 才会做，P5 不做）；
- 更多文档类型（PDF/Word/PPT）在同一内容标签页中的表现；
- OOPIF 跨域模块在标签页中的覆盖。

