const SHARED_TX_KEY = 'budgiet_shared_transactions'
const SHARED_CURRENCY_KEY = 'budgiet_shared_currency'
const SHARED_RATES_KEY = 'budgiet_shared_rates'

// Approximate fallback used only when the main page hasn't synced live rates yet
const STATIC_FALLBACK_RATES = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151, AUD: 1.52, CAD: 1.36,
  INR: 83.3, CNY: 7.24, SGD: 1.34, CHF: 0.88, MYR: 4.47, IDR: 15800
}

const addForm = document.getElementById('add-form')
const descriptionEl = document.getElementById('description')
const amountEl = document.getElementById('amount')
const currencyEl = document.getElementById('currency')
const typeButtons = document.querySelectorAll('.type-btn')
const statusBox = document.getElementById('status')
const incomeEl = document.getElementById('income')
const expensesEl = document.getElementById('expenses')
const balanceEl = document.getElementById('balance')
const balanceCardEl = document.getElementById('balance-card')
const syncNoteEl = document.getElementById('sync-note')
const heroBudgieEl = document.getElementById('hero-budgie')

let selectedType = 'expense'

function setStatus(message, kind = '') {
  statusBox.textContent = message
  statusBox.className = 'status'
  if (kind) statusBox.classList.add(kind)
}

function setActiveType(type) {
  selectedType = type
  typeButtons.forEach(btn => {
    const isActive = btn.dataset.type === type
    btn.classList.toggle('is-active', isActive)
    btn.setAttribute('aria-pressed', String(isActive))
  })
}

typeButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveType(btn.dataset.type))
})

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch (e) {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function convertAmount(amount, fromCurrency, toCurrency, rates) {
  const from = rates[fromCurrency] ?? 1
  const to = rates[toCurrency] ?? 1
  return (amount / from) * to
}

async function getSharedState() {
  const result = await chrome.storage.local.get([SHARED_TX_KEY, SHARED_CURRENCY_KEY, SHARED_RATES_KEY])
  return {
    transactions: result[SHARED_TX_KEY] || [],
    currency: result[SHARED_CURRENCY_KEY] || 'SGD',
    rates: result[SHARED_RATES_KEY] || STATIC_FALLBACK_RATES,
  }
}

function computeSummary(transactions, displayCurrency, rates) {
  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + convertAmount(Number(t.amount), t.currency || 'USD', displayCurrency, rates), 0)
  const expenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + convertAmount(Number(t.amount), t.currency || 'USD', displayCurrency, rates), 0)
  return { income, expenses, balance: income - expenses }
}

async function refreshSummary() {
  const { transactions, currency, rates } = await getSharedState()
  const { income, expenses, balance } = computeSummary(transactions, currency, rates)

  incomeEl.textContent = formatCurrency(income, currency)
  expensesEl.textContent = formatCurrency(expenses, currency)
  balanceEl.textContent = formatCurrency(balance, currency)
  balanceCardEl.classList.toggle('negative', balance < 0)

  syncNoteEl.textContent = transactions.length
    ? `Tracking ${transactions.length} transaction${transactions.length === 1 ? '' : 's'} in ${currency}`
    : 'No transactions yet — add your first one below.'

  if (!currencyEl.dataset.touched) {
    currencyEl.value = currency
  }
}

function celebrate() {
  heroBudgieEl.classList.remove('is-celebrating')
  void heroBudgieEl.offsetWidth
  heroBudgieEl.classList.add('is-celebrating')
}

currencyEl.addEventListener('change', () => {
  currencyEl.dataset.touched = 'true'
})

addForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const description = descriptionEl.value.trim()
  const amount = Number(amountEl.value)
  const currency = currencyEl.value
  const type = selectedType

  if (!description || !amount || amount <= 0) {
    setStatus('Description and a valid amount are required.', 'error')
    return
  }

  try {
    const { transactions } = await getSharedState()
    const tx = { id: Date.now(), description, amount, type, currency }
    await chrome.storage.local.set({ [SHARED_TX_KEY]: [...transactions, tx] })

    addForm.reset()
    currencyEl.value = currency
    setActiveType('expense')
    setStatus(
      type === 'expense' ? '🍂 Expense logged — your tree felt that!' : '✨ Income logged — your tree is growing!',
      'success'
    )
    celebrate()
    await refreshSummary()
  } catch (error) {
    setStatus(error.message || 'Unable to add transaction', 'error')
  }
})

// Keeps the balance live if the extension or the main page changes data while this panel is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes[SHARED_TX_KEY] || changes[SHARED_CURRENCY_KEY] || changes[SHARED_RATES_KEY]) {
    refreshSummary()
  }
})

refreshSummary().catch(() => {
  setStatus('Unable to load data.', 'error')
})

