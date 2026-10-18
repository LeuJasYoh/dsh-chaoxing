# dsh-xuexi-next

旧版 `dsh-xuexi` 的完整重写起点。

- 旧代码归档：`D:\Projects\XueXi\archive\dsh-xuexi-2.3.2`
- 新代码不 import 旧代码；只在需要查 DSH 协议/历史事故时参考归档。
- 当前版本：`0.1.0` 脚手架
- 预设：`xuexi-next`（名称「网课模式（重写）」）

## 当前已完成

- 注册新的 DSH Agent 预设；
- 注册 `xuexi_health` 诊断工具，验证工具注册链路；
- 通过 `ctx.systemPrompt.section` 注入模式提示词；
- 预设作用域内加载压缩三件套：
  - `compaction-basic`（自动压缩）
  - `command-compact`（`/compact` 命令）
  - `tool-result-pruner`（工具结果修剪）
- 加载 `tool-fs`（read/write/edit/read_image）。

## 设计文档

- [浏览器工具契约 v1](docs/design/tool-contract.md)：后台/前台双模式、工具命名、IO 结构、滚动域模型
- [超星章节 DOM 与滚动观察](docs/research/chaoxing-chapter-dom.md)：章节选择、嵌套滚动、PDF/iframe 实测记录

## 尚未完成

- 按 v1 契约实现工具（当前只有 `xuexi_health`）；
- CDP 浏览器接入；
- 页面观察/点击/滚动/媒体控制实现；
- 复核/提交等业务流程（后续决定是否属于插件核心）。

## 验证

```bash
node test/smoke.mjs
```

## 注意

预设注册在 `cordis.patch.yml`，不在 `index.js`。
工具/提示词注册在 `index.js`，随预设作用域生效。
压缩服务必须放在 `isolate` group 里，否则预设会因 leaked services 加载失败。
