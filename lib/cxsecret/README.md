# cxsecret 字体解密模块

## 背景

超星部分题目/选项把汉字替换成“假字符”，再用页面内嵌的 `font-cxsecret` 字体渲染回正确字形。
本目录提供从内嵌 TTF 中恢复真实文字的模块。

## 数据来源与许可

- `../vendor/typr-bundle.mjs`：Typr.js 字体解析器，MIT 许可，许可证见 `../vendor/TYPR-LICENSE.txt`。
- `table.json`：从公开学习通字体解密资料整理的「glyph 路径哈希 -> 真实 Unicode」对照表
  （20,906 条常用汉字）。该数据文件的原始出处与再分发许可尚未最终确认，当前仅作为原型使用；
  后续应改为从 OFL 参考字体自行生成，或取得明确授权后再发布。
- `test/fixtures/cxsecret-ceramic.ttf`：从真实学习通页面保存的加密字体子集，仅用于本地测试。

## 算法

1. 页面 `style#cxSecretStyle` 内嵌 base64 TTF；
2. 解析 TTF 的 cmap/glyf；
3. 对每个假字符取 `Typr.U.glyphToPath(font, gid)`，`JSON.stringify` 后 MD5；
4. 取 MD5 十六进制第 25~32 位作为 key，查 `table.json` 得到真实 Unicode；
5. 逐字符替换，非加密字符原样保留。

## 限制

- 仅覆盖 table 中已有常用汉字；未覆盖字符必须报告为 unknown，不能静默返回乱码。
- 页面没有真正加载加密字体时（即使有 `font-cxsecret` class），不得强行解密。
- 外部 `@font-face` 字体文件尚未支持。
