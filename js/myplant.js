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

  currentUserPlant = userPlant
  render(userPlant, plant, schedule || [])
  if (userPlant.lat && userPlant.lng) loadLocationName(userPlant.lat, userPlant.lng)
  if (userPlant.lat && userPlant.window_facing) calculateSunExposure(userPlant)
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

    ${renderProfile(up)}

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
  if (e.target.closest('#profile-edit-btn')) {
    const card = document.querySelector('.profile-card')
    const btn = document.getElementById('profile-edit-btn')
    const editing = card.classList.toggle('editing')
    btn.textContent = editing ? 'Done' : 'Edit'
    return
  }
  const locationBtn = e.target.closest('.location-btn')
  if (locationBtn) { handleLocationBtn(locationBtn.dataset.id); return }
  const field = e.target.closest('.myplant-field')
  if (field) startEditing(field)
})

document.addEventListener('change', async e => {
  const el = e.target.closest('.profile-select') || e.target.closest('.profile-month-input')
  if (!el) return
  const { field, id } = el.dataset
  const raw = el.value || null
  const dbValue = field === 'last_repotted' && raw ? raw + '-01' : raw

  await supabase.from('user_plants').update({ [field]: dbValue }).eq('id', id)
  if (currentUserPlant) currentUserPlant[field] = dbValue

  const viewVal = el.closest('.profile-row')?.querySelector('.view-val')
  if (viewVal) viewVal.textContent = field === 'last_repotted' ? formatMonth(dbValue) : (raw || '—')

  el.classList.add('just-saved')
  setTimeout(() => el.classList.remove('just-saved'), 800)

  if (field === 'window_facing' || field === 'light_obstruction') calculateSunExposure(currentUserPlant)
})

// --- Plant profile ---

let currentUserPlant = null

const SOIL_TYPES = [
  'Standard potting mix',
  'Cactus & succulent mix',
  'Orchid bark mix',
  'Peat-based mix',
  'Loam-based mix',
  'Seed & cutting compost',
  'Ericaceous (acid) compost',
  'Aquatic compost',
]

const AGE_OPTIONS = [
  '< 1 year', '1 year', '2 years', '3 years', '4 years', '5 years',
  '6 years', '7 years', '8 years', '9 years', '10+ years',
]

const HEALTH_OPTIONS = [
  'Great', 'Good', 'Wilting', 'Curling leaves', 'Yellowing leaves',
  'Brown tips', 'Dropping leaves', 'Root bound', 'Overwatered',
  'Underwatered', 'Pest damage',
]

const POT_SIZES = ['Small (< 15cm)', 'Medium (15–25cm)', 'Large (25–35cm)', 'Extra large (35cm+)']

const POT_MATERIALS = ['Plastic', 'Terracotta', 'Ceramic', 'Fabric', 'Metal', 'Wood']

const DISTANCE_TO_WINDOW_OPTIONS = ['Touching / next to', '1m', '2m', '3m', '4m', '5m', '5m+']

const WINDOW_FACING_OPTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const OBSTRUCTION_OPTIONS = ['None', 'Light', 'Moderate', 'Heavy']

