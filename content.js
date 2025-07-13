// 在原本的 content.js 最後加入這些功能

// 顯示儲存的物流單（新功能）
window.bvShowKTJ = function() {
  chrome.storage.local.get(['bvShippingData', 'timestamp'], (result) => {
    if (!result.bvShippingData || result.bvShippingData.length === 0) {
      alert('沒有找到物流單資料');
      return;
    }

    // 創建顯示視窗
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      z-index: 99999;
      overflow: auto;
      padding: 20px;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      border-radius: 10px;
    `;

    const time = result.timestamp ? new Date(result.timestamp).toLocaleString() : '未知';
    
    content.innerHTML = `
      <h2>BV SHOP 出貨助手 - 已抓取的物流單</h2>
      <p>抓取時間: ${time}</p>
      <p>數量: ${result.bvShippingData.length} 張</p>
      <hr>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin: 20px 0;">
        ${result.bvShippingData.map((item, index) => `
          <div style="border: 1px solid #ddd; padding: 10px; text-align: center;">
            <h4>物流單 ${index + 1}</h4>
            <p>訂單: ${item.orderNo}</p>
            <p>代碼: ${item.serviceCode}</p>
            ${item.isImage ? '<span style="color:green">✓ 已截圖</span>' : '<span style="color:orange">⚠ 連結</span>'}
          </div>
        `).join('')}
      </div>
      <hr>
      <button onclick="this.parentElement.parentElement.remove()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">關閉</button>
      <button onclick="bvExportKTJ()" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">匯出資料</button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // 點擊背景關閉
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  });
};

// 匯出資料功能
window.bvExportKTJ = function() {
  chrome.storage.local.get(['bvShippingData', 'timestamp', 'pdfUrl'], (result) => {
    if (!result.bvShippingData) {
      alert('沒有資料可匯出');
      return;
    }

    // 創建 HTML 檔案
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>嘉里大榮物流單 - ${new Date().toLocaleDateString()}</title>
  <style>
    @media print {
      .no-print { display: none; }
      .page-break { page-break-after: always; }
    }
    body { font-family: Arial, sans-serif; margin: 20px; }
    .shipping-label { 
      width: 105mm; 
      margin: 0 auto 20px; 
      border: 1px solid #ddd; 
      padding: 10px;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <h1>嘉里大榮物流單</h1>
    <p>抓取時間: ${new Date(result.timestamp).toLocaleString()}</p>
    <p>共 ${result.bvShippingData.length} 張</p>
    ${result.pdfUrl ? `<p>原始 PDF: <a href="${result.pdfUrl}" target="_blank">${result.pdfUrl}</a></p>` : ''}
    <hr>
    <button onclick="window.print()">列印</button>
    <hr>
  </div>
  
  ${result.bvShippingData.map((item, index) => `
    <div class="shipping-label ${index < result.bvShippingData.length - 1 ? 'page-break' : ''}">
      ${item.html}
    </div>
  `).join('')}
</body>
</html>`;

    // 下載檔案
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KTJ_物流單_${new Date().getTime()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('已匯出 HTML 檔案，可以開啟並列印');
  });
};

// 列印功能
window.bvPrintKTJ = function() {
  chrome.storage.local.get(['bvShippingData'], (result) => {
    if (!result.bvShippingData || result.bvShippingData.length === 0) {
      alert('沒有物流單可列印');
      return;
    }

    // 開啟新視窗列印
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>列印物流單</title>
  <style>
    @media print {
      .page-break { page-break-after: always; }
    }
    body { margin: 0; padding: 0; }
    .shipping-label { 
      width: 105mm; 
      height: 148mm;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  ${result.bvShippingData.map((item, index) => `
    <div class="shipping-label ${index < result.bvShippingData.length - 1 ? 'page-break' : ''}">
      ${item.html}
    </div>
  `).join('')}
</body>
</html>`);
    
    printWindow.document.close();
    printWindow.onload = function() {
      printWindow.print();
    };
  });
};

// 更新說明
if (isKTJPage()) {
  console.log('%c=== BV SHOP 出貨助手 ===', 'color: blue; font-weight: bold; font-size: 16px;');
  console.log('可用指令:');
  console.log('%c  bvCheckKTJ()  - 快速檢查', 'color: green;');
  console.log('%c  bvShowKTJ()   - 視覺化顯示（新）', 'color: green;');
  console.log('%c  bvExportKTJ() - 匯出 HTML 檔案（新）', 'color: green;');
  console.log('%c  bvPrintKTJ()  - 直接列印（新）', 'color: green;');
  console.log('%c  bvClearKTJ()  - 清除資料', 'color: orange;');
  console.log('%c  bvOpenPDF()   - 開啟原始 PDF', 'color: blue;');
}
