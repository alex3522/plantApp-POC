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

async function loadUserPlants(user) {
  const grid = document.getElementById('plants-grid')
  if (!grid) return

  if (!user) {
    window.__userPlants = null
    grid.innerHTML = `
      <div class="plant-card add-card">
        <div class="add-icon">＋</div>
        <span>Sign in to add plants</span>
      </div>`
    return
  }

  const [{ data: userPlants, error }, plantData] = await Promise.all([
    supabase.from('user_plants').select('*').order('added_at', { ascending: false }),
    getPlantData()
  ])

  if (error) { console.error(error); return }

  window.__userPlants = userPlants
    .filter(up => up.nickname && plantData[up.plant_id])
    .map(up => {
      const plant = plantData[up.plant_id]
      return { id: up.id, nickname: up.nickname, icon: plant.icon, plantName: plant.name }
    })

  if (!userPlants.length) {
    grid.innerHTML = `
      <div class="plants-empty">No plants yet — search for one to get started.</div>
      <div class="plant-card add-card">
        <div class="add-icon">＋</div>
        <span>Add a plant</span>
      </div>`
    return
  }

  const cards = userPlants.map(up => {
    const plant = plantData[up.plant_id]
    if (!plant) return ''
    const displayName = up.nickname || plant.name
    const subText = up.nickname ? plant.name : plant.species
    return `
      <a href="myplant.html?id=${up.id}" class="plant-card">
        <button class="plant-remove-btn" data-id="${up.id}" title="Remove plant">×</button>
        <div class="plant-icon">${plant.icon}</div>
        <h3>${displayName}</h3>
        <div class="species">${subText}</div>
        <div class="care-tags"><span class="tag">View care guide</span></div>
      </a>`
  }).join('')

  grid.innerHTML = cards + `
    <div class="plant-card add-card">
      <div class="add-icon">＋</div>
      <span>Add a plant</span>
    </div>`
}

async function loadUpcomingCare(user) {
  const tasksList = document.getElementById('tasks-list')
  if (!tasksList || !user) return

  const [{ data, error }, plantData] = await Promise.all([
    supabase
      .from('care_schedule')
      .select('*, user_plants(plant_id, nickname)')
      .order('next_due', { ascending: true })
      .limit(5),
    getPlantData()
  ])

  if (error || !data?.length) return

  const icons = { water: '💧', feed: '🌿', repot: '🪴', mist: '💦', prune: '✂️' }
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  tasksList.innerHTML = data.map(task => {
    const plant = plantData[task.user_plants.plant_id]
    const name = task.user_plants.nickname || plant?.name || task.user_plants.plant_id
    const careLabel = task.care_type.charAt(0).toUpperCase() + task.care_type.slice(1)
    const plantIcon = plant?.icon ?? '🪴'

    let dueLabel, soon = false
    if (task.next_due <= today) { dueLabel = 'Today'; soon = true }
    else if (task.next_due === tomorrow) { dueLabel = 'Tomorrow' }
    else {
      const days = Math.round((new Date(task.next_due) - new Date()) / 86400000)
      dueLabel = `In ${days} days`
    }

    return `
      <div class="task-item" data-type="${task.care_type}">
        <div class="task-icon">${plantIcon}</div>
        <div class="task-info">
          <div class="task-name">${name}</div>
          <div class="task-plant">${careLabel}</div>
        </div>
        <div class="task-due${soon ? ' soon' : ''}">${dueLabel}</div>
      </div>`
  }).join('')
}

// Remove plant via event delegation
document.addEventListener('click', async e => {
  const btn = e.target.closest('.plant-remove-btn')
  if (!btn) return
  e.preventDefault()
  e.stopPropagation()

  const userPlantId = btn.dataset.id

  // Swap × for a confirmation inline
  if (btn.dataset.confirming) {
    await supabase.from('user_plants').delete().eq('id', userPlantId)
    loadUserPlants(currentUser)
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
  const signedInContent = document.getElementById('signed-in-content')
  if (signedInContent) signedInContent.style.display = user ? '' : 'none'
  loadUserPlants(user)
  loadUpcomingCare(user)
})
