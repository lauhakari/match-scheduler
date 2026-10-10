import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { component } from './helpers/vue.js'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://scheduler.test/' })
for (const key of ['window', 'document', 'localStorage', 'history', 'Element', 'HTMLElement', 'SVGElement', 'Node']) globalThis[key] = dom.window[key]
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
  await wrapper.find('[aria-controls="advanced-settings-panel"]').trigger('click')
  const addPause = wrapper.findAll('button').find(b => b.text().includes('Lägg till paus'))
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
