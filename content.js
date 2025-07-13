// BV SHOP 出貨助手 - 使用 Chrome 截圖 API
(function() {
  'use strict';

  function isKTJPage() {
    return location.pathname.includes('order_multi_print_ktj_logistics');
  }

  async function captureUsingChromeAPI() {
    try {
      // 取得訂單資訊
      const urlParams = new URLSearchParams(location.search);
      const orderIds = urlParams.get('ids')?.split(',') || [];
      
      alert(`[BV SHOP] 開始處理 ${orderIds.length} 張物流單...`);
      
      // 等待頁面完全載入
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 請求背景腳本截圖
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({action: 'capturePDF'}, resolve);
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // 建立物流單資料
      const shippingData = orderIds.map((orderId, index) => ({
        html: `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;">
                <img src="${response.dataUrl}" style="width:100%;display:block;">
               </div>`,
        orderNo: orderId,
        serviceCode: `KTJ${orderId}`,
        width: '105mm',
        height: '148mm',
        index: index,
        provider: 'ktj',
        isImage: true
      }));

      // 儲存
      await chrome.storage.local.set({
        bvShippingData: shippingData,
        lastProvider: 'ktj',
        timestamp: Date.now()
      });

      alert(`[BV SHOP] 成功！已抓取 ${shippingData.length} 張物流單`);
      
    } catch (err) {
      console.error('截圖失敗:', err);
      alert(`[BV SHOP] 失敗: ${err.message}`);
    }
  }

  if (isKTJPage()) {
    console.log('嘉里大榮頁面 - 3秒後開始截圖');
    setTimeout(captureUsingChromeAPI, 3000);
  }

  window.bvCheckKTJ = () => {
    chrome.storage.local.get(['bvShippingData'], r => {
      alert(`已抓取 ${r.bvShippingData?.length || 0} 張物流單`);
    });
  };

})();
