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

  // 3. 載入 PDF.js（只載入一次）
  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      // 檢查各種可能的位置
      const checkPdfLib = () => {
        return window.pdfjsLib || 
               globalThis.pdfjsLib || 
               window['pdfjs-dist/build/pdf'] ||
               globalThis['pdfjs-dist/build/pdf'];
      };
      
      let pdfLib = checkPdfLib();
      if (pdfLib) {
        window.pdfjsLib = pdfLib;
        isPdfJsLoaded = true;
        console.log('PDF.js 已存在');
        resolve();
        return;
      }

      if (isPdfJsLoading) {
        const checkInterval = setInterval(() => {
          pdfLib = checkPdfLib();
          if (pdfLib) {
            window.pdfjsLib = pdfLib;
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        return;
      }

      isPdfJsLoading = true;
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('libs/pdf.js');
      
      script.onload = function() {
        // 給一點時間讓 script 執行
        setTimeout(() => {
          const pdfLib = checkPdfLib();
          
          if (pdfLib) {
            // 確保掛到 window 上
            window.pdfjsLib = pdfLib;
            
            // 設定 worker
            try {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.js');
            } catch (e) {
              console.error('設定 worker 失敗:', e);
            }
            
            isPdfJsLoaded = true;
            isPdfJsLoading = false;
            console.log('PDF.js 載入成功，版本:', window.pdfjsLib.version);
            resolve();
          } else {
            console.error('載入後找不到 pdfjsLib');
            console.log('window:', Object.keys(window).filter(k => k.includes('pdf')));
            console.log('globalThis:', Object.keys(globalThis).filter(k => k.includes('pdf')));
            isPdfJsLoading = false;
            reject(new Error('PDF.js 載入後找不到 pdfjsLib'));
          }
        }, 200); // 增加延遲時間
      };
      
      script.onerror = function(error) {
        console.error('Script 載入錯誤:', error);
        isPdfJsLoading = false;
        reject(new Error('PDF.js 檔案載入失敗'));
      };
      
      document.head.appendChild(script);
    });
  }

  // 4. 主要的 PDF 抓取函數（不再處理載入）
  async function grabPdfContent() {
    try {
      // 取得 PDF 檔案
      let pdfUrl = window.location.href;
      const embed = document.querySelector('embed[type="application/pdf"]');
      if (embed && embed.src) pdfUrl = embed.src;
      const object = document.querySelector('object[type="application/pdf"]');
      if (object && object.data) pdfUrl = object.data;

      console.log('準備抓取 PDF:', pdfUrl);

      const response = await fetch(pdfUrl, {credentials: 'same-origin'});
      if (!response.ok) throw new Error(`取得 PDF 失敗: ${response.status}`);
      const pdfData = await response.arrayBuffer();

      // 使用 window.pdfjsLib
      const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
      console.log(`PDF 共有 ${pdf.numPages} 頁`);
      
      let shippingData = [];
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        await page.render({ 
          canvasContext: context, 
          viewport: viewport 
        }).promise;
        
        const imgDataUrl = canvas.toDataURL('image/png', 0.95);

        // 訂單編號
        const urlParams = new URLSearchParams(window.location.search);
        const ids = urlParams.get('ids')?.split(',') || [];
        const orderNo = ids[pageNum - 1] || `KTJ-${Date.now()}-${pageNum}`;

        shippingData.push({
          html: `<div class="bv-shipping-wrapper" style="width: 100%; max-width: 105mm; margin: 0 auto; background: white; position: relative;">
                  <img src="${imgDataUrl}" style="width: 100%; height: auto; display: block;">
                </div>`,
          orderNo,
          serviceCode: `KTJ${orderNo}`,
          width: '105mm',
          height: '148mm',
          index: pageNum - 1,
          provider: 'ktj',
          isImage: true
        });
        
        console.log(`已處理第 ${pageNum}/${pdf.numPages} 頁`);
      }

      // 存到 chrome.storage.local
      await new Promise((res, rej) => {
        chrome.storage.local.set(
          {
            bvShippingData: shippingData,
            lastProvider: 'ktj',
            timestamp: Date.now()
          },
          () => {
            if (chrome.runtime.lastError) {
              return rej(chrome.runtime.lastError);
            }
            res();
          }
        );
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
      
      // 先載入 PDF.js
      await loadPdfJs();
      
      // 再執行抓取
      await grabPdfContent();
      
    } catch (err) {
      console.error('載入或抓取失敗:', err);
      showNotification('失敗：' + err.message);
    }
  }

  // 6. 檢查函數（給 Console 用）
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

  // 7. 清除資料函數（除錯用）
  window.bvClearKTJ = function() {
    chrome.storage.local.remove(['bvShippingData', 'lastProvider', 'timestamp'], () => {
      alert('已清除所有物流單資料');
      console.log('資料已清除');
    });
  };

  // 8. 主程式入口
  if (isKTJPage()) {
    console.log('偵測到嘉里大榮物流單頁面');
    console.log('頁面 URL:', window.location.href);
    
    // 延遲一下再開始，確保頁面載入完成
    setTimeout(() => {
      console.log('%c=== BV SHOP 出貨助手 ===', 'color: #5865F2; font-weight:bold; font-size: 16px;');
      console.log('%c可用指令：', 'color: #5865F2; font-weight:bold;');
      console.log('%c  bvCheckKTJ() - 檢查抓取的物流單', 'color: green;');
      console.log('%c  bvClearKTJ() - 清除所有資料', 'color: orange;');
      
      // 開始自動抓取
      autoGrabKTJShipping();
    }, 1000);
  } else {
    // 不是嘉里大榮頁面，提供檢查功能
    window.bvCheckKTJ = function() {
      chrome.storage.local.get(['bvShippingData'], (result) => {
        if (!result.bvShippingData || result.bvShippingData.length === 0) {
          alert('尚未抓到任何物流單');
        } else {
          alert(`目前已抓到 ${result.bvShippingData.length} 張物流單\n請到出貨明細頁進行列印`);
          console.log('物流單資料:', result.bvShippingData);
        }
      });
    };
  }

})();
