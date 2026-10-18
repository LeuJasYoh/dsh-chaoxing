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
        name: 网课模式（重写）
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

当前 `tools/registry.mjs` 只注册 `xuexi_health`，用于验证链路。

## 4. 上下文压缩 / `/compact`

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

## 5. 参考

- 归档旧代码：`D:\Projects\XueXi\archive\dsh-xuexi-2.3.2`
- 其中 `cordis.patch.yml` / `index.js` 头注释记录了 DSH 集成踩坑。
- DSH 实现 checkout：`D:\DevelopSoftware\DSH NEXT\resources\app.asar\`
