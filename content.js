// BV SHOP 出貨助手 - 最終版（使用 CDN）
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

  // 載入 PDF.js (從 CDN)
  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        console.log('PDF.js 已存在');
        resolve();
        return;
      }

      // 使用 CDNJS 的穩定版本
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      
      script.onload = () => {
        if (window.pdfjsLib) {
          // 設定 worker 也使用 CDN
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          console.log('PDF.js 載入成功 (CDN)');
          resolve();
        } else {
          reject(new Error('載入失敗'));
        }
      };
      
      script.onerror = () => reject(new Error('無法載入 CDN'));
      document.head.appendChild(script);
    });
  }

  // 抓取 PDF
  async function grabPdf() {
    // 找 PDF URL
    let pdfUrl = location.href;
    const embed = document.querySelector('embed[type="application/pdf"]');
    if (embed?.src) pdfUrl = embed.src;

    console.log('抓取 PDF:', pdfUrl);

    // 下載 PDF
    const response = await fetch(pdfUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('PDF 大小:', (arrayBuffer.byteLength / 1024).toFixed(2), 'KB');
    
    // 解析 PDF
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log(`共 ${pdf.numPages} 頁`);
    
    const shippingData = [];
    const urlParams = new URLSearchParams(location.search);
    const orderIds = urlParams.get('ids')?.split(',') || [];

    // 處理每一頁
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      
      await page.render({ canvasContext: ctx, viewport }).promise;

      const orderNo = orderIds[i-1] || `KTJ-${Date.now()}-${i}`;
      
      shippingData.push({
        html: `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;margin:0 auto;">
                <img src="${canvas.toDataURL('image/png', 0.95)}" style="width:100%;display:block;">
               </div>`,
        orderNo: orderNo,
        serviceCode: `KTJ${orderNo}`,
        width: '105mm',
        height: '148mm',
        index: i - 1,
        provider: 'ktj',
        isImage: true
      });
      
      console.log(`✓ 第 ${i}/${pdf.numPages} 頁`);
    }

    // 儲存到 storage
    await chrome.storage.local.set({
      bvShippingData: shippingData,
      lastProvider: 'ktj',
      timestamp: Date.now()
    });

    return shippingData.length;
  }

  // 主流程
  async function autoGrab() {
    try {
      console.log('=== 開始自動抓取 ===');
      notify('開始抓取嘉里大榮物流單...');
      
      await loadPdfJs();
      const count = await grabPdf();
      
      notify(`成功！已抓取 ${count} 張物流單`);
      console.log('=== 抓取完成 ===');
      
    } catch (err) {
      console.error('錯誤:', err);
      notify(`失敗: ${err.message}`);
    }
  }

  // Console 指令
  window.bvCheckKTJ = function() {
    chrome.storage.local.get(['bvShippingData', 'timestamp'], (result) => {
      const count = result.bvShippingData?.length || 0;
      if (count === 0) {
        alert('尚未抓取任何物流單');
      } else {
        const time = result.timestamp ? new Date(result.timestamp).toLocaleString() : '未知';
        alert(`已抓取 ${count} 張物流單\n時間: ${time}`);
        console.log('物流單資料:', result.bvShippingData);
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

  window.bvRetryKTJ = function() {
    if (isKTJPage()) {
      autoGrab();
    } else {
      alert('請在嘉里大榮頁面使用');
    }
  };

  // 啟動
  if (isKTJPage()) {
    console.log('%c偵測到嘉里大榮物流單頁面', 'color: blue; font-weight: bold;');
    console.log('指令: bvCheckKTJ(), bvClearKTJ(), bvRetryKTJ()');
    
    // 延遲執行
    setTimeout(autoGrab, 1500);
  }

})();
