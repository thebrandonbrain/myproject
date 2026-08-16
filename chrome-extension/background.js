chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
      console.error('Failed to configure side panel behavior:', error)
    })
  }
})
