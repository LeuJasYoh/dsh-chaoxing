# 学习通题目页与字体加密观察

- 观察时间：2026-10-19
- 观察方式：CDP 只读（Runtime.evaluate / DOM），未点击答案、未提交
- 相关文档：[超星章节 DOM 与滚动观察](chaoxing-chapter-dom.md)、[page_questions 设计](../design/page-questions.md)

## 1. 题目藏在哪一层 iframe

以“学生学习页面”（`/mycourse/studentstudy`）为例：

```text
studentstudy 顶层页
└─ iframe#iframe                      /mooc-ans/knowledge/cards
   └─ iframe                          /ananas/modules/work/index.html
      └─ iframe#frame_content         /mooc-ans/work/doHomeWorkNew   ← 题目在这里
```

课程主页（`mooc2-ans` 新 UI）也类似：章节列表先由 `frame_content-zj` 加载，点击小节后进入
`studentstudy`；题目帧再嵌在 `knowledge/cards` 里面。读取题目必须遍历 frame 树，
不能只看主文档。

## 2. 题目 DOM（中文/英文题库共用）

```text
div.questionLi
└─ div.TiMu[data="0|1|3"]                    // 题型
   ├─ div.Zy_TItle
   │  ├─ i                                    // 题号
   │  ├─ span.newZy_TItle                     // 【单选题】/【多选题】/【判断题】
   │  └─ div.font-cxsecret.fontLabel          // 题干；可能是加密字体
   ├─ ul.Zy_ulTop
   │  └─ li[qid][qtype][role=radio|checkbox][onclick=addChoice|addMultipleChoice]
   │     ├─ span.num_option[data="A"]         // 选项字母，明文
   │     └─ a.font-cxsecret                   // 选项内容；可能是加密字体
   ├─ input[name="answer<qid>"]               // 当前选择值（未答为空）
   └─ input[name="answertype<qid>"][value=0|1|3]
```

观察到的题型映射：

| `data`/`qtype` | 类型 | onclick |
|---|---|---|
| 0 | 单选题 | `addChoice(this)` |
| 1 | 多选题 | `addMultipleChoice(this)` |
| 3 | 判断题 | `addChoice(this)`，选项 `data="true"/"false"` |

题目 ID：外层 `question<qid>` 的 `data="<qid>"`；`li` 和隐藏 input 的 name 也带同一 `qid`。
题号是 `Zy_TItle > i`，题型标签是 `.newZy_TItle`，不要从题干文字里猜题型。

## 3. 字体加密机制（当前已确认）

部分页面的 `.font-cxsecret` 文本在 DOM 里是“假字符”，浏览器用页面内嵌字体渲染成正确字形：

```html
<style id="cxSecretStyle">
@font-face { font-family: font-cxsecret; src: url("data:application/font-ttf;base64,...") }
.font-cxsecret { font-family: font-cxsecret !important; }
</style>
```

解密流程：

1. 从 `style#cxSecretStyle` 提取 base64 TTF；
2. 用 Typr 解析 `cmap` / `glyf`；
3. 对每个假字符的 glyph 取 `Typr.U.glyphToPath`，`JSON.stringify` 后做 MD5；
4. 取 MD5 十六进制第 25~32 位作为 key，查公开的「glyph 路径哈希 -> 真实 Unicode」表；
5. 逐字符替换；非加密字符（标点、英文、普通汉字）保持不变。

### 实测样本

| 账号 | 课程 | 章节 | 字体字节 | 解出字符 | 未知字符 |
|---|---|---|---|---|---|
| 原账号 | 马克思主义基本原理 | 5.5 | 14364 | 46 | 0 |
| 原账号 | 马克思主义基本原理 | 5.6 | 12276 | 38 | 0 |
| 原账号 | 马克思主义基本原理 | 6.6 | 9020 | 18 | 0 |
| 原账号 | 马克思主义基本原理 | 6.7 | 9980 | 24 | 0 |
| 贵州师范大学账号 | 中国陶瓷鉴赏与器物陈设 | 1.1 | 11404 | 31 | 0 |
| 贵州师范大学账号 | 中国陶瓷鉴赏与器物陈设 | 1.4 | 10164 | 24 | 0 |
| 贵州师范大学账号 | 中国陶瓷鉴赏与器物陈设 | 1.5 | 10540 | 24 | 0 |
| 贵州师范大学账号 | 中国陶瓷鉴赏与器物陈设 | 2.1 | 12140 | 35 | 0 |

结论：

- 中文题目的加密**机制一致**：页面内嵌字体 + 假字符 + 同一套 glyph 哈希对照；
- 每页字体文件不同（大小/SHA-256 不同），所以不能把某一页的字体或映射写死；
- 同一套解密代码对 8 份不同章节测验全部有效。

## 4. 反例：有 `font-cxsecret` 标记但并未加密

医学英语 2.2 的英文题：

- 题干/选项元素带 `font-cxsecret` class；
- 但页面没有真正的 `font-cxsecret` @font-face，计算字体是普通字体；
- DOM 文字是普通英文，可以直接读，没有乱码。

因此检测逻辑不能只看 class，必须检查：

1. 页面是否真的定义了 `font-cxsecret` 字体（内嵌或外部）；
2. 题目文字里是否真的出现该字体的 cmap 字符；
3. 解密后是否还有 unknown 字符。

## 5. 对工具的约束

- 先找真正加载的字体，再决定是否解密；没有字体就原样返回文字。
- 每个页面单独解析字体，不跨页复用字体或映射。
- 解密结果必须带 `text_decode.status`：`plain / decoded / partial / unsupported / failed`。
- 未知字符要列出来，不能静默替换成乱码或猜测。
- 图片题/公式题/外部字体暂未支持；需要时走截图或人工确认。
- 对照表 `lib/cxsecret/table.json` 的原始出处与再分发许可仍需在发布前确认。
