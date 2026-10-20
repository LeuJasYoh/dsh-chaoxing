import { Buffer } from 'node:buffer'
import { CdpError } from '../cdp/session.mjs'
import { analyzeFont, countEncodedChars, decodeText } from '../cxsecret/decode.mjs'

/**
 * Runs inside the page's isolated world. Only called once we know it has .TiMu,
 * so the handle registry is not created in unrelated frames.
 */
function extractQuestionsInPage(idBase) {
  const blocks = Array.from(document.querySelectorAll('.TiMu'))
  if (!blocks.length) return { hasQuiz: false }
  const reg = globalThis.__DSH_XUEXI_HANDLES__ || (globalThis.__DSH_XUEXI_HANDLES__ = { byEl: new WeakMap(), byId: new Map(), next: 0 })
  if (reg.next < idBase) reg.next = idBase
  const idFor = (el) => {
    const old = reg.byEl.get(el)
    if (old) return old
    const id = 'e' + reg.next++
    reg.byEl.set(el, id)
    reg.byId.set(id, el)
    return id
  }
  const styleEl = document.querySelector('style#cxSecretStyle') || Array.from(document.querySelectorAll('style')).find((s) => /font-cxsecret/.test(s.textContent || ''))
  let fontB64 = null
  let fontSource = 'none'
  if (styleEl) {
    const m = /base64,([A-Za-z0-9+/=]+)/.exec(styleEl.textContent || '')
    if (m) { fontB64 = m[1]; fontSource = 'inline' }
  }
  if (!fontB64) {
    try {
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        for (const rule of rules) {
          const text = rule.cssText || ''
          if (rule.type === CSSRule.FONT_FACE_RULE && /font-cxsecret/.test(text)) { fontSource = 'external'; break }
        }
        if (fontSource === 'external') break
      }
    } catch {}
  }
  const questions = blocks.map((block) => {
    const wrapper = block.closest('[id^=question]')
    let qid = wrapper ? wrapper.getAttribute('data') : null
    if (!qid) { const firstLi = block.querySelector('li[qid]'); qid = firstLi ? firstLi.getAttribute('qid') : null }
    const titleEl = block.querySelector('.Zy_TItle')
    const numEl = titleEl ? titleEl.querySelector('i') : null
    const typeEl = titleEl ? titleEl.querySelector('.newZy_TItle') : null
    const labelEl = titleEl ? titleEl.querySelector('.fontLabel') : null
    const hiddenAnswer = qid ? block.querySelector('input[name="answer' + qid + '"]') : null
    const hiddenType = qid ? block.querySelector('input[name="answertype' + qid + '"]') : null
    const options = Array.from(block.querySelectorAll('li')).map((li) => {
      const num = li.querySelector('.num_option, .num_option_dx')
      const a = li.querySelector('a')
      return {
        element_id: idFor(li),
        label: num ? (num.textContent || '').trim() : null,
        data: num ? num.getAttribute('data') : null,
        text_raw: a ? (a.textContent || '').trim() : '',
        qid: li.getAttribute('qid'),
        qtype: li.getAttribute('qtype'),
        onclick: li.getAttribute('onclick'),
      }
    })
    const images = Array.from(block.querySelectorAll('img')).map((img) => ({ src: (img.src || '').slice(0, 500), alt: img.alt || '', width: img.naturalWidth || 0, height: img.naturalHeight || 0 }))
    return {
      element_id: idFor(block),
      qid,
      type_code: block.getAttribute('data') || (hiddenType ? hiddenType.value : null),
      type_label: typeEl ? (typeEl.textContent || '').trim() : null,
      number: numEl ? (numEl.textContent || '').trim() : null,
      stem_raw: labelEl ? (labelEl.textContent || '').trim() : '',
      options,
      answer_raw: hiddenAnswer ? hiddenAnswer.value : null,
      answer_type: hiddenType ? hiddenType.value : null,
      images,
    }
  })
  const bodyText = document.body ? document.body.innerText : ''
  const scoreMatch = /满分[:：]\s*([0-9.]+)/.exec(bodyText)
  const countMatch = /题量[:：]\s*([0-9]+)/.exec(bodyText)
  return {
    hasQuiz: true,
    fontB64,
    fontSource,
    questions,
    nextId: reg.next,
    page: { url: location.href, title: document.title, visibility: document.visibilityState },
    work: { title: document.title, score: scoreMatch ? Number(scoreMatch[1]) : null, question_count: countMatch ? Number(countMatch[1]) : questions.length },
  }
}

