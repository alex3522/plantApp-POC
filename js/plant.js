import { supabase } from './supabase.js'
import { initAuth, getUser, openModal } from './auth.js'

const plantId = new URLSearchParams(window.location.search).get('id')
let currentPlant = null

function stat(label, value, note) {
  return `
    <div class="care-stat">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      ${note ? `<div class="note">${note}</div>` : ''}
    </div>`
}

function render(plant) {
  currentPlant = plant
  document.title = `${plant.name} — plantApp`
  const { watering, feeding, light, environment } = plant.care

  document.getElementById('plant-content').innerHTML = `
    <div class="plant-hero">
      <div class="icon">${plant.icon}</div>
      <div class="plant-hero-info">
        <h1>${plant.name}</h1>
        <div class="species">${plant.species}</div>
      </div>
      <button class="add-btn" id="add-btn">Add to my plants</button>
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

    <div class="tip-box">
      <h2>Care tips</h2>
      <ul>${plant.tips.map(t => `<li>${t}</li>`).join('')}</ul>
    </div>`

  document.getElementById('add-btn').addEventListener('click', handleAddClick)
}

function renderError() {
  document.getElementById('plant-content').innerHTML = `
    <div class="error-state">
      <h2>Plant not found</h2>
      <p>We don't have a guide for that plant yet.</p>
    </div>`
}

async function handleAddClick() {
  const user = await getUser()
  if (!user) { openModal(); return }
  showNamingForm(user)
}

async function showNamingForm(user) {
  const { count } = await supabase
    .from('user_plants')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('plant_id', plantId)

  const defaultName = count === 0
    ? currentPlant.name
    : `${currentPlant.name} ${count + 1}`

  document.getElementById('add-btn').outerHTML = `
    <div class="name-form" id="name-form">
      <input type="text" id="plant-name-input" value="${defaultName}" maxlength="40" />
      <button id="name-save" class="name-save-btn">Save</button>
      <button id="name-cancel" class="name-cancel-btn">Cancel</button>
    </div>`

  const input = document.getElementById('plant-name-input')
  input.focus()
  input.select()

  document.getElementById('name-save').addEventListener('click', () =>
    saveWithName(user, input.value.trim() || defaultName))
  document.getElementById('name-cancel').addEventListener('click', restoreAddBtn)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveWithName(user, input.value.trim() || defaultName)
    if (e.key === 'Escape') restoreAddBtn()
  })
}

function restoreAddBtn() {
  document.getElementById('name-form').outerHTML =
    `<button class="add-btn" id="add-btn">Add to my plants</button>`
  document.getElementById('add-btn').addEventListener('click', handleAddClick)
}

async function saveWithName(user, name) {
  const saveBtn = document.getElementById('name-save')
  if (saveBtn) saveBtn.disabled = true

  const { data: userPlant, error } = await supabase
    .from('user_plants')
    .insert({ user_id: user.id, plant_id: plantId, nickname: name })
    .select()
    .single()

  if (error) {
    if (saveBtn) saveBtn.disabled = false
    console.error(error)
    return
  }

  const today = new Date().toISOString().split('T')[0]
  await supabase.from('care_schedule').insert([
    { user_plant_id: userPlant.id, user_id: user.id, care_type: 'water', next_due: today, frequency_days: 10 },
    { user_plant_id: userPlant.id, user_id: user.id, care_type: 'feed',  next_due: today, frequency_days: 30 }
  ])

  document.getElementById('name-form').outerHTML =
    `<button class="add-btn added" id="add-btn" disabled>${name} added ✓</button>`
}

fetch('data/plants.json')
  .then(r => r.json())
  .then(({ plants }) => {
    const plant = plants.find(p => p.id === plantId)
    plant ? render(plant) : renderError()
  })
  .catch(renderError)

initAuth(() => {})
