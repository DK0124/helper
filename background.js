// 背景腳本 - 處理截圖請求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureTab') {
    // 截取當前標籤頁
    chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: 'png',
      quality: 95
    }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('截圖失敗:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        // 儲存截圖
        const shippingData = request.orderIds.map((orderId, index) => ({
          html: `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;">
                  <img src="${dataUrl}" style="width:100%;display:block;">
                 </div>`,
          orderNo: orderId,
          serviceCode: `KTJ${orderId}`,
          width: '105mm',
          height: '148mm',
          index: index,
          provider: 'ktj',
          isImage: true
        }));

        chrome.storage.local.set({
          bvShippingData: shippingData,
          lastProvider: 'ktj',
          timestamp: Date.now()
        }, () => {
          sendResponse({ success: true });
        });
      }
    });
    
    return true; // 保持連線開啟
  }
});
