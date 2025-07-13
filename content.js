// BV SHOP 出貨助手 - 使用 Canvas API 直接截圖
(function() {
  'use strict';

  // 檢查頁面
  function isKTJPage() {
    return location.pathname.includes('order_multi_print_ktj_logistics');
  }

  // 通知
  function notify(msg) {
    alert(`[BV SHOP 出貨助手] ${msg}`);
  }

  // 方案 A: 直接截取 PDF 顯示區域
  async function captureVisiblePDF() {
    try {
      console.log('使用截圖方案...');
      
      // 找到 PDF 顯示元素
      const pdfFrame = document.querySelector('embed, object, iframe');
      if (!pdfFrame) {
        throw new Error('找不到 PDF 顯示元素');
      }

      // 取得訂單資訊
      const urlParams = new URLSearchParams(location.search);
      const orderIds = urlParams.get('ids')?.split(',') || [];
      
      // 建立截圖資料
      const shippingData = [];
      
      // 如果是單頁，直接截圖
      const rect = pdfFrame.getBoundingClientRect();
      
      // 建立 canvas
      const canvas = document.createElement('canvas');
      canvas.width = rect.width * 2; // 2x 解析度
      canvas.height = rect.height * 2;
      const ctx = canvas.getContext('2d');
      
      // 白色背景
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 通知使用者
      notify('PDF 無法自動解析，請手動擷取畫面或使用列印功能');
      
      // 提供替代方案
      const orderNo = orderIds[0] || `KTJ-${Date.now()}`;
      shippingData.push({
        html: `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;padding:10px;border:1px dashed #ccc;">
                <p style="text-align:center;color:#666;">
                  嘉里大榮物流單<br>
                  訂單編號: ${orderNo}<br>
                  <br>
                  請使用瀏覽器列印功能<br>
                  或手動擷取畫面
                </p>
               </div>`,
        orderNo: orderNo,
        serviceCode: `KTJ${orderNo}`,
        width: '105mm',
        height: '148mm',
        index: 0,
        provider: 'ktj',
        isPlaceholder: true
      });

      // 儲存
      await chrome.storage.local.set({
        bvShippingData: shippingData,
        lastProvider: 'ktj',
        timestamp: Date.now()
      });

      return shippingData.length;
      
    } catch (err) {
      console.error('截圖失敗:', err);
      throw err;
    }
  }

  // 方案 B: 使用瀏覽器 API 下載 PDF
  async function downloadPDFAsFile() {
    try {
      console.log('嘗試下載 PDF 檔案...');
      
      let pdfUrl = location.href;
      const embed = document.querySelector('embed[type="application/pdf"]');
      if (embed?.src) pdfUrl = embed.src;
      
      // 建立下載連結
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `KTJ_${Date.now()}.pdf`;
      link.target = '_blank';
      
      // 通知使用者
      notify('正在下載 PDF 檔案，請在下載完成後手動列印');
      
      // 觸發下載
      link.click();
      
      // 提供說明
      const urlParams = new URLSearchParams(location.search);
      const orderIds = urlParams.get('ids')?.split(',') || [];
      
      const shippingData = orderIds.map((id, index) => ({
        html: `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;padding:20px;border:2px solid #333;">
                <h3 style="text-align:center;">嘉里大榮物流單</h3>
                <p style="text-align:center;font-size:18px;margin:20px 0;">
                  訂單編號: ${id || `KTJ-${index + 1}`}
                </p>
                <hr>
                <p style="text-align:center;color:#666;margin-top:20px;">
                  PDF 已下載<br>
                  請開啟檔案並列印
                </p>
               </div>`,
        orderNo: id || `KTJ-${index + 1}`,
        serviceCode: `KTJ${id || index + 1}`,
        width: '105mm',
        height: '148mm',
        index: index,
        provider: 'ktj',
        isPlaceholder: true
      }));

      // 儲存
      await chrome.storage.local.set({
        bvShippingData: shippingData,
        lastProvider: 'ktj',
        timestamp: Date.now(),
        pdfUrl: pdfUrl
      });

      return shippingData.length;
      
    } catch (err) {
      console.error('下載失敗:', err);
      throw err;
    }
  }

  // 主流程 - 使用備用方案
  async function autoGrab() {
    try {
      console.log('=== 開始抓取（備用方案）===');
      notify('偵測到 PDF.js 無法載入，使用備用方案...');
      
      // 嘗試下載 PDF
      const count = await downloadPDFAsFile();
      
      console.log('=== 處理完成 ===');
      
    } catch (err) {
      console.error('錯誤:', err);
      notify(`失敗: ${err.message}`);
    }
  }

  // Console 指令
  window.bvCheckKTJ = function() {
    chrome.storage.local.get(['bvShippingData', 'timestamp', 'pdfUrl'], (result) => {
      const count = result.bvShippingData?.length || 0;
      if (count === 0) {
        alert('尚未處理任何物流單');
      } else {
        const time = result.timestamp ? new Date(result.timestamp).toLocaleString() : '未知';
        let msg = `已處理 ${count} 張物流單\n時間: ${time}`;
        if (result.pdfUrl) {
          msg += `\nPDF 位址: ${result.pdfUrl}`;
        }
        alert(msg);
        console.log('資料:', result);
      }
    });
  };

  window.bvClearKTJ = function() {
    if (confirm('確定要清除所有資料？')) {
      chrome.storage.local.clear(() => {
        alert('已清除');
      });
    }
  };

  // 手動開啟 PDF
  window.bvOpenPDF = function() {
    chrome.storage.local.get(['pdfUrl'], (result) => {
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      } else {
        alert('找不到 PDF 連結');
      }
    });
  };

  // 啟動
  if (isKTJPage()) {
    console.log('%c偵測到嘉里大榮物流單頁面', 'color: blue; font-weight: bold;');
    console.log('指令: bvCheckKTJ(), bvClearKTJ(), bvOpenPDF()');
    console.log('由於安全限制，將使用下載方案');
    
    // 延遲執行
    setTimeout(autoGrab, 1500);
  }

})();
