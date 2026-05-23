import { supabase } from './supabase.js'
import { initAuth, getUser, openModal } from './auth.js'

let currentUser = null
let plants = []

async function load() {
  const { plants: all } = await fetch('data/plants.json').then(r => r.json())
  plants = [...all].sort((a, b) => a.name.localeCompare(b.name))
  render()
}

function render() {
  document.getElementById('browse-grid').innerHTML = plants.map(p => `
    <div class="browse-card">
      <a href="plant.html?id=${p.id}" class="browse-card-link">
        <div class="browse-card-icon">${p.icon}</div>
        <div class="browse-card-name">${p.name}</div>
        <div class="browse-card-species">${p.species}</div>
      </a>
      <div class="browse-card-action" id="action-${p.id}">
        <button class="browse-add-btn" data-plant-id="${p.id}">+ Add to my plants</button>
      </div>
    </div>`).join('')
}

async function handleAdd(plantId) {
  const user = currentUser || await getUser()
  if (!user) { openModal(); return }

  const plant = plants.find(p => p.id === plantId)
  const actionEl = document.getElementById(`action-${plantId}`)

  const { count } = await supabase
    .from('user_plants')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('plant_id', plantId)

  const defaultName = count === 0 ? plant.name : `${plant.name} ${count + 1}`

  actionEl.innerHTML = `
    <div class="browse-name-form" id="name-form-${plantId}">
      <input class="browse-name-input" type="text" value="${defaultName}" maxlength="40" />
      <div class="browse-name-btns">
        <button class="browse-save-btn" data-plant-id="${plantId}">Save</button>
        <button class="browse-cancel-btn" data-plant-id="${plantId}">Cancel</button>
      </div>
    </div>`

  const input = actionEl.querySelector('input')
  input.focus()
  input.select()
}

async function handleSave(plantId) {
  const user = currentUser || await getUser()
  const actionEl = document.getElementById(`action-${plantId}`)
  const input = actionEl.querySelector('input')
  const name = input.value.trim() || plants.find(p => p.id === plantId)?.name
  const saveBtn = actionEl.querySelector('.browse-save-btn')

  saveBtn.disabled = true

  const { data: userPlant, error } = await supabase
    .from('user_plants')
    .insert({ user_id: user.id, plant_id: plantId, nickname: name })
    .select()
    .single()

  if (error) { saveBtn.disabled = false; console.error(error); return }

  const today = new Date().toISOString().split('T')[0]
  await supabase.from('care_schedule').insert([
    { user_plant_id: userPlant.id, user_id: user.id, care_type: 'water', next_due: today, frequency_days: 10 },
    { user_plant_id: userPlant.id, user_id: user.id, care_type: 'feed',  next_due: today, frequency_days: 30 }
  ])

  actionEl.innerHTML = `<span class="browse-added">${name} added ✓</span>`
}

function handleCancel(plantId) {
  document.getElementById(`action-${plantId}`).innerHTML =
    `<button class="browse-add-btn" data-plant-id="${plantId}">+ Add to my plants</button>`
}

document.addEventListener('click', async e => {
  const addBtn    = e.target.closest('.browse-add-btn')
  const saveBtn   = e.target.closest('.browse-save-btn')
  const cancelBtn = e.target.closest('.browse-cancel-btn')

  if (addBtn)    { await handleAdd(addBtn.dataset.plantId); return }
  if (saveBtn)   { await handleSave(saveBtn.dataset.plantId); return }
  if (cancelBtn) { handleCancel(cancelBtn.dataset.plantId); return }
})

document.addEventListener('keydown', async e => {
  if (!e.target.classList.contains('browse-name-input')) return
  const form = e.target.closest('[id^="name-form-"]')
  if (!form) return
  const plantId = form.id.replace('name-form-', '')
  if (e.key === 'Enter')  await handleSave(plantId)
  if (e.key === 'Escape') handleCancel(plantId)
})

initAuth(user => { currentUser = user })

load()
