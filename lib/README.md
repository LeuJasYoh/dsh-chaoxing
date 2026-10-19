# lib

公共实现放这里。

- `cdp/session.mjs`：CDP 连接、page target 选择、frame 树、隔离执行上下文、导航代次
- `cxsecret/decode.mjs`：学习通内嵌字体检测与文字还原
- `cxsecret/table.json`：glyph 路径哈希 -> 真实 Unicode 对照表（来源/许可证待确认）
- `extract/questions.mjs`：在页面内提取题目结构并分配元素句柄
- `tasks/collect.mjs`：只读采集当前标签内任务点外壳与章节目录行
- `tasks/count.mjs`：内部小部件：任务点数量分析
- `tasks/completion.mjs`：内部小部件：任务点完成情况分析
- `vendor/typr-bundle.mjs`：MIT 许可的 Typr.js 字体解析器
