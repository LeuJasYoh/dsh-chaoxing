# 开发进度与下一阶段路线

更新时间：2026-10-20
当前版本：0.1.0
当前阶段：P0–P5.7 已实现观察/句柄核心，P5.8 真实页面联调部分完成。

## 一、当前已经完成

### P0 插件骨架与 DSH 对齐

- 新的 DSH Agent 预设：xuexi-next（网课模式（重写））；
- 命名导出 name / inject / apply，无 default export；
- 工具与提示词都在 apply 内注册；
- 工具注册和 CDP 会话清理放进 ctx.effect；
- 预设 patch 只挂在 preset.plugins 下；
- 压缩三件套在 isolate group 中；
- 补齐 Bundle 显示元数据：locale/en.json、locale/zh.json、icon.svg；
- package.json 的 dsh.bundle.patch、exports、files 已对齐当前 DSH Bundle 规范。

### P1 设计与研究

- 浏览器工具契约 v1；
- 超星章节 DOM 与滚动观察；
- 学习通题目页与字体加密观察；
- page_questions 设计；
- 任务点分析内部小部件设计；
- 通用滚动部件与工具设计。

### P2 题目读取

- page_questions：只读读取题目、题型、选项、当前选择；
- 嵌套 frame 查找；
- 内嵌字体解码与 plain / decoded / partial / unsupported / failed 状态；
- 稳定 element_id 句柄预留；
- 真实页面已验证。

### P3 任务点内部小部件

不是 Agent 工具，是内部复用模块：

- 任务点数量分析；
- 任务点完成情况分析；
- 完成类优先、aria 辅助、冲突标记；
- 章节未完成数交叉校验；
- coverage / unobservedIncomplete；
- 真实页面验证 7 个任务点全部完成，其中 4 个 aria 过期冲突被正确标出。

### P4 滚动部件与工具

内部部件：

- 就绪等待 waitFor；
- 滚动域指标与原子滚动；
- 任务点目标解析与页面滚入视口；
- PDF objectid → panView frame 解析；
- 内部慢翻 readDocument（尚未暴露成工具）。

工具：

- scroll_to：把指定 job_id 的任务点滚入视口；
- scroll_domain：原子滚动一个 frame 文档；
- 只支持 background；
- 页面隐藏时原生 scroll 事件为 0，需要显式 dispatch_scroll 时由调用方声明。

## 二、验证结论

已经执行：

- 25 个 JS/MJS 文件 node --check；
- package.json、locale JSON 解析；
- cordis.patch.yml 使用 DSH 自带 js-yaml 解析，结构与模板一致；
- npm pack --dry-run，打包内容包含 tools/lib/prompts/cordis.patch.yml/locale/icon；
- npm test 四组全部通过；
- 真实页面工具组装测试：
  - 7 个任务点全部能被 scroll_to 滚入视口；
  - 7 个 PDF 全部能找到独立 panView；
  - 7 个 scroll_domain 全部 at_bottom=true，底部间隙 ≤ 0.4px；
  - 错误参数返回对应错误码。

验证边界：

- 还没有在真实 DSH 中安装并激活 Bundle；
- 未完成 PDF 的慢翻完成状态翻转已在两个章节验证（见 docs/research/pdf-scroll-completion.md）；scroll_to 实际工具也已在真实页面验证；单步直接跳到底仍待验证；
- 还没有在真正延迟加载的页面验证 waitFor 重试；
- 字体表 provenance/许可证仍未最终确认。

## 三、已知缺口与设计债

1. 观察/句柄层核心已实现；剩余：domain 组合句柄尚未接入 scroll_domain，TAB_UNRESOLVED 尚未用真实异常页面复现。
2. 标签层已能观察当前内容标签；切换标签仍属 P6，不在 P5。
3. 工具契约与当前实现有偏差：
   - scroll_domain 当前使用 frame_id；
   - scroll_to 是新工具，不在 v1 契约中；
   - page_questions 是先做竖切。
   
   这些偏差是主动演进，不是错误；等观察层确定后统一回写契约，不为了旧契约限制新结构。

4. 元素滚动域已加入 page_snapshot；更多 element 类型和截断策略仍需更多页面样本。
5. foreground 模式未实现。
6. 慢翻 readDocument 未暴露成 Agent 工具。
7. 真实 DSH 安装、预设激活、模型工具列表验证未做。
9. 字体对照表 table.json 的来源/再分发许可未定。

## 四、未来开发

### P5 观察/句柄层（进行中）

