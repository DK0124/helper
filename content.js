// BV SHOP 出貨助手 - 嘉里大榮自動抓取專用（自動、無面板、有通知）
(function() {
  'use strict';

  // 載入狀態
  let isPdfJsLoading = false;
  let isPdfJsLoaded = false;

  // 1. 檢查是不是嘉里大榮物流單頁
  function isKTJPage() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    return (
      hostname.includes('bvshop-manage.bvshop.tw') &&
      pathname.includes('order_multi_print_ktj_logistics')
    );
  }

  // 2. 顯示通知
  function showNotification(msg) {
    alert(`[BV SHOP 出貨助手] ${msg}`);
  }

  // 3. 載入 PDF.js - 使用更直接的方式
  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      // 如果已經載入
      if (window.pdfjsLib) {
        console.log('PDF.js 已經載入');
        resolve();
        return;
      }

      // 防止重複載入
      if (isPdfJsLoading) {
        const checkInterval = setInterval(() => {
          if (window.pdfjsLib) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        return;
      }

      isPdfJsLoading = true;
      
      // 使用 fetch 載入並直接 eval（繞過 CSP 問題）
      fetch(chrome.runtime.getURL('libs/pdf.js'))
        .then(response => response.text())
        .then(code => {
          // 在全域執行
          const scriptElement = document.createElement('script');
          scriptElement.textContent = code;
          document.head.appendChild(scriptElement);
          
          // 等待執行完成
          setTimeout(() => {
            if (window.pdfjsLib || window['pdfjs-dist/build/pdf']) {
              window.pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.js');
              isPdfJsLoaded = true;
              isPdfJsLoading = false;
              console.log('PDF.js 載入成功');
              resolve();
            } else {
              isPdfJsLoading = false;
              reject(new Error('PDF.js 載入失敗：找不到 pdfjsLib'));
            }
          }, 500);
        })
        .catch(error => {
          isPdfJsLoading = false;
          reject(error);
        });
    });
  }

  // 4. 主要的 PDF 抓取函數
  async function grabPdfContent() {
    try {
      // 取得 PDF 檔案
      let pdfUrl = window.location.href;
      
      // 檢查是否有 embed 或 object 標籤
      const embed = document.querySelector('embed[type="application/pdf"]');
      if (embed && embed.src) pdfUrl = embed.src;
      
      const object = document.querySelector('object[type="application/pdf"]');
      if (object && object.data) pdfUrl = object.data;

      console.log('準備抓取 PDF:', pdfUrl);

      // 抓取 PDF
      const response = await fetch(pdfUrl, {
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/pdf'
        }
      });
      
      if (!response.ok) throw new Error(`取得 PDF 失敗: ${response.status}`);
      
      const pdfData = await response.arrayBuffer();
      console.log('PDF 大小:', pdfData.byteLength, 'bytes');

      // 載入 PDF
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      console.log(`PDF 共有 ${pdf.numPages} 頁`);
      
      let shippingData = [];
      
      // 轉換每一頁
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const scale = 2; // 2x 解析度
        const viewport = page.getViewport({ scale });
        
        // 創建 canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        // 渲染頁面
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        await page.render(renderContext).promise;
        
        // 轉換為圖片
        const imgDataUrl = canvas.toDataURL('image/png', 0.95);

        // 從 URL 取得訂單編號
        const urlParams = new URLSearchParams(window.location.search);
        const ids = urlParams.get('ids')?.split(',') || [];
        const orderNo = ids[pageNum - 1] || `KTJ-${Date.now()}-${pageNum}`;

        shippingData.push({
          html: `<div class="bv-shipping-wrapper" style="width: 100%; max-width: 105mm; margin: 0 auto; background: white; position: relative;">
                  <img src="${imgDataUrl}" style="width: 100%; height: auto; display: block;">
                </div>`,
          orderNo: orderNo,
          serviceCode: `KTJ${orderNo}`,
          width: '105mm',
          height: '148mm',
          index: pageNum - 1,
          provider: 'ktj',
          isImage: true
        });
        
        console.log(`已處理第 ${pageNum}/${pdf.numPages} 頁`);
      }

      // 存到 chrome.storage
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({
          bvShippingData: shippingData,
          lastProvider: 'ktj',
          timestamp: Date.now()
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      showNotification(`已自動抓取 ${shippingData.length} 張嘉里大榮物流單！請切到出貨明細頁合併列印`);
      
    } catch (err) {
      console.error('抓取錯誤:', err);
      showNotification('自動抓取失敗：' + err.message);
    }
  }

  // 5. 自動抓取的入口函數
  async function autoGrabKTJShipping() {
    try {
      showNotification('開始自動抓取嘉里大榮物流單...');
      
      // 載入 PDF.js
      await loadPdfJs();
      
      // 執行抓取
      await grabPdfContent();
      
    } catch (err) {
      console.error('載入或抓取失敗:', err);
      showNotification('失敗：' + err.message);
    }
  }

  // 6. 檢查函數
  window.bvCheckKTJ = function() {
    chrome.storage.local.get(['bvShippingData'], (result) => {
      if (!result.bvShippingData || result.bvShippingData.length === 0) {
        alert('尚未抓到任何物流單');
        console.log('chrome.storage 內容:', result);
      } else {
        alert(`目前已抓到 ${result.bvShippingData.length} 張物流單`);
        console.log('物流單資料:', result.bvShippingData);
        console.log('第一張預覽:', result.bvShippingData[0]);
      }
    });
  };

  // 7. 清除資料函數
  window.bvClearKTJ = function() {
    chrome.storage.local.remove(['bvShippingData', 'lastProvider', 'timestamp'], () => {
      alert('已清除所有物流單資料');
      console.log('資料已清除');
    });
  };

  // 8. 主程式入口
  if (isKTJPage()) {
    console.log('偵測到嘉里大榮物流單頁面');
    
    setTimeout(() => {
      console.log('%c=== BV SHOP 出貨助手 ===', 'color: #5865F2; font-weight:bold; font-size: 16px;');
      console.log('%c可用指令：', 'color: #5865F2; font-weight:bold;');
      console.log('%c  bvCheckKTJ() - 檢查抓取的物流單', 'color: green;');
      console.log('%c  bvClearKTJ() - 清除所有資料', 'color: orange;');
      
      // 開始自動抓取
      autoGrabKTJShipping();
    }, 1000);
  }

})();
