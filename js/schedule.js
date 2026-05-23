import { supabase } from './supabase.js'
import { initAuth } from './auth.js'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const CARE_ICONS = { water: '💧', feed: '🌿', repot: '🪴', mist: '💦', prune: '✂️' }

let currentYear = new Date().getFullYear()
let currentMonth = new Date().getMonth()
let scheduleData = null
let plantData = null

async function fetchData() {
  const [{ data: schedules, error }, json] = await Promise.all([
    supabase.from('care_schedule').select('*, user_plants(plant_id, nickname)'),
    fetch('data/plants.json').then(r => r.json())
  ])

  if (error) { console.error(error); return }

  scheduleData = schedules
  plantData = Object.fromEntries(json.plants.map(p => [p.id, p]))
}

function getOccurrencesInMonth(nextDue, frequencyDays, year, month) {
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)

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

function buildTasksByDay() {
  const byDay = {}
  for (const entry of scheduleData) {
    const plant = plantData[entry.user_plants.plant_id]
    const name = entry.user_plants.nickname || plant?.name || 'Unknown'
    const icon = CARE_ICONS[entry.care_type] ?? '📋'

    const days = getOccurrencesInMonth(
      entry.next_due, entry.frequency_days, currentYear, currentMonth
    )
    for (const d of days) {
      if (!byDay[d]) byDay[d] = []
      byDay[d].push({ type: entry.care_type, name, icon })
    }
  }
  return byDay
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid')
  document.getElementById('month-label').textContent =
    `${MONTH_NAMES[currentMonth]} ${currentYear}`

  if (!scheduleData) {
    grid.innerHTML = `
      <div class="cal-day-label"></div>`.repeat(7) +
      `<div class="cal-signin">Sign in to see your care schedule.</div>`
    return
  }

  const monthStart = new Date(currentYear, currentMonth, 1)
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const startDow = (monthStart.getDay() + 6) % 7

  const today = new Date()
  const todayNum =
    today.getFullYear() === currentYear && today.getMonth() === currentMonth
      ? today.getDate() : -1

  const tasksByDay = buildTasksByDay()

  const cells = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  grid.innerHTML =
    DAY_LABELS.map(d => `<div class="cal-day-label">${d}</div>`).join('') +
    cells.map(d => {
      if (!d) return `<div class="cal-day empty"></div>`

      const tasks = tasksByDay[d] || []
      const isToday = d === todayNum

      const taskHtml = tasks.slice(0, 3).map(t => `
        <div class="cal-task" data-type="${t.type}">
          <span>${t.icon}</span>
          <span class="cal-task-name">${t.name}</span>
        </div>`).join('') +
        (tasks.length > 3 ? `<div class="cal-more">+${tasks.length - 3} more</div>` : '')

      return `
        <div class="cal-day${isToday ? ' today' : ''}">
          <div class="cal-day-number">${d}</div>
          <div class="cal-tasks">${taskHtml}</div>
        </div>`
    }).join('')
}

document.getElementById('prev-month').addEventListener('click', () => {
  if (currentMonth === 0) { currentMonth = 11; currentYear-- }
  else currentMonth--
  renderCalendar()
})

document.getElementById('next-month').addEventListener('click', () => {
  if (currentMonth === 11) { currentMonth = 0; currentYear++ }
  else currentMonth++
  renderCalendar()
})

initAuth(async user => {
  if (user) {
    await fetchData()
  }
  renderCalendar()
})
