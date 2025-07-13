// BV SHOP 出貨助手 - 簡化版（使用 html2canvas）
(function() {
  'use strict';

  function isKTJPage() {
    return location.pathname.includes('order_multi_print_ktj_logistics');
  }

  function notify(msg) {
    alert(`[BV SHOP 出貨助手] ${msg}`);
  }

  // 動態載入 html2canvas
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function captureAndSave() {
    try {
      // 載入 html2canvas
      if (!window.html2canvas) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      }

      const urlParams = new URLSearchParams(location.search);
      const orderIds = urlParams.get('ids')?.split(',') || [];
      
      notify(`開始處理 ${orderIds.length} 張物流單，請稍候...`);

      // 等待 PDF 完全載入
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 找到要截圖的元素
      let targetElement = document.querySelector('embed, object, iframe');
      if (!targetElement) {
        // 如果找不到，就截整個 body
        targetElement = document.body;
      }

      // 執行截圖
      const canvas = await html2canvas(targetElement, {
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      // 轉換為圖片
      const imgData = canvas.toDataURL('image/png');

      // 建立物流單資料
      const shippingData = orderIds.map((orderId, index) => ({
        html: `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;margin:0 auto;page-break-after:always;">
                <img src="${imgData}" style="width:100%;display:block;">
                <div style="text-align:center;margin-top:5px;font-size:12px;">訂單 ${orderId}</div>
               </div>`,
        orderNo: orderId,
        serviceCode: `KTJ${orderId}`,
        width: '105mm',
        height: '148mm',
        index: index,
        provider: 'ktj',
        isImage: true
      }));

      // 儲存到 storage
      await chrome.storage.local.set({
        bvShippingData: shippingData,
        lastProvider: 'ktj',
        timestamp: Date.now()
      });

      notify(`成功！已抓取 ${shippingData.length} 張物流單`);
      console.log('物流單資料已儲存:', shippingData);

    } catch (err) {
      console.error('處理失敗:', err);
      notify(`失敗: ${err.message}`);
    }
  }

  // 檢查功能
  window.bvCheckKTJ = function() {
    chrome.storage.local.get(['bvShippingData', 'timestamp'], (result) => {
      const count = result.bvShippingData?.length || 0;
      if (count === 0) {
        alert('尚未抓取任何物流單');
      } else {
        const time = new Date(result.timestamp).toLocaleString();
        alert(`已抓取 ${count} 張物流單\n時間: ${time}`);
        console.log('物流單資料:', result.bvShippingData);
      }
    });
  };

  // 清除功能
  window.bvClearKTJ = function() {
    if (confirm('確定要清除所有資料？')) {
      chrome.storage.local.clear(() => {
        alert('已清除所有資料');
      });
    }
  };

  // 手動重抓
  window.bvRetryKTJ = function() {
    if (isKTJPage()) {
      captureAndSave();
    } else {
      alert('請在嘉里大榮物流單頁面使用此功能');
    }
  };

  // 主程式
  if (isKTJPage()) {
    console.log('%c偵測到嘉里大榮物流單頁面', 'color: blue; font-weight: bold;');
    console.log('可用指令: bvCheckKTJ(), bvClearKTJ(), bvRetryKTJ()');
    
    // 延遲執行，確保頁面載入完成
    setTimeout(captureAndSave, 2000);
  }

})();
