/* Budgiet — Local-first budget tracker with device storage */
const STORAGE_KEY = 'pocketpilot_tx_v1'
const PERIOD_KEY = 'budgiet_current_period'
const PERIOD_START_KEY = 'budgiet_period_start'
const PERIOD_END_KEY = 'budgiet_period_end'
const HISTORY_KEY = 'budgiet_history'
const BUDGIE_DESIGN_KEY = 'budgiet_budgie_design'
const DAYS_USED_KEY = 'budgiet_days_used'
const LAST_USED_DATE_KEY = 'budgiet_last_used_date'
const ONBOARDING_KEY = 'budgiet_onboarding_complete'
const DISPLAY_CURRENCY_KEY = 'budgiet_display_currency'
const RATE_CACHE_KEY = 'budgiet_rate_cache'
const RATE_CACHE_TTL_MS = 30 * 60 * 1000
const THEME_KEY = 'budgiet_theme'

// Approximate fallback used only when the live rate API is unreachable
const STATIC_FALLBACK_RATES = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151, AUD: 1.52, CAD: 1.36,
  INR: 83.3, CNY: 7.24, SGD: 1.34, CHF: 0.88, MYR: 4.47, IDR: 15800
}

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
const budgieScene = document.querySelector('.budgie-scene')
const budgieDesignButtons = document.querySelectorAll('.budgie-design')
const midnightCutscene = document.getElementById('midnight-cutscene')
const onboardingOverlay = document.getElementById('onboarding-overlay')
const onboardingHighlight = document.getElementById('onboarding-highlight')
const onboardingTooltip = document.getElementById('onboarding-tooltip')
const onboardingStepCountEl = document.getElementById('onboarding-step-count')
const onboardingTitleEl = document.getElementById('onboarding-title')
const onboardingTextEl = document.getElementById('onboarding-text')
const onboardingNextBtn = document.getElementById('onboarding-next')
const onboardingSkipBtn = document.getElementById('onboarding-skip')
const txCurrencySelect = document.getElementById('tx-currency')
const displayCurrencySelect = document.getElementById('display-currency-select')
const rateStatusEl = document.getElementById('rate-status')
const menuToggleBtn = document.getElementById('menu-toggle')
const sideMenuOverlay = document.getElementById('side-menu-overlay')
const menuViews = document.querySelectorAll('.menu-view')
const menuOpenButtons = document.querySelectorAll('[data-open-view]')
const menuBackButtons = document.querySelectorAll('[data-back-view]')
const menuCloseButtons = document.querySelectorAll('[data-close-menu]')
const themeToggle = document.getElementById('theme-toggle')
const themeStatusLabel = document.getElementById('theme-status-label')

const onboardingSteps = [
  {
    title: 'Welcome to Budgiet! 🐦',
    text: "This app will store your daily income and expenses so you don't have to actively keep track of them yourself."
  },
  {
    selector: '#description',
    title: 'Add a description',
    text: 'Here is where you key in the description of your transaction, like "Salary" or "Coffee".'
  },
  {
    selector: '#amount',
    title: 'Enter the amount',
    text: 'Here is where you key in the amount of money you saved or spent.'
  },
  {
    selector: '#type',
    title: 'Income or expense?',
    text: 'Choose whether this transaction is Income coming in or an Expense going out.'
  },
  {
    selector: '.add-btn',
    title: 'Save your transaction',
    text: "Tap Add to save it — it's stored right on your device automatically."
  },
  {
    selector: '.period-control',
    title: 'Set your tracking period',
    text: 'Pick how often your budget resets. Changing this only updates the countdown — your transactions stay safe.'
  },
  {
    selector: '#menu-toggle',
    title: 'Unlock new bird skins',
    text: 'Open the menu and tap "Customise Budgie" — use Budgiet every day to unlock new skins for your budget tree bird!'
  }
]

let onboardingIndex = 0

let transactions = []
let currentPeriod = localStorage.getItem(PERIOD_KEY) || 'monthly'
let countdownTimer = null
let editingTransactionId = null
let displayCurrency = localStorage.getItem(DISPLAY_CURRENCY_KEY) || 'SGD'
let exchangeRates = STATIC_FALLBACK_RATES

function loadRateCache() {
  try {
    const raw = localStorage.getItem(RATE_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw)
    if (Date.now() - cache.timestamp > RATE_CACHE_TTL_MS) return null
    return cache.rates
  } catch (e) { return null }
}

