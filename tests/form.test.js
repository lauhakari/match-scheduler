import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { component } from './helpers/vue.js'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://scheduler.test/' })
for (const key of ['window', 'document', 'localStorage', 'history', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Document', 'ShadowRoot']) globalThis[key] = dom.window[key]
Element.prototype.scrollIntoView = () => {}
const { mount, flushPromises } = await import('@vue/test-utils')
const { nextTick } = await import('vue')
const SetupForm = await component('src/components/SetupForm.vue')
let wrapper, originalFetch
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); originalFetch = globalThis.fetch })
afterEach(() => { wrapper?.unmount(); wrapper = null; globalThis.fetch = originalFetch })

test('form edits after generation leave export and pause snapshots intact', async () => {
  wrapper = mount(SetupForm)
  await wrapper.find('form').trigger('submit')
  const data = wrapper.emitted('generate')[0][0]
  await wrapper.find('#team-name-0-0').setValue('Renamed')
  const addPause = wrapper.findAll('button').find(b => b.text().includes('Lägg till uppehåll'))
  await addPause.trigger('click')
  assert.equal(data.clubs[0].teams[0].name, 'Lag 1')
  assert.equal(data.settings.pauses.length, 0)
})
test('form validation shows errors and does not emit invalid data', async () => {
  wrapper = mount(SetupForm)
  await wrapper.find('#match-length').setValue(0)
  await wrapper.find('#break-length').setValue(0)
  await wrapper.find('form').trigger('submit')
  assert.equal(wrapper.emitted('generate'), undefined)
  assert.match(wrapper.text(), /Matchlängd måste/)
})
test('adding a team after deletion chooses an unused name', async () => {
  wrapper = mount(SetupForm)
  const add = () => wrapper.findAll('button').find(b => b.text().includes('Lägg till lag'))
  await add().trigger('click')
  await wrapper.find('button[aria-label="Ta bort Lag 2"]').trigger('click')
  await add().trigger('click')
  const names = wrapper.findAll('input[name^="team-name-0-"]').map(e => e.element.value)
  assert.equal(new Set(names).size, 3)
})
test('keyboard ordering moves clubs and malformed drafts fall back safely', async () => {
  localStorage.setItem('game-scheduler-state', JSON.stringify({ clubs: {}, settings: {} }))
  wrapper = mount(SetupForm)
  assert.match(wrapper.text(), /kunde inte läsas/)
  const button = wrapper.findAll('button').find(b => b.attributes('aria-label')?.includes('Klubb B') && b.attributes('aria-label')?.includes('upp'))
  assert(button)
  await button.trigger('click')
  assert.equal(wrapper.find('#club-name-0').element.value, 'Klubb B')
})
test('pasting a team list adds clubs through normal validation and templates fill the day', async () => {
  wrapper = mount(SetupForm)
  await wrapper.findAll('button').find(b => b.text().includes('Klistra in')).trigger('click')
  await wrapper.find('#import-text').setValue('Hammarby: Vit, Grön\nAIK\nKlubb A: Lag 3')
  await wrapper.findAll('button').find(b => b.text().includes('Lägg till i listan')).trigger('click')
  const names = wrapper.findAll('input[name^="club-name-"]').map(e => e.element.value)
  assert.deepEqual(names, ['Klubb A', 'Klubb B', 'Hammarby', 'AIK'])
  assert.equal(wrapper.findAll('input[name^="team-name-0-"]').length, 3)
  assert.equal(wrapper.findAll('input[name^="team-name-2-"]').length, 2)
  await wrapper.find('form').trigger('submit')
  const data = wrapper.emitted('generate')[0][0]
  assert.equal(data.clubs.length, 4)
  assert.ok(data.clubs.every(c => c.id && c.teams.every(t => t.id)))
  wrapper.unmount(); localStorage.clear()
  wrapper = mount(SetupForm)
  await wrapper.findAll('button').find(b => b.text().includes('Poolspel')).trigger('click')
  assert.equal(wrapper.find('#num-rinks').element.value, '2')
  assert.equal(wrapper.findAll('input[name^="club-name-"]').length, 4)
  assert.match(wrapper.text(), /Dagen rymmer \d+ omgångar/)
})

test('validation messages open the step that owns the field', async () => {
  wrapper = mount(SetupForm)
  await wrapper.find('#min-games').setValue('9')
  await wrapper.find('#end-time').setValue('08:00')
  await wrapper.find('form').trigger('submit')
  assert.equal(wrapper.emitted('generate'), undefined)
  const current = () => wrapper.find('.step-tab.is-current').text()
  assert.match(current(), /Speldag/)
  await wrapper.find('#end-time').setValue('17:00')
  await wrapper.find('form').trigger('submit')
  assert.match(current(), /Matcher/)
  await wrapper.find('#max-games').setValue('9')
  await wrapper.find('#min-games').setValue('2')
  await wrapper.find('#max-games').setValue('5')
  await wrapper.find('#club-name-1').setValue('Klubb A')
  await wrapper.find('form').trigger('submit')
  assert.match(current(), /Lag/)
})

test('a meal keeps room for the biggest club and panel fixes patch the settings', async () => {
  wrapper = mount(SetupForm)
  await wrapper.findAll('button').find(b => b.text().includes('Lägg till matpaus')).trigger('click')
  const capacity = () => wrapper.find('input[name^="fb-max-"]').element.value
  assert.equal(capacity(), '6')
  for (let i = 0; i < 6; i++) await wrapper.findAll('button').find(b => b.text().includes('Lägg till lag')).trigger('click')
  assert.equal(capacity(), '8')
  await wrapper.find('#min-games').setValue('12')
  const fix = wrapper.findAll('button.btn-fix').find(b => /^Sätt minst \d+$/.test(b.text()))
  assert.ok(fix, 'offers a fix for an unreachable minimum')
  await fix.trigger('click')
  assert.ok(Number(wrapper.find('#min-games').element.value) < 12)
  assert.match(wrapper.text(), /Dagen går ihop/)
})
