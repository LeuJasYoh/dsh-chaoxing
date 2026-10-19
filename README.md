# dsh-xuexi-next

旧版 `dsh-xuexi` 的完整重写起点。

- 旧代码归档：`D:\Projects\XueXi\archive\dsh-xuexi-2.3.2`
- 新代码不 import 旧代码；只在需要查 DSH 协议/历史事故时参考归档。
- 当前版本：`0.1.0`（题目读取竖切）
- 预设：`xuexi-next`（名称「网课模式（重写）」）

## 当前已完成

- 注册新的 DSH Agent 预设；
- CDP 会话层：单页 target 绑定、frame 树、隔离执行上下文、导航代次；
- `page_questions`：只读读取学习通测验/作业页面的题目、选项、当前选择；
- `cxsecret` 字体解密：解析页面内嵌 TTF，还原被替换的汉字；
- 明文/加密混合检测：没有真正加密字体时直接返回原文；
- 内部任务点分析小部件：数量与完成情况（不是 Agent 工具）；
- `xuexi_health` 诊断工具；
- 冒烟测试与字体解密单元测试；真实浏览器联调脚本。

## 设计/研究文档

- [浏览器工具契约 v1](docs/design/tool-contract.md)
- [page_questions 设计](docs/design/page-questions.md)
- [任务点分析内部小部件设计](docs/design/task-point-analysis-components.md)
- [学习通题目页与字体加密观察](docs/research/quiz-encryption-observations.md)
- [超星章节 DOM 与滚动观察](docs/research/chaoxing-chapter-dom.md)
- [DSH 集成说明](docs/dsh-integration.md)

## 尚未完成

- `page_snapshot` / `page_outline` / `element_click` / `scroll_domain` / `page_navigate` / `media_*`；
- 截图保底工具（图片题/无法解密时）；
- 提交、答案复核等业务流程（后续决定）。

## 验证

```bash
npm test
```

真实浏览器联调（需要 Edge 以 9222 启动，并打开学习通测验页）：

```bash
npm run test:live
npm run test:live:plain
npm run test:live:tasks
```

## 注意

- 预设注册在 `cordis.patch.yml`，不在 `index.js`。
- 工具/提示词注册在 `index.js`，随预设作用域生效。
- 压缩服务必须放在 `isolate` group 里，否则预设会因 leaked services 加载失败。
- `lib/cxsecret/table.json` 的原始出处/许可证尚未最终确认，发布前需要处理。
- 字体解析器 `lib/vendor/typr-bundle.mjs` 来自 MIT 许可的 Typr.js，许可证见同目录 `TYPR-LICENSE.txt`。
