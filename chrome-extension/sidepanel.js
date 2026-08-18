const STORAGE_KEY = 'budgiet_extension_transactions'

const addForm = document.getElementById('add-form')
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

async function loadTransactions() {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return result[STORAGE_KEY] || []
}

async function saveTransactions(transactions) {
  await chrome.storage.local.set({ [STORAGE_KEY]: transactions })
}

async function loadSummary() {
  const transactions = await loadTransactions()
  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const expenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const balance = income - expenses

  incomeEl.textContent = formatCurrency(income)
  expensesEl.textContent = formatCurrency(expenses)
  balanceEl.textContent = formatCurrency(balance)
}

addForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const description = document.getElementById('description').value.trim()
  const amount = document.getElementById('amount').value
  const type = document.getElementById('type').value

  if (!description || !amount) {
    setStatus('Description and amount are required.', 'error')
    return
  }

  try {
    const transactions = await loadTransactions()
    transactions.push({
      id: Date.now(),
      description,
      amount: Number(amount),
      type,
    })
    await saveTransactions(transactions)
    addForm.reset()
    setStatus(type === 'expense' ? 'Expense added successfully.' : 'Savings added successfully.', 'success')
    await loadSummary()
  } catch (error) {
    setStatus(error.message || 'Unable to add transaction', 'error')
  }
})

loadSummary().catch(() => {
  setStatus('Unable to load data.', 'error')
})
