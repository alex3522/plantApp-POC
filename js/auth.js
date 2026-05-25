import { supabase } from './supabase.js'

function injectModal() {
  const overlay = document.createElement('div')
  overlay.id = 'auth-modal'
  overlay.className = 'auth-modal-overlay'
  overlay.innerHTML = `
    <div class="auth-modal">
      <button class="auth-modal-close" id="auth-close">×</button>

      <div class="auth-screen" id="auth-choice">
        <div class="auth-welcome">
          <div class="auth-logo">plant<span>App</span></div>
          <p>Track your plants and never miss a watering.</p>
        </div>
        <div class="auth-choice-btns">
          <button class="auth-choice-btn primary" id="choice-signin">Log in</button>
          <button class="auth-choice-btn" id="choice-signup">Create account</button>
        </div>
      </div>

      <div class="auth-screen" id="auth-signin-screen" style="display:none">
        <div class="auth-screen-header">
          <button class="auth-back" id="back-from-signin">←</button>
          <span>Log in</span>
        </div>
        <form id="signin-form">
          <div class="auth-field">
            <label>Email</label>
            <input type="email" id="signin-email" placeholder="you@example.com" required />
          </div>
          <div class="auth-field">
            <label>Password</label>
            <input type="password" id="signin-password" placeholder="••••••••" required />
          </div>
          <p class="auth-error" id="signin-error"></p>
          <button type="submit" class="auth-submit">Log in</button>
        </form>
      </div>

      <div class="auth-screen" id="auth-signup-screen" style="display:none">
        <div class="auth-screen-header">
          <button class="auth-back" id="back-from-signup">←</button>
          <span>Create account</span>
        </div>
        <form id="signup-form">
          <div class="auth-field">
            <label>Email</label>
            <input type="email" id="signup-email" placeholder="you@example.com" required />
          </div>
          <div class="auth-field">
            <label>Password</label>
            <input type="password" id="signup-password" placeholder="••••••••" required />
          </div>
          <p class="auth-error" id="signup-error"></p>
          <button type="submit" class="auth-submit">Create account</button>
        </form>
      </div>

    </div>
  `
  document.body.appendChild(overlay)

  const screens = ['auth-choice', 'auth-signin-screen', 'auth-signup-screen']
  const showScreen = id => screens.forEach(s => {
    document.getElementById(s).style.display = s === id ? '' : 'none'
  })

  document.getElementById('auth-close').addEventListener('click', closeModal)
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal() })

  document.getElementById('choice-signin').addEventListener('click', () => showScreen('auth-signin-screen'))
  document.getElementById('choice-signup').addEventListener('click', () => showScreen('auth-signup-screen'))
  document.getElementById('back-from-signin').addEventListener('click', () => showScreen('auth-choice'))
  document.getElementById('back-from-signup').addEventListener('click', () => showScreen('auth-choice'))

  document.getElementById('signin-form').addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('signin-email').value
    const password = document.getElementById('signin-password').value
    const errorEl = document.getElementById('signin-error')
    const btn = e.target.querySelector('[type="submit"]')

    btn.disabled = true
    errorEl.textContent = ''

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    btn.disabled = false
    if (error) { errorEl.textContent = error.message; return }
    closeModal()
  })

  document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('signup-email').value
    const password = document.getElementById('signup-password').value
    const errorEl = document.getElementById('signup-error')
    const btn = e.target.querySelector('[type="submit"]')

    btn.disabled = true
    errorEl.textContent = ''

    const { data, error } = await supabase.auth.signUp({ email, password })

    btn.disabled = false
    if (error) { errorEl.textContent = error.message; return }

    if (data.session) {
      closeModal()
    } else {
      errorEl.style.color = '#2d6a4f'
      errorEl.textContent = 'Check your email to confirm your account.'
    }
  })
}

function resetToChoice() {
  const screens = ['auth-choice', 'auth-signin-screen', 'auth-signup-screen']
  screens.forEach((s, i) => {
    const el = document.getElementById(s)
    if (el) el.style.display = i === 0 ? '' : 'none'
  })
}

export function openModal() {
  resetToChoice()
  document.getElementById('auth-modal')?.classList.add('open')
}

export function closeModal() {
  document.getElementById('auth-modal')?.classList.remove('open')
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function updateNav(user) {
  const signInLink = document.getElementById('sign-in-link')
  const userMenu = document.getElementById('user-menu')
  const userEmail = document.getElementById('user-email')

  if (user) {
    signInLink?.style.setProperty('display', 'none')
    if (userMenu) userMenu.style.display = 'flex'
    if (userEmail) userEmail.textContent = user.email
  } else {
    signInLink?.style.removeProperty('display')
    if (userMenu) userMenu.style.display = 'none'
  }
}

export function initAuth(onUserChange) {
  injectModal()

  document.getElementById('sign-in-link')?.addEventListener('click', e => {
    e.preventDefault()
    openModal()
  })

  document.getElementById('sign-out-btn')?.addEventListener('click', async e => {
    e.preventDefault()
    await supabase.auth.signOut()
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    updateNav(session?.user ?? null)
    onUserChange?.(session?.user ?? null)
  })

  supabase.auth.getSession().then(({ data: { session } }) => {
    updateNav(session?.user ?? null)
    onUserChange?.(session?.user ?? null)
  })
}
