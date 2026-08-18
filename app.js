/* Budgiet — Local-first budget tracker with device storage */
const STORAGE_KEY = 'pocketpilot_tx_v1'
const PERIOD_KEY = 'budgiet_current_period'
const PERIOD_START_KEY = 'budgiet_period_start'
const PERIOD_END_KEY = 'budgiet_period_end'
const HISTORY_KEY = 'budgiet_history'

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
const periodSelect = document.getElementById('period-select')
const countdownEl = document.getElementById('countdown-text')
const historyBtn = document.getElementById('history-btn')
const historyModal = document.getElementById('history-modal')
const closeHistoryBtn = document.getElementById('close-history')
const historyList = document.getElementById('history-list')
const periodSettingsBtn = document.getElementById('period-settings-btn')
const settingsModal = document.getElementById('period-settings-modal')
const closeSettingsBtn = document.getElementById('close-settings')
const periodStartInput = document.getElementById('period-start-date')
const periodEndInput = document.getElementById('period-end-date')
const dateSummary = document.getElementById('date-summary')
const savePeriodSettingsBtn = document.getElementById('save-period-settings')
const resetToTodayBtn = document.getElementById('reset-to-today')

let transactions = []
let currentPeriod = localStorage.getItem(PERIOD_KEY) || 'monthly'
let countdownTimer = null

function getPeriodEndDate(period = currentPeriod) {
  // Check for custom end date first
  const customEndDate = localStorage.getItem(PERIOD_END_KEY)
  if (customEndDate) {
    return new Date(customEndDate)
  }

  // If no custom date, calculate based on period type
  const now = new Date()
  const storedStart = localStorage.getItem(PERIOD_START_KEY)
  let periodStart = storedStart ? new Date(storedStart) : now

  const periodEnd = new Date(periodStart)
  switch (period) {
    case 'weekly':
      periodEnd.setDate(periodEnd.getDate() + 7)
      break
    case 'monthly':
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      break
    case 'quarterly':
      periodEnd.setMonth(periodEnd.getMonth() + 3)
      break
    case 'annual':
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
      break
  }
  return periodEnd
}

function getDaysUntilReset() {
  const now = new Date()
  const endDate = getPeriodEndDate()
  const diff = endDate - now
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function updateCountdown() {
  if (!countdownEl) return
  
  const days = getDaysUntilReset()
  if (days <= 0) {
    checkAndResetPeriod()
    countdownEl.textContent = 'Resetting now...'
    return
  }
  
  countdownEl.textContent = `${days} day${days !== 1 ? 's' : ''} until reset`
}

function savePeriodToHistory() {
  try {
    const incomes = transactions.filter(t => t.type === 'income').reduce((s,t)=>s + Number(t.amount),0)
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s,t)=>s + Number(t.amount),0)
    const balance = incomes - expenses

    const periodData = {
      period: currentPeriod,
      startDate: localStorage.getItem(PERIOD_START_KEY),
      endDate: new Date().toISOString(),
      transactions: [...transactions],
      income: incomes,
      expenses: expenses,
      balance: balance
    }

    const history = loadHistory()
    history.unshift(periodData)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch (e) {
    console.error('Failed to save period to history', e)
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error('Failed to load history', e)
    return []
  }
}

function checkAndResetPeriod() {
  const now = new Date()
  const endDate = getPeriodEndDate()

  if (now >= endDate) {
    // Save current period to history before resetting
    savePeriodToHistory()

    // Reset transactions and period start
    transactions = []
    saveTransactions()
    localStorage.setItem(PERIOD_START_KEY, new Date().toISOString())

    updateUI()
    updateCountdown()
  }
}

