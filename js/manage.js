import { supabase } from './supabase.js'
import { initAuth } from './auth.js'

let plantDataCache = null
let currentUser = null

async function getPlantData() {
  if (plantDataCache) return plantDataCache
  const res = await fetch('data/plants.json')
  const { plants } = await res.json()
  plantDataCache = Object.fromEntries(plants.map(p => [p.id, p]))
  return plantDataCache
}

async function load(user) {
  const container = document.getElementById('manage-list')

  if (!user) {
    container.innerHTML = `<p class="manage-empty">Sign in to manage your plants.</p>`
    return
  }

  const [{ data: userPlants, error }, plantData] = await Promise.all([
    supabase.from('user_plants').select('*').order('added_at', { ascending: true }),
    getPlantData()
  ])

  if (error) { console.error(error); return }

  if (!userPlants.length) {
    container.innerHTML = `<p class="manage-empty">No plants yet — add one from the <a href="index.html">home page</a>.</p>`
    return
  }

  container.innerHTML = userPlants.map(up => {
    const plant = plantData[up.plant_id]
    if (!plant) return ''
    return renderCard(up, plant)
  }).join('')
}

function fieldSpan(field, id, value, placeholder, extraClass = '') {
  const isEmpty = !value
  return `<span class="manage-field${isEmpty ? ' is-empty' : ''}${extraClass ? ' ' + extraClass : ''}"
    data-field="${field}"
    data-id="${id}"
    data-value="${value || ''}"
    data-placeholder="${placeholder}">${isEmpty ? placeholder : value}</span>`
}

function renderCard(up, plant) {
  return `
    <div class="manage-card" data-id="${up.id}">
      <div class="manage-card-header">
        <div class="manage-plant-icon">${plant.icon}</div>
        <div class="manage-plant-meta">
          ${fieldSpan('nickname', up.id, up.nickname, 'Add a name…', 'manage-name-field')}
          <div class="manage-plant-type">${plant.name} &middot; <em>${plant.species}</em></div>
        </div>
        <a href="myplant.html?id=${up.id}" class="manage-view-link">View →</a>
        <button class="manage-remove-btn" data-id="${up.id}" title="Remove plant">×</button>
      </div>
      <div class="manage-fields">
        <div class="manage-field-row">
          <span class="manage-field-label">Location</span>
          ${fieldSpan('location', up.id, up.location, 'e.g. Kitchen windowsill')}
        </div>
        <div class="manage-field-row">
          <span class="manage-field-label">Room</span>
          ${fieldSpan('room', up.id, up.room, 'e.g. Living room')}
        </div>
      </div>
    </div>`
}

function makeSpan(field, id, value, placeholder, extraClass = '') {
  const el = document.createElement('span')
  const isEmpty = !value
  el.className = `manage-field${isEmpty ? ' is-empty' : ''}${extraClass ? ' ' + extraClass : ''}`
  el.dataset.field = field
  el.dataset.id = id
  el.dataset.value = value || ''
  el.dataset.placeholder = placeholder
  el.textContent = isEmpty ? placeholder : value
  return el
}

function startEditing(span) {
  const originalValue = span.dataset.value
  const placeholder = span.dataset.placeholder
  const field = span.dataset.field
  const id = span.dataset.id
  const isNameField = span.classList.contains('manage-name-field')

  const input = document.createElement('input')
  input.type = 'text'
  input.value = originalValue
  input.placeholder = placeholder
  input.className = 'manage-field-input' + (isNameField ? ' manage-name-input' : '')
  input.maxLength = 80

  span.replaceWith(input)
  input.focus()
  input.select()

  let escapePressed = false

  async function finish(save) {
    const newValue = input.value.trim()
    const extraClass = isNameField ? 'manage-name-field' : ''
    const newSpan = makeSpan(field, id, newValue, placeholder, extraClass)
    input.replaceWith(newSpan)

    if (save && newValue !== originalValue) {
      await supabase
        .from('user_plants')
        .update({ [field]: newValue || null })
        .eq('id', id)

      newSpan.classList.add('just-saved')
      setTimeout(() => newSpan.classList.remove('just-saved'), 800)
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur()
    if (e.key === 'Escape') { escapePressed = true; input.blur() }
  })

  input.addEventListener('blur', () => finish(!escapePressed))
}

// Event delegation — inline field editing
document.addEventListener('click', e => {
  const field = e.target.closest('.manage-field')
  if (field) { startEditing(field); return }
})

// Event delegation — remove button
document.addEventListener('click', async e => {
  const btn = e.target.closest('.manage-remove-btn')
  if (!btn) return
  e.stopPropagation()

  if (btn.dataset.confirming) {
    const id = btn.dataset.id
    await supabase.from('user_plants').delete().eq('id', id)
    document.querySelector(`.manage-card[data-id="${id}"]`)?.remove()

    if (!document.querySelector('.manage-card')) {
      document.getElementById('manage-list').innerHTML =
        `<p class="manage-empty">No plants yet — add one from the <a href="index.html">home page</a>.</p>`
    }
  } else {
    btn.dataset.confirming = 'true'
    btn.textContent = 'Remove?'
    btn.classList.add('confirming')
    setTimeout(() => {
      if (btn.isConnected) {
        btn.textContent = '×'
        btn.classList.remove('confirming')
        delete btn.dataset.confirming
      }
    }, 2500)
  }
})

initAuth(user => {
  currentUser = user
  load(user)
})
