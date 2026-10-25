# 开发进度与下一阶段路线

更新时间：2026-10-25
当前包版本：0.2.1
当前阶段：P0–P5 核心功能、笔记与任务点复核已实现；P8 的真实 DSH 安装和观察/笔记链路已有验证记录，完整操作流程仍待后续。当前源码已补齐不完整观察的笔记保护，本次修复仅完成本地验证。

后续 TODO 与暂不处理事项统一见 [README](../README.md#todo)；列入 TODO 不代表已经批准实施。

## 一、当前已经完成

### P0 插件骨架与 DSH 对齐

- 新的 DSH Agent 预设：xuexi-next（学习模式）；
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

本地验证：

- 早期已完成 25 个 JS/MJS 文件的 node --check、package.json/locale JSON 解析及 DSH 自带 js-yaml 的补丁结构检查；
- npm pack --dry-run 通过，打包内容包含 tools/lib/prompts/cordis.patch.yml/locale/icon；
- 2026-10-25 的 npm test 七组全部通过：smoke / cxsecret / tasks / scroll / questions / observe / notes；
- 本次修改的笔记实现与测试通过 node --check、git diff --check；回归测试覆盖空 pending/partial、截断、加载中、部分更新、恢复、完整清空及临时文件保存。

既有真实页面与 DSH 验证：

- 7 个任务点全部能被 scroll_to 滚入视口；
- 7 个 PDF 全部能找到独立 panView，scroll_domain 返回 at_bottom=true，底部间隙 ≤ 0.4px；
- 错误参数返回对应错误码；
- 2026-10-20 已在真实 DSH 中完成安装、预设加载、观察/笔记工具调用和任务点复核，见 [P8 验证记录](research/p8-dsh-install-validation.md)。

验证边界：

- 历史安装验证已完成，不代表当前机器的 profile 一定仍启用插件；本次笔记保护尚未重新安装到真实 DSH 验证；
- 未完成 PDF 的慢翻完成状态翻转已在两个章节验证（见 [PDF 记录](research/pdf-scroll-completion.md)）；单步直接跳到底能否触发完成仍待验证；
- 网络限速下已验证观察结果的 pending/complete 变化，但操作工具的 waitFor 在真实延迟加载页面上的重试仍需验证；
- 完整的标签切换、点击、媒体操作流程尚未实现，也未做端到端验收；
- 字体表来源/再分发许可仍未最终确认。

## 三、已知缺口与设计债

1. 观察/句柄层核心已实现；domain 组合句柄已接入 scroll_domain，TAB_UNRESOLVED 已用真实可逆异常状态和静态 fixture 复现。
2. 标签层已能观察当前内容标签；切换标签仍属 P6，不在 P5。
3. 工具契约与当前实现有偏差：
   - scroll_domain 优先接收 domain 组合句柄，同时保留 frame_id 旧入口；
   - scroll_to 是新工具，不在 v1 契约中；
   - page_questions 是先做竖切。
   
   这些偏差是主动演进，不是错误；等观察层确定后统一回写契约，不为了旧契约限制新结构。

4. 元素滚动域已加入 page_snapshot；截断标记和 evaluable 的准确性仍需补齐，更多 element/OOPIF 类型需要页面样本。
5. foreground 模式未实现。
6. 慢翻 readDocument 未暴露成 Agent 工具。
7. 真实 DSH 安装及观察/笔记链路已验证；本次笔记保护复测、完整操作流程的端到端验证仍待后续。
8. 题目分页、计划参数声明与页面级 stale 等收尾项待确认；目标多开、句柄加固、安装路径回退及测试副作用本轮不处理，详见 README。
9. 字体对照表 table.json 的来源/再分发许可未定。

## 四、阶段进度与后续开发

### P5 观察/句柄层（核心与笔记已实现，真实 DSH 链路已验证）

- P5.1 观察契约与句柄模型：已定稿，见 docs/design/p5-observation-contract.md
- P5.2 页面结构调研：全模块内联页 + 三个内容标签页样本已完成，见 docs/research/p5-2-page-structure.md
- P5.3 任务点清单：已实现，只观察当前内容标签；全内联页和内容标签页均可返回。
- P5.4 滚动域清单：已实现 document + 真实 element 滚动域（例如 #coursetree）。
- P5.5 PDF/文档映射：已实现 PDF 任务点 → module frame → panView frame → document domain。
- P5.6 就绪/截断：已实现 coverage / limits / truncated；限速加载中 pending → complete、真实 TAB_UNRESOLVED 和静态 fixture 已验证。
- P5.7 观察工具封装：已注册 page_snapshot / task_points，共用观察注册表和句柄失效模型。
- P5.8 联调：已验证全内联页、内容标签有任务、内容标签无任务、PDF 页面、真实 TAB_UNRESOLVED 异常路径、限速加载中 pending/complete、静态 fixture；见 docs/research/p5-8-observation-live.md。
- P5.9 工作区页面笔记：.notes 存储、revision、stale、未观察标签占位；见 docs/design/page-notes.md。
- P5.10 page_notes：get/list/capture/patch，自动 capture 观察事实。
- P5.11 task_point_check：复用任务点部件，默认最多等 3 秒，不刷新页面；0.2.1 已优化为初次观察完成即返回。
- P5.12 笔记/复核联调：已在重新安装后的真实 DSH 0.2.0 会话中验证；.notes 文件、plan patch、任务点复核均通过。
- 2026-10-25 笔记保护：不完整观察按 job_id 合并，保留未重新观察的任务与人工备注并标记任务级 stale；完整观察才可删除旧任务。本地回归通过，真实 DSH 复测待后续。
- scroll_domain 已支持 page_snapshot 返回的 domain 组合句柄，同时保留 frame_id 兼容；句柄进一步加固暂缓。

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

### P8 端到端与真实 DSH 验证（部分完成）

- [x] 安装 Bundle、预设加载、观察/笔记工具调用及任务点复核；见 [真实 DSH 记录](research/p8-dsh-install-validation.md)。
- [x] 用未完成 PDF 验证慢翻后的完成状态翻转；见 [PDF 记录](research/pdf-scroll-completion.md)。
- [ ] 在重新安装后的真实 DSH 会话中验证本次笔记保护；运行前确认插件在该 profile 中启用。
- [ ] 在后续操作工具具备后，验证完整工具列表、显示元数据及真实 Agent 会话的“识别标签 → 观察任务点 → 滚动/翻阅 → 复核”流程。
- [ ] 在真实延迟加载页面验证操作工具的 waitFor 重试。

### P9 契约、许可证与发布

- 根据观察层回写工具契约；
- 处理字体表许可证；
- 检查依赖许可证；
- 更新 README/CHANGELOG；
- 推送与发布。

## 五、下一会话从这里开始

1. 先读本文件及 README 的 TODO/暂不处理事项；
2. P5 与真实 DSH 安装链路已有实现和验证记录，不再按脚手架阶段重新规划；后续先确认要做笔记修复的真实 DSH 复测，还是进入 P6 标签切换；
3. 本次仅修复不完整任务观察覆盖笔记；其他收尾项待确认，明确暂缓的事项不要自动纳入修复；
4. 默认先跑本地测试；真实页面联调需确认本次操作范围，不把既有测试记录当作当前页面已验证。

## 六、测试命令

~~~bash
npm test
npm run test:live
npm run test:live:plain
npm run test:live:tasks
npm run test:live:scroll
npm run test:live:tools
npm run test:static
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