function displayHistory() {
  const history = loadHistory()
  historyList.innerHTML = ''

  if (history.length === 0) {
    historyList.innerHTML = '<p class="no-history">No past periods yet.</p>'
    return
  }

  history.forEach((period, index) => {
    const historyCard = document.createElement('div')
    historyCard.className = 'history-card'

    const startDate = new Date(period.startDate).toLocaleDateString()
    const endDate = new Date(period.endDate).toLocaleDateString()
    const periodLabel = period.period.charAt(0).toUpperCase() + period.period.slice(1)

    historyCard.innerHTML = `
      <div class="history-header">
        <h3>${periodLabel} Period</h3>
        <span class="history-dates">${startDate} to ${endDate}</span>
      </div>
      <div class="history-stats">
        <div class="history-stat">
          <span class="label">Income</span>
          <span class="amount income">${formatCurrency(period.income)}</span>
        </div>
        <div class="history-stat">
          <span class="label">Expenses</span>
          <span class="amount expense">${formatCurrency(period.expenses)}</span>
        </div>
        <div class="history-stat">
          <span class="label">Balance</span>
          <span class="amount balance">${formatCurrency(period.balance)}</span>
        </div>
      </div>
      <div class="history-transactions">
        <details>
          <summary>View Transactions (${period.transactions.length})</summary>
          <ul class="tx-history-list">
            ${period.transactions.map(tx => {
              const date = new Date(tx.id).toLocaleString()
              const signed = tx.type === 'income' ? Number(tx.amount) : -Math.abs(Number(tx.amount))
              return `
                <li class="tx-history-item">
                  <div class="tx-history-info">
                    <div class="tx-history-desc">${tx.description}</div>
                    <div class="tx-history-meta">${tx.type} • ${date}</div>
                  </div>
                  <div class="tx-history-amount ${tx.type}">${formatCurrency(signed)}</div>
                </li>
              `
            }).join('')}
          </ul>
        </details>
      </div>
    `

    historyList.appendChild(historyCard)
  })
}

function formatDateForInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function updateDateSummary() {
  const startDate = periodStartInput.value ? new Date(periodStartInput.value) : null
  const endDate = periodEndInput.value ? new Date(periodEndInput.value) : null

  if (startDate && endDate) {
    const diffTime = endDate - startDate
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const startStr = startDate.toLocaleDateString()
    const endStr = endDate.toLocaleDateString()
    dateSummary.innerHTML = `<div class="summary-text"><strong>${startStr}</strong> to <strong>${endStr}</strong><br><span class="duration">${diffDays} days</span></div>`
  } else {
    dateSummary.innerHTML = ''
  }
}

function loadSettingsModal() {
  const customStart = localStorage.getItem(PERIOD_START_KEY)
  const customEnd = localStorage.getItem(PERIOD_END_KEY)

  if (customStart) {
    periodStartInput.value = formatDateForInput(new Date(customStart))
  } else {
    const today = new Date()
    periodStartInput.value = formatDateForInput(today)
  }

  if (customEnd) {
    periodEndInput.value = formatDateForInput(new Date(customEnd))
  } else {
    const endDate = getPeriodEndDate()
    periodEndInput.value = formatDateForInput(endDate)
  }

  updateDateSummary()
}

function setPreset(startDate, endDate) {
  periodStartInput.value = formatDateForInput(startDate)
  periodEndInput.value = formatDateForInput(endDate)
  updateDateSummary()
}

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day
  return new Date(d.setDate(diff))
}

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getMonthEnd(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function getQuarterStart(date = new Date()) {
  const quarter = Math.floor(date.getMonth() / 3)
  return new Date(date.getFullYear(), quarter * 3, 1)
}

function getQuarterEnd(date = new Date()) {
  const quarter = Math.floor(date.getMonth() / 3)
  return new Date(date.getFullYear(), (quarter + 1) * 3, 0)
}

function getYearStart(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1)
}

function getYearEnd(date = new Date()) {
  return new Date(date.getFullYear(), 11, 31)
}

function savePeriodSettings() {
  const startDate = periodStartInput.value
  const endDate = periodEndInput.value

  if (!startDate || !endDate) {
    alert('Please select both start and end dates')
    return
  }

  const start = new Date(startDate)
  const end = new Date(endDate)

  if (start >= end) {
    alert('Start date must be before end date')
    return
  }

  // Save the custom dates
  localStorage.setItem(PERIOD_START_KEY, start.toISOString())
  localStorage.setItem(PERIOD_END_KEY, end.toISOString())

  // Close modal
  settingsModal.classList.add('hidden')

  // Refresh UI
  updateCountdown()
  alert('Period settings saved! Countdown has been refreshed.')
}

