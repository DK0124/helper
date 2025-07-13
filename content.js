// BV SHOP 出貨助手 - 嘉里大榮自動抓取專用
(function() {
  'use strict';

  let pdfJsLoaded = false;

  // 檢查是否為嘉里大榮頁面
  function isKTJPage() {
    return location.hostname.includes('bvshop-manage.bvshop.tw') &&
           location.pathname.includes('order_multi_print_ktj_logistics');
  }

  // 顯示通知
  function notify(msg) {
    alert(`[BV SHOP 出貨助手] ${msg}`);
  }

  // 載入 PDF.js
  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      if (pdfJsLoaded || window.pdfjsLib) {
        console.log('PDF.js 已載入');
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('libs/pdf.min.js');
      
      let timeout = setTimeout(() => {
        reject(new Error('PDF.js 載入超時'));
      }, 10000); // 10秒超時

      script.onload = () => {
        clearTimeout(timeout);
        // 直接檢查，CDN 版本會立即設定 window.pdfjsLib
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
            chrome.runtime.getURL('libs/pdf.worker.min.js');
          pdfJsLoaded = true;
          console.log('PDF.js 載入成功');
          resolve();
        } else {
          reject(new Error('載入後仍無 pdfjsLib'));
        }
      };

      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('無法載入 PDF.js'));
      };

      document.head.appendChild(script);
    });
  }

  // 抓取 PDF 內容
  async function grabPdf() {
    // 取得 PDF URL
    let pdfUrl = location.href;
    const embed = document.querySelector('embed[type="application/pdf"]');
    if (embed?.src) pdfUrl = embed.src;

    console.log('抓取 PDF:', pdfUrl);

    // 下載 PDF
    const response = await fetch(pdfUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    console.log(`PDF 共 ${pdf.numPages} 頁`);
    
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
      
      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: viewport
      }).promise;

      const orderNo = orderIds[i-1] || `KTJ${Date.now()}-${i}`;
      
      shippingData.push({
        html: `<div class="bv-shipping-wrapper" style="width:100%;max-width:105mm;margin:0 auto;background:white;">
                <img src="${canvas.toDataURL('image/png', 0.95)}" style="width:100%;height:auto;display:block;">
               </div>`,
        orderNo: orderNo,
        serviceCode: `KTJ${orderNo}`,
        width: '105mm',
        height: '148mm',
        index: i - 1,
        provider: 'ktj',
        isImage: true
      });
      
      console.log(`處理第 ${i}/${pdf.numPages} 頁`);
    }

    // 儲存
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
      notify('開始自動抓取...');
      await loadPdfJs();
      const count = await grabPdf();
      notify(`成功抓取 ${count} 張物流單！`);
    } catch (err) {
      console.error('錯誤:', err);
      notify(`失敗: ${err.message}`);
    }
  }

  // Console 指令
  window.bvCheckKTJ = () => {
    chrome.storage.local.get(['bvShippingData'], (r) => {
      const count = r.bvShippingData?.length || 0;
      alert(`已抓取 ${count} 張物流單`);
      console.log('資料:', r.bvShippingData);
    });
  };

  window.bvClearKTJ = () => {
    chrome.storage.local.clear(() => {
      alert('已清除資料');
    });
  };

  // 啟動
  if (isKTJPage()) {
    console.log('嘉里大榮頁面，1秒後開始抓取...');
    setTimeout(autoGrab, 1000);
  }

})();
