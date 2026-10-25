# DSH 集成说明（现状）

## 1. 一个 DSH 插件由什么组成

当前插件包：

- `package.json`：包元数据 + `dsh` 字段；`dsh.bundle.patch` 指向 Cordis 补丁。
- `cordis.patch.yml`：注册 Agent 预设（模式），并把插件、persona、tool-fs、压缩插件挂进预设作用域。
- `index.js`：具名导出 `name` / `inject` / `apply`；注册系统提示词和工具。
- `prompts/`：模式提示词。
- `tools/`：工具注册实现。

## 2. 模式注册

模式不是 `ctx.tools.register` 注册的，而是通过 Cordis 补丁插入一个 `@deepseek-ai/dsh-agent-preset`：

```yaml
- insert:
    - id: preset-xuexi-next
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: xuexi-next
        name: 学习模式
        plugins:
          - id: xuexi-next
            name: dsh-xuexi-next
```

关键约束（来自旧版实测）：

- 插件只能列在 `config.plugins` 下，不要往根作用域再 include；
- persona 必须有 `prefix`，且不要 `complete: true`，否则会抑制插件注入的提示词；
- 只列在预设中的工具才会出现在该模式，不会污染标准模式；
- `index.js` 不要加 `export default`，否则 DSH 会丢掉 `inject`。

## 3. 工具注册

`index.js` 的 `apply(ctx)` 中：

```js
ctx.tools.register({
  name,
  description,
  parameters,   // JSON Schema
  output: { schema, render },  // render 返回 ContentBlock[]
  execute(args, exec) { ... }
})
```

当前 `tools/registry.mjs` 注册：

- `xuexi_health`：链路诊断；
- `page_questions`：题目读取；
- `page_snapshot`：页面、内容标签、frame、滚动域观察；
- `task_points`：当前内容标签任务点、完成状态、PDF 映射；
- `page_notes`：工作区 `.notes/` 结构化页面笔记；
- `task_point_check`：不刷新页面复核指定任务点；
- `scroll_to`：任务点滚入视口；
- `scroll_domain`：document 滚动，支持 domain 组合句柄，兼容 frame_id。

P5 观察层已通过真实页面和静态 fixture 验证。2026-10-20 已在真实 DSH 中完成插件安装、预设加载、观察/笔记工具调用及任务点复核，见 [P8 验证记录](research/p8-dsh-install-validation.md)。这是历史验证结果，不代表当前机器的配置一定仍处于启用状态。

2026-10-25 补齐了不完整观察时的笔记保护：未重新观察的任务与备注会保留，任务级 `stale=true` 表示需要重新确认；重新观察到该任务后更新事实并清除此标记。本次修复通过本地测试，尚未重新安装到真实 DSH 验证；具体规则见 [页面笔记与任务点复核](design/page-notes.md)。

## 4. 安装脚本

仓库提供：

~~~text
install.ps1
~~~

- 兼容 Windows PowerShell 5.1 与 PowerShell 7；
- UTF-8 BOM，中文显示正常；
- 直接运行显示中文交互菜单：安装 / 预览安装 / 卸载 / 查看状态；
- `-Action Install -DryRun` 等命令行参数属于高级预留接口；
- 实际安装会备份 profile 的 `package.json` / `pnpm-lock.yaml`，把插件写入 `dependencies` 和 `dsh.profile.bundles`，再运行 `pnpm install`；
- 安装前要求关闭 DeepSeek Harness；
- 如果 pnpm 供应链检查拦截 profile 已有依赖，菜单会询问是否仅本次使用 `--trust-lockfile` 重试，不删除 lockfile。

## 5. 上下文压缩 / `/compact`

在预设的 `plugins` 中挂一个 `cordis:group`：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
```

为什么必须 isolate：

- `compaction-basic` 提供服务 `compaction`；
- `tool-result-pruner` 提供服务 `toolResultPruner`；
- 提供服务但不 isolate，会被 preset registry 的 `leakedServices` 检查拒绝，界面显示“加载失败”。

`command-compact` 在预设作用域中注册 `/compact`；`compaction-basic` 负责自动压缩。

## 6. 参考

- 归档旧代码：`D:\Projects\XueXi\archive\dsh-xuexi-2.3.2`
- 其中 `cordis.patch.yml` / `index.js` 头注释记录了 DSH 集成踩坑。
- DSH 实现 checkout：`D:\DevelopSoftware\DSH NEXT\resources\app.asar\`