async function refreshExchangeRates() {
  const cached = loadRateCache()
  if (cached) {
    exchangeRates = cached
    rateStatusEl.textContent = 'Rates cached'
    return
  }
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    const data = await res.json()
    exchangeRates = data.rates
    localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({ rates: exchangeRates, timestamp: Date.now() }))
    rateStatusEl.textContent = 'Live rates'
  } catch (e) {
    exchangeRates = STATIC_FALLBACK_RATES
    rateStatusEl.textContent = 'Using offline rates'
  }
  updateUI()
}

function getDaysUsedCount() {
  return Number(localStorage.getItem(DAYS_USED_KEY)) || 0
}

// Counts distinct calendar days the app has been opened on; skipped days don't reset it,
// they just delay the count (e.g. login day 1, skip day 2, login day 3 -> count is 2, not 3)
function trackDailyUsage() {
  const today = new Date().toDateString()
  const lastUsed = localStorage.getItem(LAST_USED_DATE_KEY)
  if (lastUsed !== today) {
    localStorage.setItem(DAYS_USED_KEY, String(getDaysUsedCount() + 1))
    localStorage.setItem(LAST_USED_DATE_KEY, today)
  }
}

function updateBudgieDesignSelector() {
  if (!budgieScene) return
  const daysUsed = getDaysUsedCount()
  const selectedDesign = localStorage.getItem(BUDGIE_DESIGN_KEY) || 'default'
  budgieScene.dataset.design = selectedDesign

  budgieDesignButtons.forEach((button) => {
    const requiredDays = Number(button.dataset.unlockReset) || 0
    const unlocked = daysUsed >= requiredDays
    button.disabled = !unlocked
    button.classList.toggle('is-locked', !unlocked)
    button.classList.toggle('is-selected', button.dataset.budgieDesign === selectedDesign)
    button.title = unlocked ? `${button.dataset.budgieDesign} budgie` : `Unlock after ${requiredDays} day${requiredDays === 1 ? '' : 's'} of use`
  })
}

function selectBudgieDesign(design) {
  localStorage.setItem(BUDGIE_DESIGN_KEY, design)
  updateBudgieDesignSelector()
}

function openMenuView(viewName) {
  menuViews.forEach(view => view.classList.toggle('is-active', view.dataset.view === viewName))
}

function openSideMenu() {
  sideMenuOverlay.classList.remove('hidden')
  menuToggleBtn.setAttribute('aria-expanded', 'true')
  openMenuView('root')
}

function closeSideMenu() {
  sideMenuOverlay.classList.add('hidden')
  menuToggleBtn.setAttribute('aria-expanded', 'false')
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
  if (themeToggle) themeToggle.checked = theme === 'dark'
  if (themeStatusLabel) themeStatusLabel.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode'
}

function positionOnboarding(step) {
  const target = step.selector ? document.querySelector(step.selector) : null

  if (!target) {
    onboardingHighlight.style.cssText = 'top:0;left:0;width:100vw;height:100vh;background:rgba(10,20,18,0.6);border-radius:0;box-shadow:none;'
    onboardingTooltip.style.top = '50%'
    onboardingTooltip.style.left = '50%'
    onboardingTooltip.style.transform = 'translate(-50%, -50%)'
    return
  }

  target.scrollIntoView({ block: 'center', behavior: 'auto' })

  // wait a tick for layout to settle before measuring the target's position
  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect()
    const padding = 8
    onboardingHighlight.style.cssText = `
      top:${rect.top - padding}px;
      left:${rect.left - padding}px;
      width:${rect.width + padding * 2}px;
      height:${rect.height + padding * 2}px;
      background:transparent;
      border-radius:12px;
      border:2px solid #ffd54f;
      box-shadow:0 0 0 9999px rgba(10,20,18,0.6);
    `

    onboardingTooltip.style.transform = 'none'
    const tooltipRect = onboardingTooltip.getBoundingClientRect()
    let top = rect.bottom + 16
    if (top + tooltipRect.height > window.innerHeight - 12) {
      top = Math.max(12, rect.top - tooltipRect.height - 16)
    }
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2
    left = Math.min(Math.max(12, left), window.innerWidth - tooltipRect.width - 12)

    onboardingTooltip.style.top = `${top}px`
    onboardingTooltip.style.left = `${left}px`
  })
}

