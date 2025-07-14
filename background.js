// BV SHOP 出貨助手 - 背景腳本 (簡化版)
// 僅負責注入 content.js，處理下載請求

chrome.action.onClicked.addListener(async (tab) => {
  // 嘗試發送 ping
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    if (resp && resp.status === 'pong') {
      await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
      return;
    }
  } catch (e) {}

  // 注入 content.js
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
  await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadPDF' && request.url) {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename || 'kerry_shipping.pdf',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }
  return false;
});
