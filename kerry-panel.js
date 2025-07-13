// 嘉里大榮控制面板邏輯
let currentPdfUrl = null;
let processedData = null;

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'kerryPdfDetected') {
    currentPdfUrl = request.pdfUrl;
    document.getElementById('status-text').textContent = '已偵測到 PDF';
    document.getElementById('process-btn').disabled = false;
  }
});

// 處理按鈕點擊
document.getElementById('process-btn').addEventListener('click', async () => {
  if (!currentPdfUrl) return;
  
  const statusText = document.getElementById('status-text');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const processBtn = document.getElementById('process-btn');
  const resultInfo = document.getElementById('result-info');
  
  processBtn.disabled = true;
  progressBar.style.display = 'block';
  statusText.textContent = '正在處理 PDF...';
  
  try {
    // 發送處理請求到 background script
    const result = await chrome.runtime.sendMessage({
      action: 'processKerryPdf',
      pdfUrl: currentPdfUrl
    });
    
    if (result.success) {
      processedData = result.pages;
      
      // 儲存處理後的資料
      await chrome.storage.local.set({
        kerryProcessedPages: processedData,
        kerryProcessTime: Date.now()
      });
      
      statusText.textContent = '處理完成！';
      progressFill.style.width = '100%';
      resultInfo.innerHTML = `
        <p>✓ 成功處理 ${result.totalPages} 頁</p>
        <p>✓ 資料已儲存，可前往出貨明細頁面</p>
      `;
      
      // 自動開啟出貨明細頁面
      setTimeout(() => {
        if (confirm('PDF 處理完成！是否前往出貨明細頁面？')) {
          chrome.tabs.create({
            url: 'https://bvshop-manage.bvshop.tw/order_print'
          });
        }
      }, 1000);
      
    } else {
      throw new Error(result.error || '處理失敗');
    }
    
  } catch (error) {
    statusText.textContent = '處理失敗';
    resultInfo.innerHTML = `<p style="color: red;">✗ ${error.message}</p>`;
    processBtn.disabled = false;
  }
});

// 前往出貨明細頁面
document.getElementById('goto-detail-btn').addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://bvshop-manage.bvshop.tw/order_print'
  });
});
