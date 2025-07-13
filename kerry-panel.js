// 嘉里大榮控制面板邏輯
let currentPdfUrl = null;
let processedData = null;
let isProcessing = false;

// DOM 元素
const elements = {
  statusText: document.getElementById('status-text'),
  progressBar: document.getElementById('progress-bar'),
  progressFill: document.getElementById('progress-fill'),
  processBtn: document.getElementById('process-btn'),
  manualUploadBtn: document.getElementById('manual-upload-btn'),
  manualFileInput: document.getElementById('manual-file-input'),
  gotoDetailBtn: document.getElementById('goto-detail-btn'),
  resultInfo: document.getElementById('result-info'),
  previewSection: document.getElementById('preview-section'),
  previewContainer: document.getElementById('preview-container'),
  closeBtn: document.getElementById('close-btn')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 檢查是否有已儲存的處理結果
  chrome.storage.local.get(['kerryProcessedPages', 'kerrySourceUrl'], (result) => {
    if (result.kerryProcessedPages && result.kerryProcessedPages.length > 0) {
      processedData = result.kerryProcessedPages;
      updateResultDisplay();
    }
    
    if (result.kerrySourceUrl) {
      elements.statusText.textContent = `已連接到: ${new URL(result.kerrySourceUrl).hostname}`;
    }
  });
  
  // 自動偵測當前標籤頁的 PDF
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      checkForPdf(tabs[0]);
    }
  });
});

// 檢查標籤頁是否有 PDF
function checkForPdf(tab) {
  if (tab.url.includes('.pdf')) {
    currentPdfUrl = tab.url;
    elements.statusText.textContent = '已偵測到 PDF 檔案';
    elements.processBtn.disabled = false;
  } else {
    // 嘗試在頁面中尋找 PDF
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: findPdfInPage
    }, (results) => {
      if (results && results[0] && results[0].result) {
        currentPdfUrl = results[0].result;
        elements.statusText.textContent = '已偵測到嵌入的 PDF';
        elements.processBtn.disabled = false;
      }
    });
  }
}

// 在頁面中尋找 PDF
function findPdfInPage() {
  // 尋找 embed 或 object 標籤
  const embed = document.querySelector('embed[src*=".pdf"]');
  if (embed) return embed.src;
  
  const object = document.querySelector('object[data*=".pdf"]');
  if (object) return object.data;
  
  // 尋找 iframe
  const iframe = document.querySelector('iframe[src*=".pdf"]');
  if (iframe) return iframe.src;
  
  return null;
}

// 監聽來自其他部分的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pdfUrlReady') {
    currentPdfUrl = request.pdfUrl;
    elements.statusText.textContent = '已偵測到 PDF';
    elements.processBtn.disabled = false;
  }
});

// 處理按鈕點擊
elements.processBtn.addEventListener('click', () => {
  if (currentPdfUrl && !isProcessing) {
    processPdf(currentPdfUrl);
  }
});

// 手動上傳按鈕
elements.manualUploadBtn.addEventListener('click', () => {
  elements.manualFileInput.click();
});

// 手動選擇檔案
elements.manualFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file && file.type === 'application/pdf') {
    // 轉換為 data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      currentPdfUrl = event.target.result;
      elements.statusText.textContent = `已選擇檔案: ${file.name}`;
      elements.processBtn.disabled = false;
      processPdf(currentPdfUrl, true);
    };
    reader.readAsDataURL(file);
  }
});

// 前往出貨明細頁面
elements.gotoDetailBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://bvshop-manage.bvshop.tw/order_print'
  });
});

// 關閉按鈕
elements.closeBtn.addEventListener('click', () => {
  window.close();
});

// 處理 PDF
async function processPdf(pdfUrl, isDataUrl = false) {
  if (isProcessing) return;
  
  isProcessing = true;
  elements.processBtn.disabled = true;
  elements.progressBar.style.display = 'block';
  elements.statusText.textContent = '正在處理 PDF...';
  
  try {
    let result;
    
    if (isDataUrl) {
      // 如果是 data URL，直接在這裡處理
      result = await processDataUrlPdf(pdfUrl);
    } else {
      // 否則發送給 background script 處理
      result = await chrome.runtime.sendMessage({
        action: 'processKerryPdf',
        pdfUrl: pdfUrl
      });
    }
    
    if (result.success) {
      processedData = result.pages;
      
      // 儲存處理後的資料
      await chrome.storage.local.set({
        kerryProcessedPages: processedData,
        kerryProcessTime: Date.now()
      });
      
      elements.statusText.textContent = '處理完成！';
      elements.progressFill.style.width = '100%';
      
      updateResultDisplay();
      showPreview();
      
      // 延遲後提示
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
    elements.statusText.textContent = '處理失敗';
    elements.resultInfo.innerHTML = `
      <p class="error-message">
        <span class="material-icons">error</span>
        ${error.message}
      </p>
    `;
    console.error('處理 PDF 時發生錯誤:', error);
  } finally {
    isProcessing = false;
    elements.processBtn.disabled = false;
    setTimeout(() => {
      elements.progressBar.style.display = 'none';
      elements.progressFill.style.width = '0%';
    }, 2000);
  }
}

// 處理 data URL 格式的 PDF
async function processDataUrlPdf(dataUrl) {
  // 從 data URL 提取 base64 數據
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // 載入 PDF
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  
  loadingTask.onProgress = (progress) => {
    const percent = (progress.loaded / progress.total) * 100;
    elements.progressFill.style.width = percent + '%';
  };
  
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  const processedPages = [];
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    elements.statusText.textContent = `處理第 ${pageNum}/${numPages} 頁...`;
    
    const page = await pdf.getPage(pageNum);
    const scale = 3.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // 轉換為高品質 JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    
    processedPages.push({
      pageNum,
      dataUrl,
      width: viewport.width / scale,
      height: viewport.height / scale
    });
  }
  
  return {
    success: true,
    pages: processedPages,
    totalPages: numPages
  };
}

// 更新結果顯示
function updateResultDisplay() {
  if (!processedData || processedData.length === 0) return;
  
  elements.resultInfo.innerHTML = `
    <div class="result-stats">
      <div class="stat-item">
        <span class="material-icons">check_circle</span>
        <span>成功處理 ${processedData.length} 頁</span>
      </div>
      <div class="stat-item">
        <span class="material-icons">image</span>
        <span>已轉換為高品質圖片</span>
      </div>
      <div class="stat-item">
        <span class="material-icons">save</span>
        <span>資料已儲存</span>
      </div>
    </div>
    <p class="success-message">可前往出貨明細頁面進行列印</p>
  `;
}

// 顯示預覽
function showPreview() {
  if (!processedData || processedData.length === 0) return;
  
  elements.previewSection.style.display = 'block';
  elements.previewContainer.innerHTML = '';
  
  // 只顯示前 3 頁預覽
  const maxPreview = Math.min(3, processedData.length);
  
  for (let i = 0; i < maxPreview; i++) {
    const page = processedData[i];
    const previewItem = document.createElement('div');
    previewItem.className = 'preview-item';
    previewItem.innerHTML = `
      <h5>第 ${page.pageNum} 頁</h5>
      <img src="${page.dataUrl}" alt="第 ${page.pageNum} 頁">
    `;
    elements.previewContainer.appendChild(previewItem);
  }
  
  if (processedData.length > 3) {
    const moreInfo = document.createElement('p');
    moreInfo.className = 'more-info';
    moreInfo.textContent = `... 還有 ${processedData.length - 3} 頁`;
    elements.previewContainer.appendChild(moreInfo);
  }
}
