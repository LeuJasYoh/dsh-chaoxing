# dsh-xuexi-next

旧版 `dsh-xuexi` 的完整重写起点。

- 旧代码归档：`D:\Projects\XueXi\archive\dsh-xuexi-2.3.2`
- 新代码不 import 旧代码；只在需要查 DSH 协议/历史事故时参考归档。
- 当前版本：`0.2.1`（观察 + 工作区笔记 + 任务点复核）
- 预设：`xuexi-next`（名称「学习模式」）

## 当前已完成

- 注册新的 DSH Agent 预设；
- CDP 会话层：单页 target 绑定、frame 树、隔离执行上下文、导航代次；
- `page_questions`：只读读取学习通测验/作业页面的题目、选项、当前选择；
- `page_snapshot`：只读观察页面、内容标签、frame 树和滚动域；
- `task_points`：只读观察当前内容标签的任务点、状态与 PDF 映射；
- `page_notes`：读写工作区 `.notes/` 下的结构化页面笔记；加载中、部分观察或截断时保留未重新观察的任务与备注，并以任务级 `stale` 标记旧记录；
- `task_point_check`：不刷新页面复核指定任务点，默认最多等 3 秒；
- `cxsecret` 字体解密：解析页面内嵌 TTF，还原被替换的汉字；
- 明文/加密混合检测：没有真正加密字体时直接返回原文；
- 内部任务点分析小部件：数量与完成情况（不是 Agent 工具）；
- 内部滚动部件：就绪等待、滚动域、任务点滚入视口、PDF 解析与慢翻；
- `scroll_to`：把任务点滚入视口；
- `scroll_domain`：原子滚动一个 frame 文档，支持 domain 组合句柄，兼容 frame_id；
- `xuexi_health` 诊断工具；
- 七组本地测试：smoke、cxsecret、tasks、scroll、questions、observe、notes；另有真实浏览器联调脚本。

## 设计/研究文档

- [浏览器工具契约 v1](docs/design/tool-contract.md)
- [page_questions 设计](docs/design/page-questions.md)
- [任务点分析内部小部件设计](docs/design/task-point-analysis-components.md)
- [通用滚动部件与工具设计](docs/design/scroll-components.md)
- [P5.1 观察契约与句柄模型](docs/design/p5-observation-contract.md)
- [页面笔记与任务点复核](docs/design/page-notes.md)
- [开发进度与下一阶段路线](docs/development-roadmap.md)
- [学习通题目页与字体加密观察](docs/research/quiz-encryption-observations.md)
- [PDF 慢翻完成验证](docs/research/pdf-scroll-completion.md)（含两次真实未完成 PDF 验证）
- [P5.2 页面结构调研](docs/research/p5-2-page-structure.md)
- [P5.8 观察工具真实页面联调](docs/research/p5-8-observation-live.md)
- [P8 真实 DSH 安装、笔记与任务点复核验证](docs/research/p8-dsh-install-validation.md)
- [超星章节 DOM 与滚动观察](docs/research/chaoxing-chapter-dom.md)
- [DSH 集成说明](docs/dsh-integration.md)

## 当前阶段

截至 2026-10-25，P0–P5 核心功能已实现，当前注册 8 个工具（含健康检查）。真实页面、异常状态和静态 fixture 已验证；2026-10-20 已在真实 DSH 中跑通安装、预设加载、观察、笔记读写与任务点复核，但尚未完成标签切换、点击和媒体操作的完整流程。

本次笔记保护修复已通过本地测试：不完整观察不再清掉旧任务及人工备注；未重新观察的任务保留原事实并标记 `stale=true`，重新观察后恢复为 `false`。只有 `coverage=complete`、未截断且页面加载完成，才允许移除未返回的旧任务，包括清空清单。此修复尚未重新安装到真实 DSH 验证。

详见 [开发进度与下一阶段路线](docs/development-roadmap.md) 和 [笔记写入规则](docs/design/page-notes.md)。

## TODO

以下是后续工作清单，不代表已经全部排期或批准实施。

### 已完成

