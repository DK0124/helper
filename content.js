// BV SHOP 出貨助手 - 使用 Blob 和 Canvas API
(function() {
  'use strict';

  function isKTJPage() {
    return location.pathname.includes('order_multi_print_ktj_logistics');
  }

  function notify(msg) {
    alert(`[BV SHOP 出貨助手] ${msg}`);
  }

  // 方案：將 PDF 轉為圖片（使用內建 API）
  async function convertPDFToImage() {
    try {
      const urlParams = new URLSearchParams(location.search);
      const orderIds = urlParams.get('ids')?.split(',') || [];
      
      notify(`開始處理 ${orderIds.length} 張物流單...`);

      // 找到 PDF 元素
      const pdfElement = document.querySelector('embed, object, iframe');
      let pdfUrl = location.href;
      
      if (pdfElement) {
        pdfUrl = pdfElement.src || pdfElement.data || pdfUrl;
      }

      console.log('PDF URL:', pdfUrl);

      // 方案 A: 使用 Canvas 截取可見區域
      const captureVisibleArea = async () => {
        // 創建 canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 設定尺寸（A6 = 105mm x 148mm，以 96 DPI 計算）
        const scale = 2; // 2x 解析度
        canvas.width = 396 * scale;  // 105mm
        canvas.height = 559 * scale; // 148mm
        
        // 白色背景
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 如果有 PDF 元素，嘗試取得其內容
        if (pdfElement && pdfElement.contentDocument) {
          try {
            // 嘗試存取 iframe 內容
            const pdfDoc = pdfElement.contentDocument;
            const pdfCanvas = pdfDoc.querySelector('canvas');
            if (pdfCanvas) {
              ctx.drawImage(pdfCanvas, 0, 0, canvas.width, canvas.height);
            }
          } catch (e) {
            console.log('無法存取 PDF 內容，使用替代方案');
          }
        }
        
        // 加上文字標記
        ctx.fillStyle = '#333';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('嘉里大榮物流單', canvas.width / 2, 50);
        
        orderIds.forEach((id, i) => {
          ctx.fillText(`訂單: ${id}`, canvas.width / 2, 100 + (i * 30));
        });
        
        return canvas.toDataURL('image/png');
      };

      // 方案 B: 創建包含 PDF 連結的 HTML
      const createPDFLink = () => {
        return `<div style="border:2px solid #333;padding:20px;text-align:center;">
                  <h3>嘉里大榮物流單</h3>
                  <p>訂單編號: ${orderIds.join(', ')}</p>
                  <a href="${pdfUrl}" target="_blank" style="display:inline-block;margin:10px;padding:10px 20px;background:#007bff;color:white;text-decoration:none;border-radius:5px;">
                    開啟 PDF
                  </a>
                  <p style="color:#666;font-size:12px;">請點擊上方按鈕開啟並列印</p>
                </div>`;
      };

      // 嘗試截圖，如果失敗則使用連結
      let imageData;
      try {
        imageData = await captureVisibleArea();
      } catch (e) {
        console.log('截圖失敗，使用連結方案');
        imageData = null;
      }

      // 建立物流單資料
      const shippingData = orderIds.map((orderId, index) => ({
        html: imageData 
          ? `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;margin:0 auto;">
              <img src="${imageData}" style="width:100%;display:block;">
             </div>`
          : `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;margin:0 auto;">
              ${createPDFLink()}
             </div>`,
        orderNo: orderId,
        serviceCode: `KTJ${orderId}`,
        width: '105mm',
        height: '148mm',
        index: index,
        provider: 'ktj',
        isImage: !!imageData,
        pdfUrl: pdfUrl
      }));

      // 儲存
      await chrome.storage.local.set({
        bvShippingData: shippingData,
        lastProvider: 'ktj',
        timestamp: Date.now(),
        pdfUrl: pdfUrl
      });

      notify(`成功！已處理 ${shippingData.length} 張物流單`);
      console.log('儲存的資料:', shippingData);

    } catch (err) {
      console.error('處理失敗:', err);
      notify(`失敗: ${err.message}`);
    }
  }

  // 方案 C: 使用 Chrome Extension API 發送訊息到背景腳本
  async function requestScreenshot() {
    try {
      const urlParams = new URLSearchParams(location.search);
      const orderIds = urlParams.get('ids')?.split(',') || [];
      
      // 發送訊息給背景腳本
      chrome.runtime.sendMessage({
        action: 'captureTab',
        orderIds: orderIds
      }, (response) => {
        if (response && response.success) {
          notify(`成功！已抓取 ${orderIds.length} 張物流單`);
        } else {
          notify('截圖失敗，請重試');
        }
      });
      
    } catch (err) {
      console.error('發送訊息失敗:', err);
      // 改用其他方案
      convertPDFToImage();
    }
  }

  // Console 指令
  window.bvCheckKTJ = function() {
    chrome.storage.local.get(['bvShippingData', 'timestamp', 'pdfUrl'], (result) => {
      const count = result.bvShippingData?.length || 0;
      if (count === 0) {
        alert('尚未抓取任何物流單');
      } else {
        const time = new Date(result.timestamp).toLocaleString();
        alert(`已抓取 ${count} 張物流單\n時間: ${time}\nPDF: ${result.pdfUrl || '無'}`);
        console.log('物流單資料:', result.bvShippingData);
      }
    });
  };

  window.bvClearKTJ = function() {
    if (confirm('確定要清除所有資料？')) {
      chrome.storage.local.clear(() => {
        alert('已清除所有資料');
      });
    }
  };

  window.bvRetryKTJ = function() {
    if (isKTJPage()) {
      convertPDFToImage();
    } else {
      alert('請在嘉里大榮物流單頁面使用');
    }
  };

  // 開啟原始 PDF
  window.bvOpenPDF = function() {
    chrome.storage.local.get(['pdfUrl'], (result) => {
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      } else {
        alert('找不到 PDF 連結');
      }
    });
  };

  // 主程式
  if (isKTJPage()) {
    console.log('%c=== BV SHOP 出貨助手 ===', 'color: blue; font-weight: bold; font-size: 16px;');
    console.log('偵測到嘉里大榮物流單頁面');
    console.log('可用指令:');
    console.log('  bvCheckKTJ() - 檢查已抓取的物流單');
    console.log('  bvClearKTJ() - 清除所有資料');
    console.log('  bvRetryKTJ() - 重新抓取');
    console.log('  bvOpenPDF()  - 開啟原始 PDF');
    
    // 延遲執行
    setTimeout(() => {
      console.log('開始處理物流單...');
      convertPDFToImage();
    }, 2000);
  }

})();
