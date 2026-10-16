import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { component } from './helpers/vue.js'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://scheduler.test/' })
for (const key of ['window', 'document', 'localStorage', 'history', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Document', 'ShadowRoot']) globalThis[key] = dom.window[key]
Element.prototype.scrollIntoView = () => {}
const { mount, flushPromises } = await import('@vue/test-utils')
const { nextTick } = await import('vue')
const App = await component('src/App.vue')
const { useScheduler } = await import('../src/composables/useScheduler.js')
const { normalizeClubs } = await import('../src/lib/tournament.js')
const { useShareUrl } = await import('../src/composables/useShareUrl.js')
let wrapper, originalFetch
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); originalFetch = globalThis.fetch })
afterEach(() => { wrapper?.unmount(); wrapper = null; globalThis.fetch = originalFetch })

function fixture() {
  const c = normalizeClubs(['A', 'B'].map(name => ({ name, teams: [{ name: '1' }, { name: '2' }] })))
  const s = { startTime: '09:00', endTime: '17:00', matchLength: 15, breakLength: 5, numRinks: 1, minGames: 2, maxGames: 5, minRest: 20, allowInterClub: false, pauses: [], foodBreaks: [] }
  const scheduler = useScheduler(); scheduler.generate(s, c)
  return { c, s, g: scheduler.schedule.value, w: scheduler.warnings.value }
}

test('server saving creates separate links and updates the same schedule', async () => {
  const requests = [], id = 'a'.repeat(32), token = 'b'.repeat(64)
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options })
    return Response.json({ id, ...(options.method === 'POST' ? { editToken: token } : {}), version: requests.length })
  }
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('form').trigger('submit')
  const save = () => wrapper.findAll('button').find(b => /Spara & dela|Spara ändringar/.test(b.text()))
  await save().trigger('click'); await flushPromises()
  assert.equal(wrapper.find('#public-link').element.value, `https://scheduler.test/s/${id}`)
  assert.equal(wrapper.find('#edit-link').element.value, `https://scheduler.test/s/${id}#edit=${token}`)
  assert.equal(window.location.href, `https://scheduler.test/s/${id}`)
  assert.equal(localStorage.getItem(`game-scheduler-edit:${id}`), token)
  const regen = wrapper.findAll('button').find(b => b.text().includes('Generera om'))
  await regen.trigger('click'); await save().trigger('click'); await flushPromises()
  assert.equal(requests[1].method, 'PUT')
  assert.equal(requests[1].url, `/api/schedules/${id}`)
  assert.equal(requests[1].headers.Authorization, `Bearer ${token}`)
  assert.equal(JSON.parse(requests[1].body).version, 1)
})
test('public views hide game counts and warnings, and editor links prefill saved inputs', async () => {
  const data = fixture(), id = 'a'.repeat(32), token = 'b'.repeat(64)
  data.s.minGames = 3
  for (const t of data.g.teamStats) t.belowMin = true
  delete data.w
  globalThis.fetch = async () => Response.json({ id, data, version: 3 })
  history.replaceState(null, '', `/s/${id}`)
  wrapper = mount(App); await flushPromises()
  assert.equal(wrapper.find('form').exists(), false)
  assert.match(wrapper.text(), /mot/)
  assert.doesNotMatch(wrapper.text(), /bara 2 match|Matcher per lag|Färre än önskat/)
  await wrapper.findAll('button').find(b => b.text().includes('Ladda ner PDF')).trigger('click')
  assert.doesNotMatch(wrapper.text(), /Ta med matcher per lag/)
  wrapper.unmount()
  history.replaceState(null, '', `/s/${id}#edit=${token}`)
  wrapper = mount(App); await flushPromises()
  assert.equal(wrapper.find('#club-name-0').element.value, 'A')
  assert.equal(wrapper.find('#min-games').element.value, '3')
})
test('invalid share links report an error and server failures keep generated games', async () => {
  history.replaceState(null, '', '/#s=invalid')
  wrapper = mount(App); await flushPromises()
  assert.match(wrapper.text(), /Schemalänken är ogiltig/)
  assert.equal(wrapper.find('form').exists(), false)
  wrapper.unmount(); history.replaceState(null, '', '/')
  globalThis.fetch = async () => Response.json({ error: 'Sparade scheman är inte tillgängliga just nu.' }, { status: 503 })
  wrapper = mount(App); await flushPromises()
  await wrapper.find('form').trigger('submit')
  await wrapper.findAll('button').find(b => b.text().includes('Spara & dela')).trigger('click')
  await flushPromises()
  assert.match(wrapper.text(), /inte tillgängliga/)
  assert(wrapper.findAll('table').length >= 2)
})
test('opening an edit fragment on the public page restores the editor without a full reload', async () => {
  const data = fixture(), id = 'a'.repeat(32), token = 'b'.repeat(64)
  globalThis.fetch = async () => Response.json({ id, data, version: 1 })
  history.replaceState(null, '', `/s/${id}`)
  wrapper = mount(App); await flushPromises()
  assert.equal(wrapper.find('form').exists(), false)
  history.replaceState(null, '', `/s/${id}#edit=${token}`)
  window.dispatchEvent(new window.HashChangeEvent('hashchange'))
  await flushPromises(); await nextTick()
  assert.equal(wrapper.find('#club-name-0').element.value, 'A')
  assert.equal(wrapper.find('#edit-link').element.value, `https://scheduler.test/s/${id}#edit=${token}`)
  assert.equal(window.location.href, `https://scheduler.test/s/${id}`)
})
test('a remembered edit token reopens the editor from the public link', async () => {
  const data = fixture(), id = 'a'.repeat(32), token = 'b'.repeat(64)
  globalThis.fetch = async () => Response.json({ id, data, version: 1 })
  localStorage.setItem(`game-scheduler-edit:${id}`, token)
  history.replaceState(null, '', `/s/${id}`)
  wrapper = mount(App); await flushPromises()
  assert.equal(wrapper.find('#club-name-0').element.value, 'A')
  assert.equal(wrapper.find('#edit-link').element.value, `https://scheduler.test/s/${id}#edit=${token}`)
})
test('local reload restores generated games and old valid links still open read-only', async () => {
  wrapper = mount(App); await flushPromises(); await wrapper.find('form').trigger('submit')
  const data = JSON.parse(localStorage.getItem('game-scheduler-result'))
  wrapper.unmount(); wrapper = mount(App); await flushPromises()
  assert(wrapper.findAll('table').length >= 2)
  const url = useShareUrl().generateShareUrl(data.c, data.s, data.g)
  wrapper.unmount(); history.replaceState(null, '', url)
  wrapper = mount(App); await flushPromises()
  assert.equal(wrapper.find('form').exists(), false)
  assert.equal(wrapper.findAll('table').length, 1, 'read-only links show the schedule but not the team table')
})