- [x] 真实 DSH 安装、预设加载、观察/笔记工具调用与任务点复核验证。
- [x] 不完整观察保留旧任务、备注、处理意图和待复核标记；补齐恢复、部分更新、完整清空与文件保存回归测试。

### 后续功能与验证

- [ ] P6：显式切换内容标签；当前只观察，不切换。
- [ ] P7：`page_outline`、`element_click`、`page_navigate`、`media_play` / `media_pause` 等操作工具。
- [ ] 慢翻文档的 Agent 工具封装；当前仅有内部部件。
- [ ] 截图保底工具，供图片题或无法解密时使用。
- [ ] 扩展 element 滚动域的操作能力；是否支持 foreground 后续再决定。
- [ ] 重新安装后验证本次笔记保护，并在后续操作工具具备后完成“观察 → 操作 → 复核”的端到端验证。
- [ ] 在真实延迟加载页面验证操作工具的等待重试；已有网络限速测试只证明观察结果能从 pending 恢复。
- [ ] 答案复核、提交等业务流程是否纳入新版，另行决定；不直接照搬旧版状态机。

### 待确认的收尾与发布事项

- [ ] `page_questions` 分页：目前只有 `limit`，返回的 `next_cursor` 尚不可用；暂可增大 `limit` 读取更多题目。
- [ ] 对齐 `page_notes` 多步计划的参数声明与实现：实现支持数组，schema 的 `value` 仍限定字符串。
- [ ] 补齐观察输出的边界：单 frame 元素数量达到上限时明确报告截断，`evaluable` 反映实际读取能力；补充复杂/OOPIF 页面样本。
- [ ] 梳理笔记页面级 `stale` 在导航后的含义；本次新增的是任务级旧记录标记，没有修改导航和句柄机制。
- [ ] 根据现有工具回写早期工具契约。
- [ ] 发布前确认字体对照表来源、再分发许可及依赖许可证。

### 暂不处理（2026-10-25 决定）

- 真实滚动测试可能改变学习进度：接受现有行为，不改测试脚本、不增加确认流程。
- 多学习页面的目标选择：当前使用场景课程无法多开，暂不调整。
- 旧操作句柄的失效与校验加固：暂缓，待机制讨论清楚后再决定，不列入本轮修复。
- 安装器显式路径无效时回退默认 profile：当前不调整。
- 旧版与归档代码不回补；审查发现只作为未来设计和测试参考。

## 安装到 DSH

插件根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

会显示中文菜单：

```text
1. 安装插件
2. 预览安装（不会修改任何文件）
3. 卸载插件
4. 查看安装状态
0. 退出
```

实际安装前需要关闭 DeepSeek Harness；脚本会：

- 定位 DSH profile；
- 备份 profile 的 package.json 和 pnpm-lock.yaml；
- 把本插件加入 profile 的依赖和 bundle 列表；
- 运行 pnpm install；
- 失败时恢复 profile 配置文件；
- 如果 pnpm 的供应链检查拦截了 profile 里已有依赖，会询问是否仅本次使用 `--trust-lockfile` 重试，不会删除 lockfile。

命令行参数属于预留的高级接口，日常使用不需要：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Action Install -DryRun
```

## 验证

```bash
npm test
```

默认测试不连接真实课程页面；笔记测试使用临时目录，不修改工作区现有笔记。

真实浏览器联调（需要 Edge 以 9222 启动；题目读取需测验页，任务点与滚动测试需章节页面）：

```bash
npm run test:live
npm run test:live:plain
npm run test:live:tasks
npm run test:live:scroll
npm run test:live:tools
```

静态页面 fixture 测试（不依赖学习通账号；需要 headless Edge 9333）：

```bash
npm run test:static
```

## 注意

- 预设注册在 `cordis.patch.yml`，不在 `index.js`。
- 工具/提示词注册在 `index.js`，随预设作用域生效。
- 压缩服务必须放在 `isolate` group 里，否则预设会因 leaked services 加载失败。
- `lib/cxsecret/table.json` 的原始出处/许可证尚未最终确认，发布前需要处理。
- 字体解析器 `lib/vendor/typr-bundle.mjs` 来自 MIT 许可的 Typr.js，许可证见同目录 `TYPR-LICENSE.txt`。