function showOnboardingStep(index) {
  const step = onboardingSteps[index]
  if (!step) {
    finishOnboarding()
    return
  }
  onboardingStepCountEl.textContent = `${index + 1} / ${onboardingSteps.length}`
  onboardingTitleEl.textContent = step.title
  onboardingTextEl.textContent = step.text
  onboardingNextBtn.textContent = index === onboardingSteps.length - 1 ? 'Got it!' : 'Next'
  positionOnboarding(step)
}

function startOnboarding() {
  onboardingIndex = 0
  onboardingOverlay.classList.remove('hidden')
  showOnboardingStep(onboardingIndex)
}

function finishOnboarding() {
  onboardingOverlay.classList.add('hidden')
  localStorage.setItem(ONBOARDING_KEY, 'true')
}

function playMidnightCutscene(scene) {
  if (!midnightCutscene) return
  const flock = midnightCutscene.querySelector('.cutscene-flock')
  if (!flock) return

  flock.innerHTML = Array.from(scene.querySelectorAll('.budgie')).map((bird) => bird.outerHTML).join('')
  midnightCutscene.classList.remove('hidden')
  void midnightCutscene.offsetWidth
  midnightCutscene.classList.add('is-playing')
  setTimeout(() => {
    midnightCutscene.classList.remove('is-playing')
    midnightCutscene.classList.add('hidden')
    flock.innerHTML = ''
  }, 1450)
}

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

  // Set display currency dropdown to the saved preference, and load rates
  displayCurrencySelect.value = displayCurrency
  refreshExchangeRates()

  transactions = loadTransactions()
  trackDailyUsage()
  updateBudgieDesignSelector()
  updateUI()
  updateCountdown()

  // Start countdown timer
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(updateCountdown, 60000) // Update every minute

  if (!localStorage.getItem(ONBOARDING_KEY)) {
    startOnboarding()
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
  // Lets the browser extension's content script know the log just changed
  window.dispatchEvent(new CustomEvent('budgiet:tx-saved'))
}

// Fired by the Budgiet extension when it logs a transaction while this page is open
window.addEventListener('budgiet:refresh', () => {
  transactions = loadTransactions()
  updateUI()
})

function convertAmount(amount, fromCurrency, toCurrency) {
  const from = exchangeRates[fromCurrency] ?? 1
  const to = exchangeRates[toCurrency] ?? 1
  return (amount / from) * to
}

function formatCurrency(num, currency = displayCurrency){
  const abs = Math.abs(num)
  return (num < 0 ? '-' : '') + new Intl.NumberFormat(undefined, {style:'currency',currency,maximumFractionDigits:2}).format(abs)
}

let lastLeafState = 5

let sharedAudioCtx = null

// Reuses one AudioContext so rapid transactions don't hit browser context limits or miss scheduled sounds
function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx()
  }
  return sharedAudioCtx
}

function playChirp({ roaring = false } = {}) {
  const audioCtx = getAudioContext()
  if (!audioCtx) return Promise.resolve()

  const volume = roaring ? 0.26 : 0.08
  const scheduleChirps = () => {
    const chirp = (startOffset, startFrequency, endFrequency) => {
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      const startTime = audioCtx.currentTime + startOffset

      oscillator.type = roaring ? 'triangle' : 'sine'
      oscillator.frequency.setValueAtTime(startFrequency, startTime)
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + 0.07)
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency * 0.9, startTime + 0.12)

      gainNode.gain.setValueAtTime(0.0001, startTime)
      gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.012)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14)

      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      oscillator.start(startTime)
      oscillator.stop(startTime + 0.15)
    }

    if (roaring) {
      chirp(0, 1500, 3100)
      chirp(0.1, 1700, 3400)
      chirp(0.2, 1900, 3650)
      chirp(0.34, 2200, 3900)
    } else {
      chirp(0, 2400, 3300)
      chirp(0.11, 2800, 3700)
    }
  }

  if (audioCtx.state === 'suspended') {
    return audioCtx.resume().then(scheduleChirps).catch(() => {})
  }

  scheduleChirps()
  return Promise.resolve()
}

const HEALTH_CHIME_NOTES = {
  default: [660, 880],
  sunset: [660, 880, 990],
  rose: [660, 880, 990, 1320],
  midnight: [660, 880, 990, 1320, 1760]
}

