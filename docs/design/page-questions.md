# page_questions（题目读取）设计

状态：v0.1 已实现（只读竖切）
相关：[工具契约 v1](tool-contract.md)、[题目页与字体加密观察](../research/quiz-encryption-observations.md)

## 目标

把当前打开的学习通测验/作业页面里的题目事实交给模型：

- 题目、题型、选项、当前选择；
- 每个选项的可点击句柄；
- 文字是否加密、是否完整解出。

它**不会**答题、选择、提交、跳转页面，也不判断答案对错。

## 输入

```json
{ "limit": 100 }
```

- `limit`：最多返回多少道题；默认 100。

## 输出（外层统一信封）

```json
{
  "ok": true,
  "tool": "page_questions",
  "generation": 1,
  "page": { "url": "...", "title": "...", "visibility": "hidden" },
  "data": {
    "page_kind": "chaoxing_quiz",
    "frame_id": "...",
    "work": { "title": "做作业", "score": 100, "question_count": 5 },
    "questions": [
      {
        "qid": "215330632",
        "number": "1",
        "type": "single",
        "type_label": "【单选题】",
        "stem": "中国硅酸盐协会编著的82版《中国陶瓷史》认为，瓷器出现于（）时期。",
        "element_id": "e4",
        "frame_id": "...",
        "options": [
          { "label": "A", "text": "东汉", "data": "A", "element_id": "e0", "selected": false }
        ],
        "selected": [],
        "content_types": ["text"],
        "assets": []
      }
    ],
    "total": 5,
    "returned": 5,
    "truncated": false,
    "next_cursor": null,
    "text_decode": {
      "status": "decoded",
      "source": "inline",
      "font_sha256": "...",
      "font_bytes": 11404,
      "mapped_chars": 31,
      "unknown_chars": [],
      "encoded_chars_in_text": 43
    }
  },
  "error": null
}
```

## 文字检测决策

1. 扫描 frame 树，找到包含 `.TiMu` 的 frame；
2. 查找 `style#cxSecretStyle` / 任何含 `font-cxsecret` 的内嵌样式；
3. 有内嵌字体：解析 glyph 哈希表，逐字符尝试还原；
4. 没有字体：`status = plain`，直接返回原文（即使元素带 `font-cxsecret` class）；
5. 有字体但文字没有命中字体字符：也按 plain；
6. 有命中但存在未知字符：`partial`，列出 `unknown_chars`；
7. 有字体但无法解析/外部字体：`unsupported`，不假装成功；
8. 图片/公式等非文本内容通过 `content_types` / `assets` 报告，后续由截图保底处理。

## 错误

- `TARGET_NOT_FOUND`：CDP 9222 不可达，或没有找到学习通页面；
- `UNSUPPORTED_PAGE`：当前页面没有 `.TiMu`（例如还没打开章节测验）；
- `FRAME_NOT_FOUND`：frame 上下文创建失败；
- `TEXT_DECODE_FAILED`：字体解析失败；
- `INTERNAL_ERROR`：其他 CDP/页面异常。

## 当前限制

- 只支持内嵌 base64 字体；外部 `@font-face` 只报告 unsupported。
- 只覆盖对照表中的常用汉字；未知字符必须人工/截图确认。
- 只有一种“打开测验标签页”的前置条件，工具不会自动切换标签页。
- 尚未实现截图保底工具；图片题先报告 assets。
- `element_id` 的点击执行工具（element_click）尚未接入；句柄已经预留给后续实现。