function formatMonth(val) {
  if (!val) return '—'
  const [year, month] = val.split('-')
  return new Date(parseInt(year), parseInt(month) - 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const WINDOW_FRACTIONS = { N: 0.05, NE: 0.20, E: 0.40, SE: 0.65, S: 0.90, SW: 0.65, W: 0.40, NW: 0.20 }

const OBSTRUCTION_MULTIPLIERS = { None: 1.0, Light: 0.65, Moderate: 0.35, Heavy: 0.10 }

function profileSelect(field, id, options, current, placeholder, extraClass = '') {
  const opts = options.map(o =>
    `<option value="${o}"${current === o ? ' selected' : ''}>${o}</option>`
  ).join('')
  return `<select class="profile-select edit-input${extraClass ? ' ' + extraClass : ''}" data-field="${field}" data-id="${id}">
    <option value="">${placeholder}</option>
    ${opts}
  </select>`
}

function profileRow(label, viewVal, editInput) {
  return `
    <div class="profile-row">
      <span class="profile-label">${label}</span>
      <div class="profile-value-wrap">
        <span class="view-val">${viewVal}</span>
        ${editInput}
      </div>
    </div>`
}

function renderProfile(up) {
  const hasLocation = up.lat && up.lng
  return `
    <div class="section-header" style="margin-bottom:1rem">
      <h2>Plant profile</h2>
      <button class="profile-edit-btn" id="profile-edit-btn">Edit</button>
    </div>
    <div class="profile-card">
      <div class="profile-row">
        <span class="profile-label">Location</span>
        <div class="profile-value-wrap">
          <span class="location-display" id="location-display">${hasLocation ? '📍 Loading…' : '—'}</span>
          <button class="edit-input location-btn" id="location-btn" data-id="${up.id}">${hasLocation ? 'Update location' : '📍 Use my location'}</button>
        </div>
      </div>
      ${profileRow('Soil type',   up.soil_type    || '—', profileSelect('soil_type',        up.id, SOIL_TYPES,            up.soil_type,        'Select soil type…'))}
      ${profileRow('Age',         up.age          || '—', profileSelect('age',               up.id, AGE_OPTIONS,           up.age,              'Select age…'))}
      ${profileRow('Health',      up.health       || '—', profileSelect('health',            up.id, HEALTH_OPTIONS,        up.health,           'Select health…'))}
      ${profileRow('Pot size',    up.pot_size     || '—', profileSelect('pot_size',          up.id, POT_SIZES,             up.pot_size,         'Select pot size…'))}
      ${profileRow('Pot material',up.pot_material || '—', profileSelect('pot_material',      up.id, POT_MATERIALS,         up.pot_material,     'Select material…'))}
      ${profileRow('Last repotted', formatMonth(up.last_repotted),
        `<input class="edit-input profile-month-input" type="month" data-field="last_repotted" data-id="${up.id}" value="${up.last_repotted ? up.last_repotted.slice(0, 7) : ''}" />`)}
      ${profileRow('Distance to window', up.distance_to_window || '—', profileSelect('distance_to_window', up.id, DISTANCE_TO_WINDOW_OPTIONS, up.distance_to_window, 'Select distance…'))}
      ${profileRow('Window faces',up.window_facing     || '—', profileSelect('window_facing',     up.id, WINDOW_FACING_OPTIONS,  up.window_facing,    'Select direction…'))}
      ${profileRow('Obstruction', up.light_obstruction || '—', profileSelect('light_obstruction', up.id, OBSTRUCTION_OPTIONS,    up.light_obstruction,'Select obstruction…'))}
      <div class="profile-row" id="sun-row" style="${hasLocation && up.window_facing ? '' : 'display:none'}">
        <span class="profile-label">Est. sunlight</span>
        <div class="profile-value-wrap">
          <span class="sun-display" id="sun-display">Calculating…</span>
        </div>
      </div>
    </div>`
}

async function loadLocationName(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
    const data = await res.json()
    const a = data.address
    const place = [a.suburb || a.city_district || a.town || a.village, a.city || a.county, a.country]
      .filter(Boolean).slice(0, 2).join(', ')
    const el = document.getElementById('location-display')
    if (el) el.textContent = '📍 ' + (place || `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`)
  } catch {
    const el = document.getElementById('location-display')
    if (el) el.textContent = `📍 ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`
  }
}

async function handleLocationBtn(id) {
  const btn = document.getElementById('location-btn')
  const display = document.getElementById('location-display')

  if (!navigator.geolocation) {
    display.textContent = 'Geolocation not supported by this browser'
    return
  }

  btn.disabled = true
  btn.textContent = 'Detecting…'

  navigator.geolocation.getCurrentPosition(
    async position => {
      const { latitude: lat, longitude: lng } = position.coords
      await supabase.from('user_plants').update({ lat, lng }).eq('id', id)
      btn.textContent = 'Update location'
      btn.disabled = false
      loadLocationName(lat, lng)
    },
    () => {
      btn.textContent = 'Update location'
      btn.disabled = false
      display.textContent = 'Location access denied'
    }
  )
}

async function calculateSunExposure(up) {
  const row = document.getElementById('sun-row')
  const display = document.getElementById('sun-display')
  if (!row || !display || !up.lat || !up.window_facing) return

  row.style.display = ''
  display.textContent = 'Calculating…'

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${up.lat}&longitude=${up.lng}&daily=sunshine_duration&timezone=auto&forecast_days=1`
    )
    const data = await res.json()
    const sunshineHours = data.daily.sunshine_duration[0] / 3600

    const fractions = { ...WINDOW_FRACTIONS }
    if (up.lat < 0) {
      fractions.N = WINDOW_FRACTIONS.S; fractions.S = WINDOW_FRACTIONS.N
      fractions.NE = WINDOW_FRACTIONS.SE; fractions.SE = WINDOW_FRACTIONS.NE
      fractions.NW = WINDOW_FRACTIONS.SW; fractions.SW = WINDOW_FRACTIONS.NW
    }

    const fraction = fractions[up.window_facing] ?? 0.5
    const multiplier = OBSTRUCTION_MULTIPLIERS[up.light_obstruction] ?? 1.0
    const hours = sunshineHours * fraction * multiplier

    const category =
      hours < 1 ? 'Low light' :
      hours < 3 ? 'Medium-low light' :
      hours < 5 ? 'Medium light' :
      hours < 7 ? 'Bright indirect' : 'Bright direct'

    display.textContent = `☀️ ~${hours.toFixed(1)}h today · ${category}`
  } catch {
    display.textContent = 'Unable to calculate'
  }
}

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
