/* PocketPilot — front-end with optional API sync + auth */
const STORAGE_KEY = 'pocketpilot_tx_v1'
const TOKEN_KEY = 'pocketpilot_token'
// Local development setup: the FastAPI app runs on 127.0.0.1:8000.
const API_BASE = 'http://127.0.0.1:8000'

const form = document.getElementById('tx-form')
const descEl = document.getElementById('description')
const amountEl = document.getElementById('amount')
const typeEl = document.getElementById('type')
const txListEl = document.getElementById('transactions')
const emptyEl = document.getElementById('empty')
const balanceEl = document.getElementById('balance')
const incomeEl = document.getElementById('income')
const expensesEl = document.getElementById('expenses')
const clearBtn = document.getElementById('clear-btn')

const usernameEl = document.getElementById('username')
const passwordEl = document.getElementById('password')
const loginBtn = document.getElementById('login-btn')
const registerBtn = document.getElementById('register-btn')
const logoutBtn = document.getElementById('logout-btn')
const forgotBtn = document.getElementById('forgot-btn')

let transactions = []

async function init(){
  const token = localStorage.getItem(TOKEN_KEY)
  if(token) {
    setAuthedUI(true)
    await loadFromApi()
  } else {
    transactions = loadTransactions()
    updateUI()
  }
}

function loadTransactions(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  }catch(e){
    console.error('Failed to load transactions', e)
    return []
  }
}

function saveTransactions(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
}

function formatCurrency(num){
  const abs = Math.abs(num)
  return (num < 0 ? '-' : '') + new Intl.NumberFormat(undefined, {style:'currency',currency:'USD',maximumFractionDigits:2}).format(abs)
}

let lastLeafState = 5

function playChirp() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return

  const audioCtx = new AudioCtx()
  const oscillator = audioCtx.createOscillator()
  const gainNode = audioCtx.createGain()

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(1800, audioCtx.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(2500, audioCtx.currentTime + 0.08)

  gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18)

  oscillator.connect(gainNode)
  gainNode.connect(audioCtx.destination)
  oscillator.start()
  oscillator.stop(audioCtx.currentTime + 0.2)
  oscillator.onended = () => audioCtx.close()
}

function triggerExpenseAnimation() {
  const scene = document.querySelector('.budgie-scene')
  const tree = document.getElementById('tree')
  const waves = document.querySelectorAll('.sound-wave')
  if (!scene || !tree) return

  scene.classList.remove('expense-impact')
  tree.classList.remove('blowing')
  waves.forEach((wave) => {
    wave.classList.remove('active')
  })

  void scene.offsetWidth
  scene.classList.add('expense-impact')
  tree.classList.add('blowing')
  waves.forEach((wave) => {
    void wave.offsetWidth
    wave.classList.add('active')
  })

  playChirp()

  const leaves = Array.from(document.querySelectorAll('.leaf'))
  leaves.forEach((leaf, index) => {
    leaf.classList.remove('blown-away', 'falling')
    void leaf.offsetWidth
    leaf.classList.add('blown-away')
    leaf.style.setProperty('--delay', `${index * 30}ms`)
  })

  setTimeout(() => {
    tree.classList.remove('blowing')
    waves.forEach((wave) => wave.classList.remove('active'))
  }, 700)
}

function updateTreeLeaves(score) {
  const leaves = Array.from(document.querySelectorAll('.leaf'))
  const thresholds = [75, 50, 25, 10, 5]
  let visibleLeaves = leaves.length

  for (const threshold of thresholds) {
    if (score <= threshold) {
      visibleLeaves -= 1
    }
  }

  visibleLeaves = Math.max(0, Math.min(leaves.length, visibleLeaves))

  leaves.forEach((leaf, index) => {
    const shouldShow = index < visibleLeaves
    leaf.classList.toggle('is-hidden', !shouldShow)
    leaf.classList.toggle('falling', !shouldShow)
    if (!shouldShow) {
      leaf.classList.remove('blown-away')
    }
  })

  if (visibleLeaves < lastLeafState) {
    triggerExpenseAnimation()
  }
  lastLeafState = visibleLeaves
}