function resetToToday() {
  if (!confirm('Reset period to start today? This will save current period to history.')) {
    return
  }

  // Save current period to history
  savePeriodToHistory()

  // Reset transactions
  transactions = []
  saveTransactions()

  // Set new start date to today
  const today = new Date()
  localStorage.setItem(PERIOD_START_KEY, today.toISOString())

  // Calculate new end date based on current period
  const newEnd = getPeriodEndDate()
  localStorage.setItem(PERIOD_END_KEY, newEnd.toISOString())

  // Reload modal
  loadSettingsModal()

  // Update UI
  updateUI()
  updateCountdown()
  alert('Period has been reset to today!')
}

function init(){
  // Initialize period if not set
  if (!localStorage.getItem(PERIOD_START_KEY)) {
    localStorage.setItem(PERIOD_START_KEY, new Date().toISOString())
  }

  // Check for period reset
  checkAndResetPeriod()

  // Set current period from select
  periodSelect.value = currentPeriod

  transactions = loadTransactions()
  updateUI()
  updateCountdown()

  // Start countdown timer
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(updateCountdown, 60000) // Update every minute
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
  const flash = document.getElementById('expense-flash')
  const dangerHearts = document.querySelectorAll('.danger-heart')
  if (!scene || !tree) return

  scene.classList.remove('expense-impact')
  tree.classList.remove('blowing')
  waves.forEach((wave) => {
    wave.classList.remove('active')
  })
  dangerHearts.forEach((heart) => heart.classList.remove('active'))
  if (flash) {
    flash.classList.remove('active')
  }

  void scene.offsetWidth
  scene.classList.add('expense-impact')
  tree.classList.add('blowing')
  waves.forEach((wave) => {
    void wave.offsetWidth
    wave.classList.add('active')
  })
  dangerHearts.forEach((heart) => {
    void heart.offsetWidth
    heart.classList.add('active')
  })
  if (flash) {
    void flash.offsetWidth
    flash.classList.add('active')
  }

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
    dangerHearts.forEach((heart) => heart.classList.remove('active'))
    if (flash) {
      flash.classList.remove('active')
    }
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
  const displayScore = transactions.length > 0 ? Math.max(score, 3) : 0
  healthFill.style.width = `${displayScore}%`
  healthFill.style.backgroundColor = `hsl(${Math.round(score * 1.2)} 72% 42%)`
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
  transactions.push(tx)
  saveTransactions()
  updateUI()
}

function removeTransaction(id){
  transactions = transactions.filter(t => t.id !== id)
  saveTransactions()
  updateUI()
}

function clearAll(){
  if(!confirm('Clear all transactions? This cannot be undone.')) return
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

periodSelect.addEventListener('change', (e) => {
  currentPeriod = e.target.value
  localStorage.setItem(PERIOD_KEY, currentPeriod)
  localStorage.setItem(PERIOD_START_KEY, new Date().toISOString())
  transactions = []
  saveTransactions()
  updateUI()
  updateCountdown()
})

historyBtn.addEventListener('click', () => {
  displayHistory()
  historyModal.classList.remove('hidden')
})

closeHistoryBtn.addEventListener('click', () => {
  historyModal.classList.add('hidden')
})

historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal) {
    historyModal.classList.add('hidden')
  }
})

periodSettingsBtn.addEventListener('click', () => {
  if (!settingsModal) {
    console.error('Settings modal not found')
    return
  }
  loadSettingsModal()
  settingsModal.classList.remove('hidden')
})

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden')
})

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add('hidden')
  }
})

periodStartInput.addEventListener('change', updateDateSummary)
periodEndInput.addEventListener('change', updateDateSummary)

savePeriodSettingsBtn.addEventListener('click', savePeriodSettings)
resetToTodayBtn.addEventListener('click', resetToToday)

// Preset buttons
document.getElementById('preset-today').addEventListener('click', () => {
  const today = new Date()
  setPreset(today, today)
})

document.getElementById('preset-week').addEventListener('click', () => {
  const weekStart = getWeekStart()
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  setPreset(weekStart, weekEnd)
})

document.getElementById('preset-month').addEventListener('click', () => {
  setPreset(getMonthStart(), getMonthEnd())
})

document.getElementById('preset-quarter').addEventListener('click', () => {
  setPreset(getQuarterStart(), getQuarterEnd())
})

document.getElementById('preset-year').addEventListener('click', () => {
  setPreset(getYearStart(), getYearEnd())
})

// init
init()

// init
updateUI()
