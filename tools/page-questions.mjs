import { collectQuestions } from '../lib/extract/questions.mjs'

/**
 * Read-only question reader for Chaoxing quiz / work pages.
 *
 * This tool deliberately does not answer, select, submit or navigate. It only
 * reports structured question facts, readable text, option handles and the
 * decoding status of the page's embedded font.
 */
export function registerPageQuestions(ctx, { output, toLossless, session }) {
  ctx.tools.register({
    name: 'page_questions',
    description: [
      'Read the questions on the currently open Chaoxing quiz/work page.',
      'Returns question ids, types, stems, options, page-relative element handles and the current selection state.',
      'When the page embeds a font-cxsecret font, the text is decoded automatically; the text_decode field says whether the result is plain, fully decoded, partial or failed.',
      'This tool is read-only: it never clicks, selects, submits or navigates. Open the chapter quiz tab first, then call it.',
      'If text_decode.status is partial or failed, do not guess the missing text; ask the user or use a screenshot fallback later.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of questions to return. Defaults to 100.',
        },
      },
    },
    output,
    async execute(args = {}) {
      const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 100
      try {
        const result = await collectQuestions(session, { limit })
        return toLossless({
          ok: true,
          tool: 'page_questions',
          generation: session.generation,
          page: {
            url: result.page.url,
            title: result.page.title,
            visibility: result.page.visibility,
          },
          data: {
            page_kind: 'chaoxing_quiz',
            frame_id: result.frame.frame_id,
            work: result.work,
            questions: result.questions,
            total: result.total,
            returned: result.returned,
            truncated: result.truncated,
            next_cursor: result.next_cursor,
            text_decode: result.text_decode,
          },
          error: null,
        })
      } catch (error) {
        const code = error && error.code ? error.code : 'INTERNAL_ERROR'
        const observed = error && error.observed ? error.observed : {}
        return toLossless({
          ok: false,
          tool: 'page_questions',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: {
            code,
            message: error && error.message ? error.message : String(error),
            ...(observed.hint ? { hint: observed.hint } : {}),
            observed,
          },
        })
      }
    },
  })
}