// Bright ascending chime for income — gains an extra note per bird tier so it sounds richer as skins upgrade
function playHealthChime({ tier = 'default' } = {}) {
  const audioCtx = getAudioContext()
  if (!audioCtx) return Promise.resolve()

  const notes = HEALTH_CHIME_NOTES[tier] || HEALTH_CHIME_NOTES.default
  const volume = tier === 'midnight' ? 0.22 : tier === 'rose' ? 0.17 : tier === 'sunset' ? 0.13 : 0.11

  const scheduleChime = () => {
    notes.forEach((frequency, index) => {
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      const startTime = audioCtx.currentTime + index * 0.09

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, startTime)
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, startTime + 0.12)

      gainNode.gain.setValueAtTime(0.0001, startTime)
      gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.24)

      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      oscillator.start(startTime)
      oscillator.stop(startTime + 0.26)
    })
  }

  if (audioCtx.state === 'suspended') {
    return audioCtx.resume().then(scheduleChime).catch(() => {})
  }

  scheduleChime()
  return Promise.resolve()
}

function scrollToTreeIfMobile() {
  if (window.matchMedia('(max-width: 899px)').matches) {
    const target = document.querySelector('.tree-panel')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

function triggerExpenseAnimation() {
  const scene = document.querySelector('.budgie-scene')
  const tree = document.getElementById('tree')
  const waves = document.querySelectorAll('.sound-wave')
  const flash = document.getElementById('expense-flash')
  const dangerHearts = document.querySelectorAll('.danger-heart')
  if (!scene || !tree) return
  const design = scene.dataset.design || 'default'
  const impactDuration = design === 'midnight' ? 3200 : 760
  const releaseLeaves = (gustCount, gustDuration) => {
    const leaves = Array.from(document.querySelectorAll('.leaf'))
    leaves.forEach((leaf, index) => {
      leaf.classList.remove('blown-away', 'falling')
      void leaf.offsetWidth
      leaf.classList.add('blown-away')
      leaf.style.setProperty('--delay', `${index * 30}ms`)
    })

    for (let index = 0; index < gustCount; index += 1) {
      const gust = document.createElement('span')
      gust.className = 'cash-gust'
      gust.style.setProperty('--x', `${30 + (index % 6) * 28}px`)
      gust.style.setProperty('--y', `${55 + Math.floor(index / 6) * 26}px`)
      gust.style.setProperty('--delay', `${index * 42}ms`)
      tree.appendChild(gust)
      setTimeout(() => gust.remove(), gustDuration)
    }
  }

  scene.classList.remove('expense-impact', 'midnight-cutscene')
  tree.classList.remove('blowing', 'impact-sunset', 'impact-rose', 'impact-midnight', 'tree-under-attack')
  waves.forEach((wave) => {
    wave.classList.remove('active')
  })
  dangerHearts.forEach((heart) => heart.classList.remove('active'))
  if (flash) {
    flash.classList.remove('active')
  }

  void scene.offsetWidth
  scene.classList.add('expense-impact')
  tree.classList.add(`impact-${design}`)
  if (design === 'midnight') {
    scene.classList.add('midnight-cutscene')
    playMidnightCutscene(scene)
    setTimeout(() => playChirp({ roaring: true }), 220)
  }
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

  playChirp({ roaring: design === 'midnight' })

  if (design === 'midnight') {
    setTimeout(() => {
      scene.classList.remove('midnight-cutscene')
      tree.classList.remove('blowing', 'tree-under-attack', 'impact-midnight')
      waves.forEach((wave) => wave.classList.remove('active'))
      void tree.offsetWidth
      tree.classList.add('blowing', 'tree-under-attack', 'impact-midnight')
      waves.forEach((wave) => {
        void wave.offsetWidth
        wave.classList.add('active')
      })
      releaseLeaves(18, 1700)
    }, 1400)
  } else {
    const gustCount = design === 'rose' ? 10 : design === 'sunset' ? 5 : 0
    releaseLeaves(gustCount, impactDuration)
  }

  setTimeout(() => {
    tree.classList.remove('blowing', 'impact-sunset', 'impact-rose', 'impact-midnight', 'tree-under-attack')
    scene.classList.remove('midnight-cutscene')
    waves.forEach((wave) => wave.classList.remove('active'))
    dangerHearts.forEach((heart) => heart.classList.remove('active'))
    if (flash) {
      flash.classList.remove('active')
    }
  }, impactDuration)
}

const INCOME_BOOST_DURATIONS = { default: 780, sunset: 950, rose: 1100, midnight: 1650 }
const INCOME_PLUS_COUNTS = { default: 3, sunset: 6, rose: 9, midnight: 14 }

function triggerIncomeAnimation() {
  const scene = document.querySelector('.budgie-scene')
  const tree = document.getElementById('tree')
  const waves = document.querySelectorAll('.sound-wave')
  const flash = document.getElementById('income-flash')
  const joySparks = document.querySelectorAll('.joy-spark')
  if (!scene || !tree) return
  const design = scene.dataset.design || 'default'
  const boostDuration = INCOME_BOOST_DURATIONS[design] || INCOME_BOOST_DURATIONS.default

  const releasePlusMarks = (count, duration) => {
    for (let index = 0; index < count; index += 1) {
      const mark = document.createElement('span')
      mark.className = 'plus-mark'
      mark.style.setProperty('--x', `${22 + (index % 6) * 26}px`)
      mark.style.setProperty('--y', `${60 + Math.floor(index / 6) * 24}px`)
      mark.style.setProperty('--delay', `${index * 45}ms`)
      tree.appendChild(mark)
      setTimeout(() => mark.remove(), duration)
    }
  }

  scene.classList.remove('income-boost', 'income-glow')
  tree.classList.remove('growing', 'grow-default', 'grow-sunset', 'grow-rose', 'grow-midnight')
  waves.forEach((wave) => wave.classList.remove('active'))
  joySparks.forEach((spark) => spark.classList.remove('active'))
  if (flash) {
    flash.classList.remove('active')
  }

  void scene.offsetWidth
  scene.classList.add('income-boost')
  tree.classList.add('growing', `grow-${design}`)
  if (design === 'midnight') {
    scene.classList.add('income-glow')
  }

  waves.forEach((wave) => {
    void wave.offsetWidth
    wave.classList.add('active')
  })
  joySparks.forEach((spark) => {
    void spark.offsetWidth
    spark.classList.add('active')
  })
  if (flash) {
    void flash.offsetWidth
    flash.classList.add('active')
  }

  releasePlusMarks(INCOME_PLUS_COUNTS[design] || INCOME_PLUS_COUNTS.default, boostDuration)
  playHealthChime({ tier: design })

  setTimeout(() => {
    tree.classList.remove('growing', 'grow-default', 'grow-sunset', 'grow-rose', 'grow-midnight')
    scene.classList.remove('income-boost', 'income-glow')
    waves.forEach((wave) => wave.classList.remove('active'))
    joySparks.forEach((spark) => spark.classList.remove('active'))
    if (flash) {
      flash.classList.remove('active')
    }
  }, boostDuration)
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
  const incomes = transactions.filter(t => t.type === 'income')
    .reduce((s,t)=>s + convertAmount(Number(t.amount), t.currency || 'USD', displayCurrency), 0)
  const expenses = transactions.filter(t => t.type === 'expense')
    .reduce((s,t)=>s + convertAmount(Number(t.amount), t.currency || 'USD', displayCurrency), 0)
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

  let statusText = 'Add an income or expense to begin.'
  tree.classList.remove('tree-thriving', 'tree-healthy', 'tree-stressed', 'tree-empty')

  if (transactions.length === 0) {
    tree.classList.add('tree-empty')
  } else if (score >= 70) {
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

    if (tx.id === editingTransactionId) {
      li.classList.add('tx-editing')

      const editForm = document.createElement('div')
      editForm.className = 'tx-edit-form'

      const descInput = document.createElement('input')
      descInput.type = 'text'
      descInput.className = 'tx-edit-desc'
      descInput.value = tx.description
      descInput.setAttribute('aria-label', 'Edit description')

      const amountInput = document.createElement('input')
      amountInput.type = 'number'
      amountInput.step = '0.01'
      amountInput.className = 'tx-edit-amount'
      amountInput.value = tx.amount
      amountInput.setAttribute('aria-label', 'Edit amount')

      const editActions = document.createElement('div')
      editActions.className = 'tx-edit-actions'
      const saveBtn = document.createElement('button')
      saveBtn.type = 'button'
      saveBtn.className = 'tx-edit-save'
      saveBtn.textContent = 'Save'
      saveBtn.addEventListener('click', () => saveEditedTransaction(tx.id, descInput.value, amountInput.value))

      const cancelBtn = document.createElement('button')
      cancelBtn.type = 'button'
      cancelBtn.className = 'tx-edit-cancel'
      cancelBtn.textContent = 'Cancel'
      cancelBtn.addEventListener('click', () => cancelEditTransaction())

      editActions.appendChild(saveBtn)
      editActions.appendChild(cancelBtn)

      editForm.appendChild(descInput)
      editForm.appendChild(amountInput)
      editForm.appendChild(editActions)

      li.appendChild(editForm)
      txListEl.appendChild(li)
      return
    }

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
    const converted = convertAmount(Number(tx.amount), tx.currency || 'USD', displayCurrency)
    const signed = tx.type === 'income' ? converted : -Math.abs(converted)
    amt.textContent = formatCurrency(signed)

    const actions = document.createElement('div')
    actions.className = 'tx-actions'
    const edit = document.createElement('button')
    edit.title = 'Edit'
    edit.innerHTML = '✏️'
    edit.addEventListener('click', () => editTransaction(tx.id))
    actions.appendChild(edit)

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

function editTransaction(id){
  editingTransactionId = id
  renderTransactions()
}

function cancelEditTransaction(){
  editingTransactionId = null
  renderTransactions()
}

function saveEditedTransaction(id, description, amount){
  if (!description.trim() || amount === '' || Number.isNaN(Number(amount))) return
  const tx = transactions.find(t => t.id === id)
  if (!tx) return
  tx.description = description.trim()
  tx.amount = Number(amount)
  editingTransactionId = null
  saveTransactions()
  updateUI()
}

function addTransaction(description, amount, type, currency){
  scrollToTreeIfMobile()
  const tx = { id: Date.now(), description: description.trim(), amount: Number(amount), type, currency: currency || 'USD' }
  if (type === 'expense') {
    triggerExpenseAnimation()
  } else {
    triggerIncomeAnimation()
  }
  transactions.push(tx)
  saveTransactions()
  updateUI()
}

function removeTransaction(id){
  transactions = transactions.filter(t => t.id !== id)
  if (editingTransactionId === id) editingTransactionId = null
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
  const currency = txCurrencySelect.value
  if(!desc || !amount) return
  addTransaction(desc, amount, type, currency)
  form.reset()
  descEl.focus()
})

clearBtn.addEventListener('click', clearAll)

onboardingNextBtn.addEventListener('click', () => {
  onboardingIndex += 1
  if (onboardingIndex >= onboardingSteps.length) {
    finishOnboarding()
  } else {
    showOnboardingStep(onboardingIndex)
  }
})

onboardingSkipBtn.addEventListener('click', finishOnboarding)

window.addEventListener('resize', () => {
  if (!onboardingOverlay.classList.contains('hidden')) {
    positionOnboarding(onboardingSteps[onboardingIndex])
  }
})

budgieDesignButtons.forEach((button) => {
  button.addEventListener('click', () => selectBudgieDesign(button.dataset.budgieDesign))
})

periodSelect.addEventListener('change', (e) => {
  currentPeriod = e.target.value
  localStorage.setItem(PERIOD_KEY, currentPeriod)
  // Only recalculate the countdown for the new period length; keep existing transactions intact
  localStorage.removeItem(PERIOD_END_KEY)
  if (!localStorage.getItem(PERIOD_START_KEY)) {
    localStorage.setItem(PERIOD_START_KEY, new Date().toISOString())
  }
  updateUI()
  updateCountdown()
})

displayCurrencySelect.addEventListener('change', (e) => {
  displayCurrency = e.target.value
  localStorage.setItem(DISPLAY_CURRENCY_KEY, displayCurrency)
  updateUI()
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

menuToggleBtn.addEventListener('click', openSideMenu)
menuCloseButtons.forEach(btn => btn.addEventListener('click', closeSideMenu))
menuBackButtons.forEach(btn => btn.addEventListener('click', () => openMenuView('root')))
menuOpenButtons.forEach(btn => btn.addEventListener('click', () => openMenuView(btn.dataset.openView)))

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'dark' : 'light')
})

// init
init()

// Reflects the theme applied before first paint in the toggle switch
applyTheme(document.documentElement.dataset.theme || 'light')

// init
updateUI()