export function selectedLabels(raw, options) {
  if (!raw) return []
  const values = String(raw).split(/[,，;；\s]+/).filter(Boolean)
  const labels = []
  for (const option of options) {
    if (!option) continue
    const hit = values.some((value) => value === option.data || value === option.label || (option.data === 'true' && value === 'true') || (option.data === 'false' && value === 'false'))
    if (hit && option.label) labels.push(option.label)
  }
  if (labels.length === 0) {
    // Some pages store selected letters without separators, e.g. "ABC"; only accept
    // single-letter labels to avoid treating words such as "true" as option letters.
    const compact = String(raw).replace(/[^A-Za-z]/g, '').toUpperCase()
    if (compact.length > 1) {
      for (const option of options) {
        const label = option && option.label ? String(option.label).trim().toUpperCase() : ''
        if (label.length === 1 && compact.includes(label)) labels.push(option.label)
      }
    }
  }
  if (labels.length === 0) {
    // Some pages store the selected option letter directly in a class rather than the hidden input.
    for (const option of options) if (option && option.label && String(raw) === option.label) labels.push(option.label)
  }
  return labels
}

export function normalizeType(code) {
  if (String(code) === '0') return 'single'
  if (String(code) === '1') return 'multiple'
  if (String(code) === '3') return 'judge'
  return 'unknown'
}

export async function collectQuestions(session, options = {}) {
  await session.ensure()
  const page = await session.pageInfo()
  const frames = await session.frames()
  let idBase = 0
  let quizFrame = null
  let extracted = null
  const visited = []
  for (const item of frames) {
    const frame = item.frame
    if (!frame.url || frame.url === 'about:blank' || frame.url.startsWith('javascript:')) continue
    visited.push({ frame_id: frame.id, url: frame.url.slice(0, 300), name: frame.name || '' })
    let result
    try {
      result = await session.evaluateInFrame(frame.id, '(' + extractQuestionsInPage.toString() + ')(' + idBase + ')')
    } catch {
      continue
    }
    if (!result) continue
    if (typeof result.nextId === 'number') idBase = Math.max(idBase, result.nextId)
    if (result.hasQuiz) { quizFrame = frame; extracted = result; break }
  }
  if (!extracted || !quizFrame) {
    throw new CdpError('UNSUPPORTED_PAGE', 'no question block (.TiMu) was found in this page', {
      page: page,
      frames: visited,
      hint: 'open the chapter quiz tab first, then call page_questions again',
    })
  }

  let fontInfo = null
  if (extracted.fontSource === 'inline' && extracted.fontB64) {
    try { fontInfo = analyzeFont(Buffer.from(extracted.fontB64, 'base64')) } catch (error) {
      throw new CdpError('TEXT_DECODE_FAILED', 'the embedded font could not be parsed', { frame_id: quizFrame.id, cause: error.message })
    }
  }

  const allText = extracted.questions.map((q) => [q.stem_raw, ...q.options.map((o) => o.text_raw)].join('\n')).join('\n')
  const encodedInText = fontInfo ? countEncodedChars(allText, fontInfo) : 0
  let status = 'plain'
  if (extracted.fontSource === 'inline' && fontInfo) {
    if (encodedInText === 0) status = 'plain'
    else {
      const decoded = decodeText(allText, fontInfo)
      if (decoded.unknown.length > 0) status = 'partial'
      else status = 'decoded'
    }
  } else if (extracted.fontSource === 'external') {
    status = 'unsupported'
  }

  const unknownChars = fontInfo && status !== 'plain' ? [...new Set(decodeText(allText, fontInfo).unknown)] : []
  const decodeOne = (text) => {
    if (!fontInfo || status === 'plain' || status === 'unsupported' || status === 'failed') return text
    return decodeText(text, fontInfo).text
  }

  const questions = extracted.questions.map((q) => {
    const options = q.options.map((o) => ({
      label: o.label,
      text: decodeOne(o.text_raw),
      data: o.data,
      element_id: o.element_id,
    }))
    const selected = selectedLabels(q.answer_raw, options)
    for (const option of options) option.selected = selected.includes(option.label)
    return {
      qid: q.qid,
      number: q.number,
      type: normalizeType(q.type_code),
      type_code: q.type_code,
      type_label: q.type_label,
      stem: decodeOne(q.stem_raw),
      element_id: q.element_id,
      frame_id: quizFrame.id,
      options,
      selected,
      answer_raw: q.answer_raw,
      content_types: q.images.length ? ['text', 'image'] : ['text'],
      assets: q.images.map((img) => ({ kind: 'image', ...img })),
    }
  })

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 100
  const returned = questions.slice(0, limit)
  return {
    page,
    frame: { frame_id: quizFrame.id, url: quizFrame.url, name: quizFrame.name || '' },
    work: extracted.work,
    questions: returned,
    total: questions.length,
    returned: returned.length,
    truncated: returned.length < questions.length,
    next_cursor: returned.length < questions.length ? String(returned.length) : null,
    text_decode: {
      status,
      source: extracted.fontSource,
      font_sha256: fontInfo ? fontInfo.sha256 : null,
      font_bytes: fontInfo ? fontInfo.bytes : null,
      mapped_chars: fontInfo ? fontInfo.mapped : 0,
      unknown_chars: unknownChars,
      encoded_chars_in_text: encodedInText,
    },
  }
}
