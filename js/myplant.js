import { supabase } from './supabase.js'
import { initAuth } from './auth.js'

const userPlantId = new URLSearchParams(window.location.search).get('id')

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const CARE_ICONS = { water: '💧', feed: '🌿', repot: '🪴', mist: '💦', prune: '✂️' }

function stat(label, value, note) {
  return `
    <div class="care-stat">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      ${note ? `<div class="note">${note}</div>` : ''}
    </div>`
}

function editableSpan(field, id, value, placeholder, extraClass = '') {
  const isEmpty = !value
  return `<span class="myplant-field${isEmpty ? ' is-empty' : ''}${extraClass ? ' ' + extraClass : ''}"
    data-field="${field}"
    data-id="${id}"
    data-value="${value || ''}"
    data-placeholder="${placeholder}">${isEmpty ? placeholder : value}</span>`
}

async function load(user) {
  const content = document.getElementById('plant-page-content')

  if (!user) {
    content.innerHTML = `<div class="error-state"><h2>Sign in to view your plants</h2></div>`
    return
  }

  const [
    { data: userPlant, error: upError },
    { plants },
    { data: schedule }
  ] = await Promise.all([
    supabase.from('user_plants').select('*').eq('id', userPlantId).single(),
    fetch('data/plants.json').then(r => r.json()),
    supabase.from('care_schedule').select('*').eq('user_plant_id', userPlantId)
  ])

  if (upError || !userPlant) {
    content.innerHTML = `<div class="error-state"><h2>Plant not found</h2></div>`
    return
  }

  const plantData = Object.fromEntries(plants.map(p => [p.id, p]))
  const plant = plantData[userPlant.plant_id]

  if (!plant) {
    content.innerHTML = `<div class="error-state"><h2>Plant type not found</h2></div>`
    return
  }

  render(userPlant, plant, schedule || [])
}

function render(up, plant, schedule) {
  const displayName = up.nickname || plant.name
  document.title = `${displayName} — plantApp`

  const { watering, feeding, light, environment } = plant.care

  document.getElementById('plant-page-content').innerHTML = `
    <div class="plant-hero">
      <div class="icon">${plant.icon}</div>
      <div class="plant-hero-info">
        <h1>${editableSpan('nickname', up.id, up.nickname, plant.name, 'myplant-name-field')}</h1>
        <div class="species">${plant.name} · <em>${plant.species}</em></div>
        <div class="myplant-meta">
          <div class="myplant-meta-row">
            <span class="meta-icon">📍</span>
            ${editableSpan('location', up.id, up.location, 'Add location…')}
          </div>
          <div class="myplant-meta-row">
            <span class="meta-icon">🏠</span>
            ${editableSpan('room', up.id, up.room, 'Add room…')}
          </div>
          <div class="myplant-meta-row">
            <span class="meta-icon">☀️</span>
            ${editableSpan('sun_exposure', up.id, up.sun_exposure, 'Add sun exposure…')}
          </div>
        </div>
      </div>
    </div>

    <div class="care-grid">
      <div class="care-card">
        <div class="care-card-header"><div class="icon">💧</div><h2>Watering</h2></div>
        ${stat('Frequency', watering.frequency, watering.frequencyNote)}
        ${stat('Amount', watering.amount)}
        ${stat('Seasonal adjustment', watering.seasonal, watering.seasonalNote)}
      </div>
      <div class="care-card">
        <div class="care-card-header"><div class="icon">🌿</div><h2>Feeding</h2></div>
        ${stat('Frequency', feeding.frequency, feeding.frequencyNote)}
        ${stat('Fertiliser', feeding.fertiliser)}
        ${stat('Winter', feeding.winter, feeding.winterNote)}
      </div>
      <div class="care-card">
        <div class="care-card-header"><div class="icon">☀️</div><h2>Light</h2></div>
        ${stat('Ideal', light.ideal)}
        ${stat('Placement', light.placement, light.placementNote)}
        ${stat('Avoid', light.avoid, light.avoidNote)}
      </div>
      <div class="care-card">
        <div class="care-card-header"><div class="icon">🌡️</div><h2>Temperature & Humidity</h2></div>
        ${stat('Temperature', environment.temperature, environment.temperatureNote)}
        ${stat('Humidity', environment.humidity, environment.humidityNote)}
      </div>
    </div>

    <div class="section-header" style="margin-bottom:1rem">
      <h2>Care this month</h2>
    </div>
    ${renderMiniCalendar(schedule)}

    <div class="tip-box">
      <h2>Care tips</h2>
      <ul>${plant.tips.map(t => `<li>${t}</li>`).join('')}</ul>
    </div>`
}

// --- Inline editing ---

function makeSpan(field, id, value, placeholder, extraClass = '') {
  const el = document.createElement('span')
  const isEmpty = !value
  el.className = `myplant-field${isEmpty ? ' is-empty' : ''}${extraClass ? ' ' + extraClass : ''}`
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
  const isName = span.classList.contains('myplant-name-field')

  const input = document.createElement('input')
  input.type = 'text'
  input.value = originalValue
  input.placeholder = placeholder
  input.className = 'myplant-field-input' + (isName ? ' myplant-name-input' : '')
  input.maxLength = 80

  span.replaceWith(input)
  input.focus()
  input.select()

  let escapePressed = false

  async function finish(save) {
    const newValue = input.value.trim()
    const extraClass = isName ? 'myplant-name-field' : ''
    const newSpan = makeSpan(field, id, newValue, placeholder, extraClass)
    input.replaceWith(newSpan)

    if (save && newValue !== originalValue) {
      await supabase
        .from('user_plants')
        .update({ [field]: newValue || null })
        .eq('id', id)

      if (field === 'nickname') {
        document.title = `${newValue || placeholder} — plantApp`
      }

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

document.addEventListener('click', e => {
  const field = e.target.closest('.myplant-field')
  if (field) startEditing(field)
})

// --- Mini calendar ---

function getOccurrencesInMonth(nextDue, frequencyDays, year, month) {
  const monthStart = new Date(year, month, 1)
  const monthEnd  = new Date(year, month + 1, 0)
  let current = new Date(nextDue + 'T12:00:00')
  if (current > monthEnd) return []
  while (current < monthStart) {
    current = new Date(current.getTime() + frequencyDays * 86400000)
  }
  const days = []
  while (current <= monthEnd) {
    days.push(current.getDate())
    current = new Date(current.getTime() + frequencyDays * 86400000)
  }
  return days
}

function renderMiniCalendar(schedule) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7
  const todayNum = now.getDate()

  const byDay = {}
  for (const entry of schedule) {
    const days = getOccurrencesInMonth(entry.next_due, entry.frequency_days, year, month)
    for (const d of days) {
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(CARE_ICONS[entry.care_type] ?? '📋')
    }
  }

  const cells = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return `
    <div class="mini-cal">
      <div class="mini-cal-grid">
        ${DAY_LABELS.map(d => `<div class="mini-cal-label">${d}</div>`).join('')}
        ${cells.map(d => {
          if (!d) return `<div class="mini-cal-day empty"></div>`
          const icons = byDay[d] || []
          const isToday = d === todayNum
          return `
            <div class="mini-cal-day${isToday ? ' today' : ''}">
              <div class="mini-cal-num">${d}</div>
              ${icons.length ? `<div class="mini-cal-icons">${icons.join('')}</div>` : ''}
            </div>`
        }).join('')}
      </div>
    </div>`
}

initAuth(load)
