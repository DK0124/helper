// BV SHOP 出貨助手 - 嘉里大榮自動抓取專用（自動、無面板、有通知）
(function() {
  'use strict';

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

  // 3. 自動抓 PDF → 圖片 → 存儲
  async function autoGrabKTJShipping() {
    try {
      showNotification('開始自動抓取嘉里大榮物流單...');
      // 載入 pdf.js
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('libs/pdf.js');
      script.onload = function() {
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.js');
        // 你的自動抓取流程
        autoGrabKTJShipping();
      };
      document.head.appendChild(script);

      // 取得 PDF 檔案
      let pdfUrl = window.location.href;
      const embed = document.querySelector('embed[type="application/pdf"]');
      if (embed && embed.src) pdfUrl = embed.src;
      const object = document.querySelector('object[type="application/pdf"]');
      if (object && object.data) pdfUrl = object.data;

      const response = await fetch(pdfUrl, {credentials: 'same-origin'});
      if (!response.ok) throw new Error('取得 PDF 失敗');
      const pdfData = await response.arrayBuffer();

      // 解析 PDF
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      let shippingData = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const imgDataUrl = canvas.toDataURL('image/png', 0.95);

        // 訂單編號
        const urlParams = new URLSearchParams(window.location.search);
        const ids = urlParams.get('ids')?.split(',') || [];
        const orderNo = ids[pageNum - 1] || `KTJ-${pageNum}`;

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
            if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
            res();
          }
        );
      });

      showNotification(`已自動抓取 ${shippingData.length} 張嘉里大榮物流單！請切到出貨明細頁合併列印`);
    } catch (err) {
      showNotification('自動抓取失敗：' + err.message);
    }
  }

  // 4. 教你怎麼用 console 檢查有沒有抓到
  window.bvCheckKTJ = function() {
    chrome.storage.local.get(['bvShippingData'], (result) => {
      if (!result.bvShippingData) {
        alert('尚未抓到任何物流單');
      } else {
        alert(`目前已抓到 ${result.bvShippingData.length} 張物流單`);
        console.log(result.bvShippingData);
      }
    });
  };

  // 5. 教學提示
  if (isKTJPage()) {
    setTimeout(() => {
      console.log('%c[教學] 檢查有沒有抓到物流單，請在 Console 輸入：', 'color: #5865F2; font-weight:bold;');
      console.log('%cbvCheckKTJ()', 'color: green; font-weight:bold;');
    }, 2000);
    autoGrabKTJShipping();
  }
})();
