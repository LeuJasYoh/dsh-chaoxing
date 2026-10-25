function nowIso() {
  return new Date().toISOString()
}

function scopeFromPage(page = {}) {
  let courseId = null
  let chapterId = null
  try {
    const url = new URL(String(page.url || ''))
    courseId = url.searchParams.get('courseId') || url.searchParams.get('courseid') || null
    chapterId = url.searchParams.get('chapterId') || url.searchParams.get('chapterid') || null
  } catch {}
  return { course_id: courseId, chapter_id: chapterId, chapter_title: null }
}

export function createNote(noteId, page = {}) {
  const timestamp = nowIso()
  return {
    schema_version: 1,
    note_id: noteId,
    revision: 0,
    scope: scopeFromPage(page),
    page: {
      title: page.title || null,
      url_key: noteId,
      visibility: page.visibility || 'unknown',
      ready_state: page.ready_state || 'unknown',
      generation: page.generation || null,
      observed_at: timestamp,
    },
    tabs: [],
    plan: [],
    created_at: timestamp,
    updated_at: timestamp,
  }
}

function ensureTab(note, index, title) {
  let tab = note.tabs.find((item) => item.index === index)
  if (!tab) {
    tab = { index, title: title || null, active: true, observed: false, task_points: null, note: null }
    note.tabs.push(tab)
    note.tabs.sort((a, b) => a.index - b.index)
  }
  return tab
}

export function captureSnapshot(note, snapshot, noteId) {
  if (!note) note = createNote(noteId, snapshot && snapshot.page)
  if (!note.scope.chapter_title && snapshot && snapshot.chapter && snapshot.chapter.title) {
    note.scope.chapter_title = snapshot.chapter.title
  }
  const generation = snapshot && snapshot.generation != null ? snapshot.generation : null
  const wasStale = note.page.generation != null && generation != null && note.page.generation !== generation
  note.page = {
    ...note.page,
    title: snapshot && snapshot.page ? snapshot.page.title || null : note.page.title,
    url_key: note.note_id,
    visibility: snapshot && snapshot.page ? snapshot.page.visibility || 'unknown' : note.page.visibility,
    ready_state: snapshot && snapshot.page ? snapshot.page.ready_state || 'unknown' : note.page.ready_state,
    generation,
    observed_at: nowIso(),
    stale: Boolean(wasStale),
  }
  const incoming = snapshot && snapshot.tabs && Array.isArray(snapshot.tabs.items) ? snapshot.tabs.items : []
  if (incoming.length > 0) {
    const existing = new Map(note.tabs.map((tab) => [tab.index, tab]))
    note.tabs = incoming.map((item) => {
      const previous = existing.get(item.index) || {}
      return {
        index: item.index,
        title: item.title || previous.title || null,
        active: item.active === true,
        loaded: item.loaded === true,
        observed: previous.observed === true || item.active === true,
        task_points: previous.task_points !== undefined ? previous.task_points : null,
        note: previous.note || null,
      }
    })
  }
  note.revision += 1
  note.updated_at = nowIso()
  return note
}

export function captureTasks(note, tasks, noteId) {
  if (!note) note = createNote(noteId, tasks && tasks.page)
  const generation = tasks && tasks.generation != null ? tasks.generation : note.page.generation
  if (note.page.generation != null && generation != null && note.page.generation !== generation) note.page.stale = true
  note.page.generation = generation
  note.page.observed_at = nowIso()
  if (tasks && tasks.chapter && tasks.chapter.title) note.scope.chapter_title = tasks.chapter.title
  const index = tasks && tasks.tab && Number.isInteger(tasks.tab.index) ? tasks.tab.index : 1
  const tab = ensureTab(note, index, tasks && tasks.tab ? tasks.tab.title : null)
  const incoming = tasks && Array.isArray(tasks.task_points) ? tasks.task_points : []
  const complete = tasks?.coverage === 'complete' && tasks?.truncated !== true && tasks?.page?.ready_state === 'complete'
  tab.active = true
  tab.observed = tab.observed === true || complete || incoming.length > 0
  const previous = new Map((tab.task_points || []).map((item) => [String(item.job_id), item]))
  let next = incoming.map((item) => {
    const old = previous.get(String(item.job_id)) || {}
    return {
      job_id: item.job_id,
      kind: item.kind || 'unknown',
      title: item.title || null,
      state: item.state || 'unknown',
      signals: Array.isArray(item.signals) ? item.signals : [],
      conflict: item.conflict === true,
      frame_id: item.frame_id || null,
      observed_generation: generation,
      observed_at: nowIso(),
      source: 'observation',
      stale: false,
      annotation: old.annotation || null,
      intent: old.intent || null,
      needs_recheck: old.needs_recheck === true,
    }
  })
  if (!complete) {
    const observed = new Map(next.map((item) => [String(item.job_id), item]))
    next = [
      ...(tab.task_points || []).map((item) => observed.get(String(item.job_id)) || { ...item, stale: true }),
      ...next.filter((item) => !previous.has(String(item.job_id))),
    ]
  }
  tab.task_points = complete || next.length > 0 || tab.task_points !== null ? next : null
  note.revision += 1
  note.updated_at = nowIso()
  return note
}