function updateSummary(){
  const incomes = transactions.filter(t => t.type === 'income').reduce((s,t)=>s + Number(t.amount),0)
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s,t)=>s + Number(t.amount),0)
  const balance = incomes - expenses
  incomeEl.textContent = formatCurrency(incomes)
  expensesEl.textContent = formatCurrency(expenses)
  balanceEl.textContent = formatCurrency(balance)

  const tree = document.getElementById('tree')
  const treeStatus = document.getElementById('tree-status')
  const treeScore = document.getElementById('tree-score')
  const healthFill = document.getElementById('health-fill')
  if (!tree || !treeStatus || !treeScore || !healthFill) return

  const remaining = incomes - expenses
  const healthyBase = incomes > 0 ? (remaining / incomes) * 100 : 0
  const score = Math.max(0, Math.min(100, Math.round(healthyBase)))

  let statusText = 'Your tree is waiting for a healthy ratio.'
  tree.classList.remove('tree-thriving', 'tree-healthy', 'tree-stressed', 'tree-empty')

  if (score >= 70) {
    tree.classList.add('tree-thriving')
    statusText = 'Your budget tree is thriving — healthy and happy!'
  } else if (score >= 35) {
    tree.classList.add('tree-healthy')
    statusText = 'Your tree is growing steadily with a strong budget.'
  } else if (score > 0) {
    tree.classList.add('tree-stressed')
    statusText = 'Your tree needs more income or less spending.'
  } else {
    tree.classList.add('tree-empty')
    statusText = 'Your tree is struggling — spending is outpacing income.'
  }

  treeScore.textContent = `${score}%`
  healthFill.style.width = `${score}%`
  treeStatus.textContent = statusText
  updateTreeLeaves(score)
}

function renderTransactions(){
  txListEl.innerHTML = ''
  if(transactions.length === 0){
    emptyEl.style.display = 'block'
    return
  }
  emptyEl.style.display = 'none'
  transactions.slice().reverse().forEach(tx => {
    const li = document.createElement('li')
    li.className = 'tx-item'

    const left = document.createElement('div')
    left.className = 'tx-left'
    const desc = document.createElement('div')
    desc.className = 'tx-desc'
    desc.textContent = tx.description
    const meta = document.createElement('div')
    meta.className = 'tx-meta'
    const date = new Date(tx.id).toLocaleString()
    meta.textContent = `${tx.type} • ${date}`
    left.appendChild(desc)
    left.appendChild(meta)

    const right = document.createElement('div')
    right.className = 'tx-right'
    const amt = document.createElement('div')
    amt.className = 'tx-amount ' + (tx.type === 'income' ? 'income' : 'expense')
    const signed = tx.type === 'income' ? Number(tx.amount) : -Math.abs(Number(tx.amount))
    amt.textContent = formatCurrency(signed)

    const actions = document.createElement('div')
    actions.className = 'tx-actions'
    const del = document.createElement('button')
    del.title = 'Delete'
    del.innerHTML = '🗑️'
    del.addEventListener('click', () => removeTransaction(tx.id))
    actions.appendChild(del)

    right.appendChild(amt)
    right.appendChild(actions)

    li.appendChild(left)
    li.appendChild(right)
    txListEl.appendChild(li)
  })
}

function addTransaction(description, amount, type){
  const tx = { id: Date.now(), description: description.trim(), amount: Number(amount), type }
  if (type === 'expense') {
    triggerExpenseAnimation()
  }
  const token = localStorage.getItem(TOKEN_KEY)
  if(token){
    // send to API
    fetch(API_BASE + '/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ description: tx.description, amount: tx.amount, type: tx.type })
    }).then(r => r.json()).then(created => {
      // server will return object with numeric id; use created.created_at or created.id
      // fetch list after create
      loadFromApi()
    }).catch(e => {
      console.warn('API create failed, saving locally', e)
      transactions.push(tx)
      saveTransactions()
      updateUI()
    })
  } else {
    transactions.push(tx)
    saveTransactions()
    updateUI()
  }
}

