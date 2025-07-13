// 監聽截圖請求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capturePDF') {
    // 使用 Chrome API 截圖
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({error: chrome.runtime.lastError.message});
      } else {
        sendResponse({dataUrl: dataUrl});
      }
    });
    return true;
  }
});