test('generation waits for pending saves so the visible schedule matches the saved snapshot', async () => {
  let resolveSave
  globalThis.fetch = async () => new Promise(resolve => { resolveSave = resolve })
  wrapper = mount(App); await flushPromises(); await wrapper.find('form').trigger('submit')
  const original = JSON.parse(localStorage.getItem('game-scheduler-result'))
  await wrapper.findAll('button').find(b => b.text().includes('Spara & dela')).trigger('click')
  await wrapper.find('#team-name-0-0').setValue('Changed during save')
  await wrapper.find('form').trigger('submit')
  assert.deepEqual(JSON.parse(localStorage.getItem('game-scheduler-result')), original)
  assert.equal(wrapper.find('button[type="submit"]').attributes('disabled'), '')
  resolveSave(Response.json({ id: 'a'.repeat(32), editToken: 'b'.repeat(64), version: 1 }))
  await flushPromises()
  assert(!wrapper.findAll('table').map(t => t.text()).join(' ').includes('Changed during save'))
})

test('out-of-order loads cannot overwrite the newer editor and failed navigation hides stale controls', async () => {
  const pending = [], id = 'a'.repeat(32), token = 'b'.repeat(64), data = fixture()
  globalThis.fetch = async () => new Promise(resolve => pending.push(resolve))
  history.replaceState(null, '', `/s/${id}`)
  wrapper = mount(App); await flushPromises()
  history.replaceState(null, '', `/s/${id}#edit=${token}`)
  window.dispatchEvent(new window.HashChangeEvent('hashchange')); await flushPromises()
  pending[1](Response.json({ id, data, version: 2 })); await flushPromises()
  assert(wrapper.find('form').exists())
  pending[0](Response.json({ id, data, version: 1 })); await flushPromises()
  assert(wrapper.find('form').exists())
  assert(wrapper.find('#edit-link').exists())
  history.replaceState(null, '', '/#s=invalid')
  window.dispatchEvent(new window.HashChangeEvent('hashchange')); await flushPromises()
  assert.equal(wrapper.findAll('table').length, 0)
  assert.equal(wrapper.findAll('button').filter(b => /Spara|Generera om/.test(b.text())).length, 0)
  assert.match(wrapper.text(), /Schemalänken är ogiltig/)
})

test('deleting needs confirmation and keeps the local generated draft', async () => {
  const data = fixture(), id = 'a'.repeat(32), token = 'b'.repeat(64), methods = []
  const confirm = window.confirm
  globalThis.fetch = async (url, options) => {
    methods.push(options?.method || 'GET')
    return options?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id, data, version: 1 })
  }
  history.replaceState(null, '', `/s/${id}#edit=${token}`)
  wrapper = mount(App); await flushPromises()
  assert.equal(window.location.href, `https://scheduler.test/s/${id}`)
  assert.equal(localStorage.getItem(`game-scheduler-edit:${id}`), token)
  const remove = () => wrapper.findAll('button').find(b => b.text().includes('Ta bort sparat schema'))
  try {
    window.confirm = () => false
    await remove().trigger('click'); assert.deepEqual(methods, ['GET'])
    window.confirm = () => true
    await remove().trigger('click'); await flushPromises()
    assert.deepEqual(methods, ['GET', 'DELETE'])
    assert.equal(wrapper.find('#edit-link').exists(), false)
    assert.equal(localStorage.getItem(`game-scheduler-edit:${id}`), null)
    assert(wrapper.findAll('table').length >= 2)
    assert.equal(JSON.parse(localStorage.getItem('game-scheduler-result')).g.teamStats.length, 4)
  } finally { window.confirm = confirm }
})