function findTask(note, jobId) {
  for (const tab of note.tabs) {
    if (!Array.isArray(tab.task_points)) continue
    const task = tab.task_points.find((item) => String(item.job_id) === String(jobId))
    if (task) return { tab, task }
  }
  return null
}

export function applyPatches(note, expectedRevision, patches) {
  if (!note) throw new Error('note not found')
  if (expectedRevision != null && Number(expectedRevision) !== note.revision) {
    throw new Error('note revision mismatch: expected ' + note.revision + ', got ' + expectedRevision)
  }
  if (!Array.isArray(patches)) throw new Error('patches must be an array')
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') throw new Error('patch must be an object')
    const op = String(patch.op || '')
    if (op === 'set_plan') {
      note.plan = Array.isArray(patch.value) ? patch.value.map(String) : [String(patch.value || '')]
    } else if (op === 'append_plan') {
      note.plan = Array.isArray(note.plan) ? note.plan : []
      note.plan.push(String(patch.value || ''))
    } else if (op === 'set_tab_note') {
      const index = Number(patch.tab_index)
      const tab = note.tabs.find((item) => item.index === index)
      if (!tab) throw new Error('tab not found: ' + index)
      tab.note = String(patch.value || '')
    } else if (op === 'set_task_annotation') {
      const found = findTask(note, patch.job_id)
      if (!found) throw new Error('task not found: ' + patch.job_id)
      found.task.annotation = String(patch.value || '')
    } else if (op === 'set_task_intent') {
      const found = findTask(note, patch.job_id)
      if (!found) throw new Error('task not found: ' + patch.job_id)
      found.task.intent = String(patch.value || '')
    } else if (op === 'mark_task_needs_recheck') {
      const found = findTask(note, patch.job_id)
      if (!found) throw new Error('task not found: ' + patch.job_id)
      found.task.needs_recheck = true
    } else if (op === 'set_task_state') {
      throw new Error('task state is observation-owned; use mark_task_needs_recheck or re-observe')
    } else {
      throw new Error('unknown patch op: ' + op)
    }
  }
  note.revision += 1
  note.updated_at = nowIso()
  return note
}

export function summarizeNote(note) {
  if (!note) return null
  return {
    note_id: note.note_id,
    revision: note.revision,
    scope: note.scope,
    page: {
      title: note.page.title,
      generation: note.page.generation,
      observed_at: note.page.observed_at,
      stale: note.page.stale === true,
    },
    tabs: note.tabs.map((tab) => ({
      index: tab.index,
      title: tab.title,
      active: tab.active === true,
      observed: tab.observed === true,
      task_count: Array.isArray(tab.task_points) ? tab.task_points.length : null,
      note: tab.note || null,
      task_points: Array.isArray(tab.task_points)
        ? tab.task_points.map((task) => ({
            job_id: task.job_id,
            kind: task.kind,
            title: task.title,
            state: task.state,
            conflict: task.conflict === true,
            observed_generation: task.observed_generation,
            stale: task.stale === true,
            annotation: task.annotation || null,
            intent: task.intent || null,
            needs_recheck: task.needs_recheck === true,
          }))
        : null,
    })),
    plan: note.plan,
  }
}