- P5.1 观察契约与句柄模型：已定稿，见 docs/design/p5-observation-contract.md
- P5.2 页面结构调研：全模块内联页 + 三个内容标签页样本已完成，见 docs/research/p5-2-page-structure.md
- P5.3 任务点清单：已实现，只观察当前内容标签；全内联页和内容标签页均可返回。
- P5.4 滚动域清单：已实现 document + 真实 element 滚动域（例如 #coursetree）。
- P5.5 PDF/文档映射：已实现 PDF 任务点 → module frame → panView frame → document domain。
- P5.6 就绪/截断：已实现基础 coverage / limits / truncated；懒加载和异常页仍待补样本。
- P5.7 观察工具封装：已注册 page_snapshot / task_points，共用观察注册表和句柄失效模型。
- P5.8 联调：已在 9222/9223 真实页面验证全内联页、内容标签有任务、内容标签无任务、PDF 页面；见 docs/research/p5-8-observation-live.md。TAB_UNRESOLVED 和更多懒加载页面仍待补。

目标：让 Agent 自己拿到操作句柄，而不是测试脚本直接传参。

至少需要：

- 当前章节有哪些任务点；
- 每个任务点的 job_id、类型、标题、完成状态；
- 每个任务点是否已加载；
- PDF 对应的 panView frame；
- 当前页面可滚动域；
- 稳定 element_id 与 frame_id。

验收：

- Agent 能在真实 DSH 会话里先观察，再调用 scroll_to / scroll_domain；
- 观察结果能说明“没看全”；
- 不按文字猜元素。

### P6 标签层

- 进入章节先识别标签；
- 只处理当前标签；
- 当前标签完成后显式切下一个；
- 不强行一次性加载全部标签。

### P7 其余手眼工具

- element_click；
- page_navigate；
- media_play / media_pause；
- 截图保底（图片题/无法解密时）；
- 元素滚动域扩展；
- 视需要再讨论 foreground。

### P8 端到端与真实 DSH 验证

- 安装 Bundle 到 DSH profile；
- 验证预设激活、显示元数据、工具列表；
- 真实 Agent 会话跑通：
  - 识别标签；
  - 观察任务点；
  - 滚动到任务点；
  - 翻阅 PDF；
  - 重新观察任务点状态；
- 用未完成 PDF 验证完成状态翻转；
- 真实延迟加载页面验证 waitFor。

### P9 契约、许可证与发布

- 根据观察层回写工具契约；
- 处理字体表许可证；
- 检查依赖许可证；
- 更新 README/CHANGELOG；
- 推送与发布。

## 五、下一会话从这里开始

1. 先读本文件；
2. 做 P5 观察/句柄层设计，不直接继续堆工具；
3. 观察层稳定后再考虑 P6/P7；
4. 真实 DSH 安装验证放在 P8，不要在观察层不稳时提前端到端；
5. 保持只读验证习惯：没有明确授权，不点击答案、不提交、不改变学习进度。

## 六、测试命令

~~~bash
npm test
npm run test:live
npm run test:live:plain
npm run test:live:tasks
npm run test:live:scroll
npm run test:live:tools
~~~

## 七、2026-10-20 代码检查修复记录


已修复：

- CDP 会话增加 ready 状态，避免“WebSocket 已开但 Page/Runtime 未初始化”时误判已连接；
- 旧连接的 close/error 事件增加实例守卫，避免重连后旧事件把新连接清空；
- WebSocket open 超时/失败时关闭连接，避免悬挂连接；
- CDP send 同步抛错时清理 pending 和 timer；
- 滚动稳定性等待允许显式 timeout=0；
- 跨 frame 测量视口时对 top window 访问做防御；
- 多选答案支持紧凑格式，例如 ABC；
- 移除 document.mjs 未使用 import；
- 新增题目解析辅助逻辑测试（selectedLabels / normalizeType）。

验证：

- 25 个 JS/MJS 文件 node --check 通过；
- npm test 五组通过：
  smoke / cxsecret / tasks / scroll / questions。


## 八、2026-10-20 PDF 慢翻完成验证

- 在未完成 PDF 任务点上执行慢翻（300px × 21 步，每步停 1s，补发 scroll）；
- 父 frame 收到 isFinished；
- 任务点外壳立即变成 ans-job-finished；
- 章节行先保持旧值，随后异步更新为完成；
- 结论：慢翻路径有效；观察层必须分别报告任务点状态和章节行状态，不能把章节目录的短暂旧值当成失败。

## 九、2026-10-20 二次验证补充

- 换章节后再次验证未完成 PDF 慢翻完成；
- 实际 scroll_to 工具将任务点滚入视口，visible=true；
- 任务点外壳约 1.2 秒后更新，章节行约再 4 秒后更新；
- 观察层需要把“任务点状态”和“章节行状态”分开报告，并允许延迟重读。
