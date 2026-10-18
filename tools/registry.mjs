/**
 * 工具注册入口。
 *
 * 工具集尚未定稿。这里先放一个健康检查工具，用来验证：
 *   - 插件确实注册进了 xuexi-next 预设作用域
 *   - 工具 schema / output render / execute 三件套能被 DSH 接受
 *
 * 讨论完工具边界后，把 registerTools 拆成 tools/eyes.mjs、tools/hands.mjs、
 * tools/workflows.mjs 等文件，再由这里汇总。
 */
export function registerTools(ctx, { version = '0.0.0', output, toLossless } = {}) {
  ctx.tools.register({
    name: 'xuexi_health',
    description: '重写版诊断工具：确认 xuexi-next 预设和工具注册链路正常。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output,
    async execute() {
      return toLossless({
        ok: true,
        plugin: 'dsh-xuexi-next',
        version,
        mode: 'xuexi-next',
        phase: 'scaffold',
        note: '工具集未定稿；此工具仅用于验证 DSH 预设/工具注册。',
      })
    },
  })
}
