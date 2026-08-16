const API_BASE = 'http://127.0.0.1:8000'
const STORAGE_KEY = 'budgiet_extension_token'

const loginForm = document.getElementById('login-form')
const addForm = document.getElementById('add-form')
const logoutBtn = document.getElementById('logout-btn')
const usernameInput = document.getElementById('username')
const passwordInput = document.getElementById('password')
const statusBox = document.getElementById('status')
const incomeEl = document.getElementById('income')
const expensesEl = document.getElementById('expenses')
const balanceEl = document.getElementById('balance')

function setStatus(message, kind = '') {
  statusBox.textContent = message
  statusBox.className = 'status'
  if (kind) statusBox.classList.add(kind)
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function setLoggedInState(isLoggedIn) {
  loginForm.classList.toggle('hidden', isLoggedIn)
  addForm.classList.toggle('hidden', !isLoggedIn)
  logoutBtn.classList.toggle('hidden', !isLoggedIn)
}

async function loadSession() {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const token = result[STORAGE_KEY]
  setLoggedInState(Boolean(token))
  if (token) {
    await loadSummary(token)
    return token
  }
  return null
}

async function persistToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEY]: token })
}

async function clearToken() {
  await chrome.storage.local.remove(STORAGE_KEY)
  setLoggedInState(false)
  setStatus('Not signed in yet.', '')
  incomeEl.textContent = formatCurrency(0)
  expensesEl.textContent = formatCurrency(0)
  balanceEl.textContent = formatCurrency(0)
}

async function loadSummary(token) {
  try {
    const response = await fetch(`${API_BASE}/summary`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Session expired')
    }

    const data = await response.json()
    incomeEl.textContent = formatCurrency(data.income || 0)
    expensesEl.textContent = formatCurrency(data.expenses || 0)
    balanceEl.textContent = formatCurrency(data.balance || 0)
  } catch (error) {
    await clearToken()
    setStatus('Your session expired. Please log in again.', 'error')
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const username = usernameInput.value.trim()
  const password = passwordInput.value

  if (!username || !password) {
    setStatus('Enter both username and password.', 'error')
    return
  }

  try {
    const response = await fetch(`${API_BASE}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Wrong username/password' }))
      throw new Error(error.detail || 'Wrong username/password')
    }

    const data = await response.json()
    await persistToken(data.access_token)
    setStatus('Logged in successfully.', 'success')
    setLoggedInState(true)
    await loadSummary(data.access_token)
    loginForm.reset()
  } catch (error) {
    setStatus(error.message || 'Wrong username/password', 'error')
  }
})

logoutBtn.addEventListener('click', async () => {
  await clearToken()
})

addForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const token = await chrome.storage.local.get(STORAGE_KEY).then((result) => result[STORAGE_KEY])
  if (!token) {
    setStatus('Please log in before adding a transaction.', 'error')
    return
  }

  const description = document.getElementById('description').value.trim()
  const amount = document.getElementById('amount').value
  const type = document.getElementById('type').value

  if (!description || !amount) {
    setStatus('Description and amount are required.', 'error')
    return
  }

  try {
    const response = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        description,
        amount: Number(amount),
        type,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unable to add transaction' }))
      throw new Error(error.detail || 'Unable to add transaction')
    }

    addForm.reset()
    setStatus(type === 'expense' ? 'Expense added successfully.' : 'Savings added successfully.', 'success')
    await loadSummary(token)
  } catch (error) {
    setStatus(error.message || 'Unable to add transaction', 'error')
  }
})

loadSession().catch(() => {
  setStatus('Please log in to continue.', '')
})
