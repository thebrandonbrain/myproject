// Bridges the Budgiet web app's localStorage with the extension's shared chrome.storage,
// so the sidepanel and the main page always agree on the same transaction log.
const TX_KEY = 'pocketpilot_tx_v1'
const CURRENCY_KEY = 'budgiet_display_currency'
const RATE_CACHE_KEY = 'budgiet_rate_cache'

const SHARED_TX_KEY = 'budgiet_shared_transactions'
const SHARED_CURRENCY_KEY = 'budgiet_shared_currency'
const SHARED_RATES_KEY = 'budgiet_shared_rates'

function readPageTransactions() {
  try {
    return JSON.parse(localStorage.getItem(TX_KEY) || '[]')
  } catch (e) {
    return []
  }
}

function writePageTransactions(list) {
  localStorage.setItem(TX_KEY, JSON.stringify(list))
}

function readPageRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || 'null')
    return cached && cached.rates ? cached.rates : null
  } catch (e) {
    return null
  }
}

// Combines two transaction lists into one, keeping a single entry per id
function mergeTransactions(a, b) {
  const byId = new Map()
  ;[...a, ...b].forEach(tx => byId.set(tx.id, tx))
  return Array.from(byId.values()).sort((x, y) => x.id - y.id)
}

function notifyPageToRefresh() {
  window.dispatchEvent(new CustomEvent('budgiet:refresh'))
}

// Pushes whatever the page currently knows about into the extension's shared storage
function syncPageToExtension() {
  const payload = {
    [SHARED_TX_KEY]: readPageTransactions(),
    [SHARED_CURRENCY_KEY]: localStorage.getItem(CURRENCY_KEY) || 'SGD',
  }
  const rates = readPageRates()
  if (rates) payload[SHARED_RATES_KEY] = rates
  chrome.storage.local.set(payload)
}

// On page load, pull in any transactions the extension logged while this page was closed
chrome.storage.local.get([SHARED_TX_KEY], (result) => {
  const pending = result[SHARED_TX_KEY] || []
  const local = readPageTransactions()
  const merged = mergeTransactions(local, pending)
  if (merged.length !== local.length) {
    writePageTransactions(merged)
    notifyPageToRefresh()
  }
  syncPageToExtension()
})

// The page dispatches this right after it saves a transaction of its own
window.addEventListener('budgiet:tx-saved', syncPageToExtension)

// The sidepanel writes directly to shared storage; mirror new entries into the page live
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[SHARED_TX_KEY]) return
  const incoming = changes[SHARED_TX_KEY].newValue || []
  const local = readPageTransactions()
  const merged = mergeTransactions(local, incoming)
  if (merged.length !== local.length) {
    writePageTransactions(merged)
    notifyPageToRefresh()
  }
})