function removeTransaction(id){
  transactions = transactions.filter(t => t.id !== id)
  saveTransactions()
  updateUI()
}

async function clearAll(){
  if(!confirm('Clear all transactions? This cannot be undone.')) return
  const token = localStorage.getItem(TOKEN_KEY)

  try {
    if(token){
      const res = await fetch(API_BASE + '/transactions', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      if(res.ok){
        const serverTxs = await res.json()
        await Promise.all(serverTxs.map(tx =>
          fetch(API_BASE + '/transactions/' + tx.id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          })
        ))
      }
    }
  } catch (e) {
    console.warn('Server clear failed, continuing with local clear', e)
  }

  transactions = []
  saveTransactions()
  updateUI()
}

function updateUI(){
  updateSummary()
  renderTransactions()
}

form.addEventListener('submit', e => {
  e.preventDefault()
  const desc = descEl.value
  const amount = amountEl.value
  const type = typeEl.value
  if(!desc || !amount) return
  addTransaction(desc, amount, type)
  form.reset()
  descEl.focus()
})

clearBtn.addEventListener('click', clearAll)

loginBtn.addEventListener('click', async () => {
  const u = usernameEl.value.trim(), p = passwordEl.value
  if(!u || !p) return alert('Enter username and password')
  try{
    const res = await fetch(API_BASE + '/auth/token', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:u, password:p})
    })
    if(!res.ok) {
      const error = await res.json().catch(() => ({detail: 'Wrong username/password'}))
      return alert(error.detail || 'Wrong username/password')
    }
    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setAuthedUI(true)
    await loadFromApi()
  }catch(e){
    alert('Wrong username/password')
  }
})

registerBtn.addEventListener('click', async () => {
  const u = usernameEl.value.trim(), p = passwordEl.value
  if(!u || !p) return alert('Enter username and password')

  const email = prompt('Enter your email for this account:')
  if (!email || !email.trim()) return alert('Email is required to register')

  try{
    const res = await fetch(API_BASE + '/auth/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:u, password:p, email: email.trim()})
    })
    if(!res.ok) {
      const error = await res.json().catch(() => ({detail: 'Username is Taken'}))
      return alert(error.detail || 'Username is Taken')
    }
    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setAuthedUI(true)
    await loadFromApi()
    alert('Registration successful')
  }catch(e){
    alert('Registration error')
  }
})

forgotBtn.addEventListener('click', async () => {
  const email = prompt('Enter your email address:')
  if (!email || !email.trim()) return alert('Email is required')

  const newPassword = prompt('Enter your new password:')
  if (!newPassword || !newPassword.trim()) return alert('New password is required')

  try {
    const res = await fetch(API_BASE + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), new_password: newPassword.trim() })
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({detail: 'Email not found'}))
      return alert(error.detail || 'Email not found')
    }

    alert('Password updated successfully')
  } catch (e) {
    alert('Password reset failed')
  }
})

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY)
  setAuthedUI(false)
  transactions = loadTransactions()
  updateUI()
})

function setAuthedUI(authed){
  if(authed){
    usernameEl.style.display = 'none'
    passwordEl.style.display = 'none'
    loginBtn.style.display = 'none'
    registerBtn.style.display = 'none'
    logoutBtn.style.display = 'inline-block'
  } else {
    usernameEl.style.display = ''
    passwordEl.style.display = ''
    loginBtn.style.display = ''
    registerBtn.style.display = ''
    logoutBtn.style.display = 'none'
  }
}

async function loadFromApi(){
  const token = localStorage.getItem(TOKEN_KEY)
  if(!token) return
  try{
    const res = await fetch(API_BASE + '/transactions', { headers: { 'Authorization': 'Bearer ' + token } })
    if(!res.ok) throw new Error('Failed')
    const data = await res.json()
    // adapt server objects to client format
    transactions = data.map(t => ({ id: t.id || Date.now(), description: t.description, amount: t.amount, type: t.type }))
    updateUI()
  }catch(e){
    console.warn('Load from API failed, falling back', e)
    transactions = loadTransactions()
    updateUI()
  }
}

// init
init()

// init
updateUI()
