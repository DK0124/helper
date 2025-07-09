// BV SHOP 出貨助手 - 內容腳本 (完整修正版)
(function() {
  'use strict';
  
  console.log('BV SHOP 出貨助手已載入');
  
  // 全域變數
  let currentPage = detectCurrentPage();
  let shippingData = [];
  let detailData = [];
  let savedLogos = { shipping: null, detail: null };
  let panelActive = false;
  
  // 偵測當前頁面類型
  function detectCurrentPage() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    // 7-11 物流單頁面
    if (hostname.includes('myship.7-11.com.tw') || 
        hostname.includes('epayment.7-11.com.tw') ||
        hostname.includes('eship.7-11.com.tw')) {
      return { type: 'shipping', provider: 'seven' };
    } 
    // 全家物流單
    else if (hostname.includes('family.com.tw') || 
             hostname.includes('famiport.com.tw')) {
      return { type: 'shipping', provider: 'family' };
    } 
    // 萊爾富物流單
    else if (hostname.includes('hilife.com.tw')) {
      return { type: 'shipping', provider: 'hilife' };
    } 
    // OK 超商
    else if (hostname.includes('okmart.com.tw')) {
      return { type: 'shipping', provider: 'okmart' };
    }
    // BV SHOP 後台
    else if (hostname.includes('bvshop')) {
      if (pathname.includes('order')) {
        return { type: 'detail', provider: 'bvshop' };
      }
    }
    
    return { type: 'unknown', provider: null };
  }
  
  // === 圖片處理工具函數 ===
  
  function convertImgToBase64(img) {
    return new Promise((resolve) => {
      // 如果已經是 base64，直接返回
      if (img.src.startsWith('data:')) {
        resolve(img.src);
        return;
      }
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const image = new Image();
      
      // 重要：設定 crossOrigin
      image.crossOrigin = 'anonymous';
      
      image.onload = function() {
        // 使用原始圖片尺寸
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        
        // 繪製圖片
        ctx.drawImage(image, 0, 0);
        
        try {
          // 轉換為 base64
          const dataURL = canvas.toDataURL('image/png');
          resolve(dataURL);
        } catch (e) {
          console.error('圖片轉換失敗:', e);
          // 如果轉換失敗，嘗試使用 JPEG 格式
          try {
            const dataURL = canvas.toDataURL('image/jpeg', 0.95);
            resolve(dataURL);
          } catch (e2) {
            console.error('JPEG 轉換也失敗:', e2);
            resolve(img.src); // 最後返回原始 src
          }
        }
      };
      
      image.onerror = function() {
        console.error('圖片載入失敗:', img.src);
        resolve(img.src); // 失敗時返回原始 src
      };
      
      // 對於 .ashx 動態圖片，確保完整的 URL
      if (img.src.includes('.ashx')) {
        const fullUrl = new URL(img.src, window.location.href).href;
        image.src = fullUrl;
      } else {
        image.src = img.src;
      }
    });
  }
  
  async function processImagesToBase64(container) {
    const imgs = container.querySelectorAll('img');
    const promises = [];
    
    imgs.forEach(img => {
      if (!img.src.startsWith('data:')) {
        promises.push(
          convertImgToBase64(img).then(base64 => {
            img.src = base64;
          })
        );
      }
    });
    
    await Promise.all(promises);
  }
  
  // === 物流單頁面專用函數 ===
  
  function injectShippingPanel() {
    if (document.getElementById('bv-shipping-panel')) return;
    
    // 建立浮動面板
    const panel = document.createElement('div');
    panel.id = 'bv-shipping-panel';
    panel.innerHTML = `
      <div class="bv-panel-header">
        <h3>BV SHOP 出貨助手</h3>
        <div class="bv-panel-controls">
          <button class="bv-icon-btn" id="bv-minimize-btn" title="最小化">
            <span style="font-size: 20px; line-height: 1;">－</span>
          </button>
        </div>
      </div>
      
      <div class="bv-panel-body">
        <div class="bv-status-display">
          <div class="bv-status-count" id="bv-count">0</div>
          <div class="bv-status-text">張物流單已抓取</div>
        </div>
        
        <button class="bv-button primary pulse" id="bv-fetch-btn">
          重新抓取物流單
        </button>
        
        <div class="bv-info-text">
          <strong>操作步驟：</strong><br>
          1. 點擊「重新抓取物流單」<br>
          2. 至後台「更多操作」>「列印出貨單」<br>
          3. 點選擴充功能中的「BV SHOP 出貨助手」
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // 事件監聽
    document.getElementById('bv-minimize-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
    });
    
    document.getElementById('bv-fetch-btn').addEventListener('click', fetchShippingData);
    
    // 更新狀態
    updateShippingPanelStatus();
  }
  
  function updateShippingPanelStatus() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bvShippingData'], (result) => {
        const count = document.getElementById('bv-count');
        const fetchBtn = document.getElementById('bv-fetch-btn');
        if (count && result.bvShippingData) {
          count.textContent = result.bvShippingData.length;
          if (result.bvShippingData.length > 0 && fetchBtn) {
            fetchBtn.classList.remove('pulse');
          }
        }
      });
    }
  }
  
  // 修正 fetchShippingData - 使用舊版的簡單方法
  async function fetchShippingData() {
    const btn = document.getElementById('bv-fetch-btn');
    btn.disabled = true;
    btn.innerHTML = '抓取中...';
    
    shippingData = [];
    
    if (currentPage.provider === 'seven') {
      // 使用舊版成功的方法
      const tables = document.querySelectorAll('table');
      const shippingTables = [];
      
      // 找出包含物流單的表格
      tables.forEach(table => {
        const text = table.textContent;
        const hasShippingKeywords = text.includes('交貨便') || 
                                   text.includes('統一超商') ||
                                   text.includes('7-11') ||
                                   text.includes('寄件編號');
        
        if (hasShippingKeywords) {
          // 檢查是否為獨立的物流單表格
          const parentTd = table.closest('td[style*="border"]');
          if (parentTd) {
            // 確保不重複添加
            if (!shippingTables.includes(parentTd)) {
              shippingTables.push(parentTd);
            }
          } else {
            // 如果沒有找到 td，可能整個 table 就是物流單
            shippingTables.push(table);
          }
        }
      });
      
      console.log('找到的物流單數量:', shippingTables.length);
      
      shippingTables.forEach((element, index) => {
        const clone = element.cloneNode(true);
        
        // 不做任何圖片處理，保持原始狀態
        // 只確保相對路徑的圖片有完整 URL
        clone.querySelectorAll('img').forEach(img => {
          if (img.src && !img.src.startsWith('data:') && !img.src.startsWith('http')) {
            img.src = new URL(img.src, window.location.href).href;
          }
        });
        
        // 找訂單編號
        let orderNo = '';
        const text = clone.textContent;
        const orderMatch = text.match(/訂單[編號]*[:：]?\s*(\w+)/) || 
                          text.match(/寄件訂單編號[:：]?\s*(\d+)/) ||
                          text.match(/寄件[編號]*[:：]?\s*(\w+)/) ||
                          text.match(/E\d{10,}/);
        if (orderMatch) {
          orderNo = orderMatch[1] || orderMatch[0];
        }
        
        // 確保有實際內容
        if (clone.textContent.trim().length > 50) {
          shippingData.push({
            html: clone.outerHTML,
            orderNo: orderNo,
            index: index
          });
        }
      });
    }
    
    // 儲存資料
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ 
        bvShippingData: shippingData,
        lastProvider: currentPage.provider 
      }, () => {
        btn.disabled = false;
        btn.innerHTML = '重新抓取物流單';
        btn.classList.remove('pulse');
        updateShippingPanelStatus();
        
        if (shippingData.length > 0) {
          showNotification(`成功抓取 ${shippingData.length} 張物流單`, 'success');
        } else {
          showNotification('未找到物流單，請確認頁面是否正確', 'warning');
        }
      });
    }
  }
  
  // 修正 generateShippingPage - 考慮實際尺寸差異
  function generateShippingPage(data, settings, orderNo) {
    if (!data || !data.html) return '';
    
    // 7-11 物流單實際是 100×140mm，但印在 100×150mm 紙上
    // 所以需要垂直置中，上下各留 5mm
    const verticalOffset = currentPage.provider === 'seven' ? 5 : 0;
    
    return `
      <div style="
        width: ${settings.paper.width}mm;
        height: ${settings.paper.height}mm;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: white;
      ">
        <!-- 物流單內容 -->
        <div style="
          position: relative;
          transform: scale(${settings.paper.scale / 100});
          transform-origin: center center;
        ">
          ${data.html}
          
          <!-- 訂單編號標籤 -->
          ${settings.showOrderNumber && orderNo ? `
            <div style="
              position: absolute;
              top: ${settings.orderLabelTop}mm;
              left: 50%;
              transform: translateX(-50%);
              background: white;
              padding: 2px 8px;
              border: 1px solid #333;
              border-radius: 3px;
              font-size: ${settings.orderLabelSize}px;
              font-weight: bold;
              z-index: 10;
            ">
              訂單編號：${orderNo}
            </div>
          ` : ''}
          
          <!-- Logo -->
          ${settings.shipping.logo ? `
            <img src="${settings.shipping.logo}" style="
              position: absolute;
              top: ${settings.shipping.logoY}%;
              left: ${settings.shipping.logoX}%;
              transform: translate(-50%, -50%);
              width: ${settings.shipping.logoSize}mm;
              opacity: ${1 - (settings.shipping.logoOpacity / 100)};
              pointer-events: none;
              z-index: 5;
            ">
          ` : ''}
        </div>
      </div>
    `;
  }
  
  function loadExternalResources() {
    if (!document.querySelector('link[href*="Material+Icons"]')) {
      const iconLink = document.createElement('link');
      iconLink.rel = 'stylesheet';
      iconLink.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
      document.head.appendChild(iconLink);
    }
    
    if (!document.querySelector('link[href*="Noto+Sans+TC"]')) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap';
      document.head.appendChild(fontLink);
    }
  }
  
  function getDetailPanelHTML() {
    return `
      <div class="bv-panel-header">
        <h3>
          <span class="material-icons">local_shipping</span>
          BV SHOP 出貨助手
        </h3>
        <div class="bv-panel-controls">
          <button class="bv-icon-btn" id="bv-exit-btn" title="退出擴充程式">
            <span class="material-icons">exit_to_app</span>
          </button>
        </div>
      </div>
      
      <div class="bv-panel-body">
        <!-- 設定檔區塊 -->
        <div class="bv-preset-section">
          <div class="bv-preset-row">
            <select id="bv-preset-select">
              <option value="">-- 選擇設定檔 --</option>
            </select>
            <button class="bv-icon-button" id="bv-save-preset" title="儲存設定">
              <span class="material-icons">save</span>
            </button>
            <button class="bv-icon-button" id="bv-delete-preset" title="刪除設定">
              <span class="material-icons">delete</span>
            </button>
            <button class="bv-icon-button reset-button" id="bv-reset-format" title="清除格式">
              <span class="material-icons">restart_alt</span>
            </button>
          </div>
          <div class="bv-preset-row" id="bv-save-preset-row" style="display:none; margin-top: 10px;">
            <input type="text" id="bv-new-preset-name" placeholder="輸入設定檔名稱" style="width: 100%;">
            <button class="bv-small-button primary" id="bv-confirm-save">確認</button>
            <button class="bv-small-button" id="bv-cancel-save">取消</button>
          </div>
        </div>
        
        <!-- 資料狀態區 -->
        <div class="bv-section">
          <div class="bv-section-header">
            <h4>
              <span class="material-icons bv-section-icon">inventory</span>
              資料狀態
            </h4>
          </div>
          <div class="bv-section-content">
            <div class="bv-status-display">
              <div class="bv-status-item">
                <span>物流單：</span>
                <span id="bv-shipping-count" class="bv-status-badge">未抓取</span>
              </div>
              <div class="bv-status-item">
                <span>出貨明細：</span>
                <span id="bv-detail-count" class="bv-status-badge">未抓取</span>
              </div>
            </div>
            
            <div class="bv-button-group" style="margin-top: 12px;">
              <button class="bv-button secondary" id="bv-clear-data">
                <span class="material-icons">refresh</span>
                清除重抓
              </button>
            </div>
          </div>
        </div>
        
        <!-- 基本設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="basic">
            <h4>
              <span class="material-icons bv-section-icon">tune</span>
              基本設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content" id="basic-content">
            <div class="bv-control-group">
              <div class="bv-control-group-title">紙張設定（統一）</div>
              <div class="bv-control-label">
                <span>紙張寬度</span>
                <span class="bv-value-badge" id="bv-paper-width-value">100mm</span>
              </div>
              <input type="range" id="bv-paper-width" min="50" max="300" value="100" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>紙張高度</span>
                <span class="bv-value-badge" id="bv-paper-height-value">150mm</span>
              </div>
              <input type="range" id="bv-paper-height" min="50" max="400" value="150" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>縮放比例</span>
                <span class="bv-value-badge" id="bv-scale-value">100%</span>
              </div>
              <input type="range" id="bv-scale" min="50" max="150" value="100" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>出貨明細邊距</span>
                <span class="bv-value-badge" id="bv-margin-value">5mm</span>
              </div>
              <input type="range" id="bv-margin" min="0" max="20" value="5" class="bv-range">
            </div>
          </div>
        </div>
        
        <!-- 物流單設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="shipping">
            <h4>
              <span class="material-icons bv-section-icon">receipt</span>
              物流單設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content collapsed" id="shipping-content">
            <div class="bv-control-group">
              <div class="bv-control-label">
                <span>顯示訂單編號</span>
                <input type="checkbox" id="bv-shipping-order" checked>
              </div>
              
              <div class="bv-order-label-controls" id="bv-order-label-controls">
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>上方距離</span>
                  <span class="bv-value-badge" id="bv-order-label-top-value">5mm</span>
                </div>
                <input type="range" id="bv-order-label-top" min="0" max="50" value="5" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>文字大小</span>
                  <span class="bv-value-badge" id="bv-order-label-size-value">14px</span>
                </div>
                <input type="range" id="bv-order-label-size" min="10" max="24" value="14" class="bv-range">
              </div>
            </div>
            
            <!-- Logo 設定 -->
            <div class="bv-control-group">
              <div class="bv-control-group-title">Logo 設定（底圖）</div>
              <div class="bv-logo-upload-area" id="bv-shipping-logo-upload">
                <input type="file" id="bv-shipping-logo-input" accept="image/png" style="display:none;">
                <img id="bv-shipping-logo-preview" class="bv-logo-preview" style="display:none;">
                <div id="bv-shipping-upload-prompt">
                  <span class="material-icons" style="font-size:36px; color: #5865F2;">add_photo_alternate</span>
                  <div class="bv-upload-hint">點擊上傳 PNG Logo（建議透明背景）</div>
                </div>
              </div>
              
              <div class="bv-logo-controls" id="bv-shipping-logo-controls">
                <div class="bv-control-label">
                  <span>Logo 大小</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-size-value">30mm</span>
                </div>
                <input type="range" id="bv-shipping-logo-size" min="10" max="80" value="30" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>水平位置</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-x-value">50%</span>
                </div>
                <input type="range" id="bv-shipping-logo-x" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>垂直位置</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-y-value">50%</span>
                </div>
                <input type="range" id="bv-shipping-logo-y" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>透明度</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-opacity-value">20%</span>
                </div>
                <input type="range" id="bv-shipping-logo-opacity" min="0" max="100" value="20" class="bv-range">
                
                <button class="bv-remove-logo-btn" id="bv-shipping-logo-remove">
                  <span class="material-icons" style="font-size: 16px;">delete</span>
                  移除 Logo
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 出貨明細設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="detail">
            <h4>
              <span class="material-icons bv-section-icon">description</span>
              出貨明細設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content collapsed" id="detail-content">
            <div class="bv-control-group">
              <div class="bv-control-group-title">文字設定</div>
              <div class="bv-control-label">
                <span>文字大小</span>
              </div>
              <select id="bv-detail-text-size" class="bv-select">
                <option value="12px">12 px</option>
                <option value="14px" selected>14 px</option>
                <option value="16px">16 px</option>
                <option value="18px">18 px</option>
              </select>
            </div>
            
            <!-- 欄位顯示設定 -->
            <div class="bv-control-group">
              <div class="bv-control-group-title">顯示設定</div>
              <div class="bv-field-list">
                <label><input type="checkbox" id="field-productImage"> 顯示商品圖片</label>
                <label><input type="checkbox" id="field-remark"> 顯示顧客備註</label>
                <label><input type="checkbox" id="field-manageRemark"> 顯示後台備註</label>
                <label><input type="checkbox" id="field-printRemark" checked> 顯示列印備註</label>
                <label><input type="checkbox" id="field-deliveryTime"> 顯示指定配送時段</label>
                <label><input type="checkbox" id="field-shippingTime" checked> 顯示預計出貨日</label>
                <label><input type="checkbox" id="field-hideInfo" checked> 隱藏個人資訊</label>
                <label><input type="checkbox" id="field-hidePrice" checked> 隱藏價格</label>
              </div>
            </div>
            
            <!-- Logo 設定 -->
            <div class="bv-control-group">
              <div class="bv-control-group-title">Logo 設定（底圖）</div>
              <div class="bv-logo-upload-area" id="bv-detail-logo-upload">
                <input type="file" id="bv-detail-logo-input" accept="image/png" style="display:none;">
                <img id="bv-detail-logo-preview" class="bv-logo-preview" style="display:none;">
                <div id="bv-detail-upload-prompt">
                  <span class="material-icons" style="font-size:36px; color: #5865F2;">add_photo_alternate</span>
                  <div class="bv-upload-hint">點擊上傳 PNG Logo（建議透明背景）</div>
                </div>
              </div>
              
              <div class="bv-logo-controls" id="bv-detail-logo-controls">
                <div class="bv-control-label">
                  <span>Logo 大小</span>
                  <span class="bv-value-badge" id="bv-detail-logo-size-value">50mm</span>
                </div>
                <input type="range" id="bv-detail-logo-size" min="20" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>水平位置</span>
                  <span class="bv-value-badge" id="bv-detail-logo-x-value">50%</span>
                </div>
                <input type="range" id="bv-detail-logo-x" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>垂直位置</span>
                  <span class="bv-value-badge" id="bv-detail-logo-y-value">50%</span>
                </div>
                <input type="range" id="bv-detail-logo-y" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>透明度</span>
                  <span class="bv-value-badge" id="bv-detail-logo-opacity-value">20%</span>
                </div>
                <input type="range" id="bv-detail-logo-opacity" min="0" max="100" value="20" class="bv-range">
                
                <button class="bv-remove-logo-btn" id="bv-detail-logo-remove">
                  <span class="material-icons" style="font-size: 16px;">delete</span>
                  移除 Logo
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 列印設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="print">
            <h4>
              <span class="material-icons bv-section-icon">print</span>
              列印設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content collapsed" id="print-content">
            <div class="bv-control-group">
              <div class="bv-control-label">
                <span>列印順序</span>
              </div>
              <select id="bv-print-order" class="bv-select">
                <option value="sequential">依序交錯</option>
                <option value="reverse">反序交錯</option>
                <option value="shipping-only">純印物流單（正序）</option>
                <option value="shipping-only-reverse">純印物流單（反序）</option>
                <option value="detail-only">純印出貨明細（正序）</option>
                <option value="detail-only-reverse">純印出貨明細（反序）</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 固定在底部的列印按鈕 -->
      <div class="bv-panel-footer">
        <button class="bv-action-button" id="bv-apply-print">
          <span class="material-icons">print</span>
          <span>套用並列印</span>
        </button>
      </div>
    `;
  }
  
  function setupDetailPagePreview() {
    let container = document.getElementById('bv-preview-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'bv-preview-container';
      
      // 隱藏原始內容
      document.querySelectorAll('.order-content').forEach(content => {
        content.style.display = 'none';
      });
      
      // 插入預覽容器
      const body = document.body;
      const firstOrderContent = document.querySelector('.order-content');
      if (firstOrderContent && firstOrderContent.parentNode) {
        firstOrderContent.parentNode.insertBefore(container, firstOrderContent);
      } else {
        body.appendChild(container);
      }
    }
  }
  
  function initializeDetailEventListeners() {
    // 面板控制
    document.getElementById('bv-exit-btn')?.addEventListener('click', () => {
      if (confirm('確定要退出擴充程式嗎？')) {
        deactivateDetailPanel();
      }
    });
    
    // 清除重抓
    document.getElementById('bv-clear-data')?.addEventListener('click', () => {
      showNotification('請先至後台「更多操作」>「列印物流單」依照畫面提示抓取物流單', 'warning');
    });
    
    // 套用並列印
    document.getElementById('bv-apply-print')?.addEventListener('click', handlePrint);
    
    // 區塊折疊
    document.querySelectorAll('.bv-section-header').forEach(header => {
      const toggle = header.querySelector('.bv-section-toggle');
      if (toggle) {
        header.addEventListener('click', () => {
          const section = header.dataset.section;
          const content = document.getElementById(`${section}-content`);
          if (content) {
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
          }
        });
      }
    });
    
    // 訂單編號顯示控制
    document.getElementById('bv-shipping-order')?.addEventListener('change', (e) => {
      const controls = document.getElementById('bv-order-label-controls');
      if (controls) {
        controls.style.display = e.target.checked ? 'block' : 'none';
      }
      saveSettings();
      updatePreview();
    });
    
    // 列印順序變更時更新預覽
    document.getElementById('bv-print-order')?.addEventListener('change', updatePreview);
    
    // 設定監聽
    setupSettingsListeners();
    setupLogoUpload('shipping');
    setupLogoUpload('detail');
    
    // 初始化預設系統
    initPresetSystem();
  }
  
  async function fetchDetailData() {
    console.log('開始抓取明細');
    detailData = [];
    
    // 抓取所有 order-content
    const orderContents = document.querySelectorAll('.order-content');
    
    for (const content of orderContents) {
      // 跳過只有圖片的容器
      if (!content.querySelector('.order-info')) continue;
      
      const clone = content.cloneNode(true);
      
      // 移除浮水印和底圖
      clone.querySelectorAll('.baseImage, .watermark').forEach(img => img.remove());
      
      // 處理圖片轉為 base64
      await processImagesToBase64(clone);
      
      // 提取訂單資訊
      const orderInfo = extractDetailOrderInfo(clone);
      
      detailData.push({
        html: clone.innerHTML,
        orderNo: orderInfo.orderNo,
        orderInfo: orderInfo,
        index: detailData.length
      });
    }
    
    console.log('抓取到的明細數量:', detailData.length);
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ bvDetailData: detailData }, () => {
        updateDataStatus();
        if (detailData.length > 0) {
          showNotification(`成功抓取 ${detailData.length} 張出貨明細`, 'success');
          updatePreview();
        } else {
          showNotification('未找到明細資料', 'warning');
        }
      });
    }
  }
  
  function extractDetailOrderInfo(element) {
    const info = {
      orderNo: '',
      orderDate: '',
      customer: '',
      customerAccount: '',
      phone: '',
      paymentMethod: '',
      shippingMethod: '',
      recipient: '',
      recipientPhone: '',
      address: '',
      storeName: '',
      deliveryTime: '',
      shippingTime: '',
      items: [],
      totalQty: '',
      extraShipping: '',
      total: '',
      remark: '',
      manageRemark: '',
      printRemark: ''
    };
    
    // 提取訂單資訊
    const orderInfoDiv = element.querySelector('.order-info');
    if (orderInfoDiv) {
      const paragraphs = orderInfoDiv.querySelectorAll('p');
      paragraphs.forEach(p => {
        const text = p.textContent;
        if (text.includes('訂單編號：')) info.orderNo = text.split('：')[1]?.trim();
        if (text.includes('訂購日期：')) info.orderDate = text.split('：')[1]?.trim();
        if (text.includes('訂購人：') && !text.includes('訂購人帳號')) {
          info.customer = text.split('：')[1]?.trim();
        }
        if (text.includes('訂購人帳號：')) info.customerAccount = text.split('：')[1]?.trim();
        if (text.includes('聯絡電話：')) info.phone = text.split('：')[1]?.trim();
        if (text.includes('付款方式：')) info.paymentMethod = text.split('：')[1]?.trim();
        if (text.includes('送貨方式：')) info.shippingMethod = text.split('：')[1]?.trim();
        if (text.includes('收件人：') && !text.includes('收件人電話')) {
          info.recipient = text.split('：')[1]?.trim();
        }
        if (text.includes('收件人電話：')) info.recipientPhone = text.split('：')[1]?.trim();
        if (text.includes('送貨地址：')) info.address = text.split('：')[1]?.trim();
        if (text.includes('門市名稱：')) info.storeName = text.split('：')[1]?.trim();
        if (text.includes('指定配送時段：')) info.deliveryTime = text.split('：')[1]?.trim();
        if (text.includes('預計出貨日：')) info.shippingTime = text.split('：')[1]?.trim();
      });
    }
    
    // 提取商品資訊
    const itemRows = element.querySelectorAll('.list-item');
    itemRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const item = {
          name: cells[0]?.textContent.trim() || '',
          image: cells[0]?.querySelector('img')?.src || '',
          price: cells[1]?.textContent.trim() || '',
          qty: cells[cells.length - 2]?.textContent.trim() || '',
          subtotal: cells[cells.length - 1]?.textContent.trim() || ''
        };
        info.items.push(item);
      }
    });
    
    // 提取總計資訊
    const feeTable = element.querySelector('.order-fee');
    if (feeTable) {
      const rows = feeTable.querySelectorAll('tr');
      rows.forEach(row => {
        const text = row.textContent;
        if (text.includes('商品總數量：')) info.totalQty = row.querySelector('.total')?.textContent.trim();
        if (text.includes('額外運費：')) info.extraShipping = row.querySelector('.total')?.textContent.trim();
        if (text.includes('總計：')) info.total = row.querySelector('.total')?.textContent.trim();
      });
    }
    
    // 提取備註
    const remarkDivs = element.querySelectorAll('.order-remark');
    remarkDivs.forEach(div => {
      const title = div.querySelector('.remark-title')?.textContent || '';
      const content = div.textContent.replace(title, '').trim();
      if (title.includes('顧客備註')) info.remark = content;
      if (title.includes('後台備註')) info.manageRemark = content;
      if (title.includes('列印備註')) info.printRemark = content;
    });
    
    return info;
  }
  
  function setupSettingsListeners() {
    // 統一紙張設定
    ['paper-width', 'paper-height', 'scale', 'margin'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          saveSettings();
          updatePreview();
        });
      }
    });
    
    // 訂單標籤設定
    ['order-label-top', 'order-label-size'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          saveSettings();
          updatePreview();
        });
      }
    });
    
    // Logo設定
    ['shipping-logo-size', 'shipping-logo-x', 'shipping-logo-y', 'shipping-logo-opacity',
     'detail-logo-size', 'detail-logo-x', 'detail-logo-y', 'detail-logo-opacity'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          saveSettings();
          updatePreview();
        });
      }
    });
    
    // 文字大小
    document.getElementById('bv-detail-text-size')?.addEventListener('change', () => {
      saveSettings();
      updatePreview();
    });
    
    // 欄位設定
    document.querySelectorAll('.bv-field-list input').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        saveSettings();
        updatePreview();
      });
    });
    
    // 初始化所有 range input 的進度條
    document.querySelectorAll('input[type="range"]').forEach(updateRangeProgress);
  }
  
  function setupLogoUpload(type) {
    const uploadArea = document.getElementById(`bv-${type}-logo-upload`);
    const input = document.getElementById(`bv-${type}-logo-input`);
    const preview = document.getElementById(`bv-${type}-logo-preview`);
    const prompt = document.getElementById(`bv-${type}-upload-prompt`);
    const controls = document.getElementById(`bv-${type}-logo-controls`);
    const removeBtn = document.getElementById(`bv-${type}-logo-remove`);
    
    if (!uploadArea || !input) return;
    
    uploadArea.addEventListener('click', () => input.click());
    
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && file.type === 'image/png') {
        const reader = new FileReader();
        reader.onload = (event) => {
          savedLogos[type] = event.target.result;
          preview.src = savedLogos[type];
          preview.style.display = 'block';
          prompt.style.display = 'none';
          uploadArea.classList.add('has-logo');
          controls.classList.add('active');
          saveSettings();
          updatePreview();
        };
        reader.readAsDataURL(file);
      } else {
        showNotification('請上傳 PNG 格式的圖片', 'warning');
      }
    });
    
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        savedLogos[type] = null;
        preview.style.display = 'none';
        prompt.style.display = 'flex';
        uploadArea.classList.remove('has-logo');
        controls.classList.remove('active');
        input.value = '';
        saveSettings();
        updatePreview();
      });
    }
  }
  
  function updatePreview() {
    const container = document.getElementById('bv-preview-container');
    if (!container) return;
    
    const settings = getSettings();
    const printOrder = document.getElementById('bv-print-order')?.value || 'sequential';
    const pages = generatePages(printOrder, settings);
    
    container.innerHTML = '';
    pages.forEach(page => container.appendChild(page));
  }
  
  function generatePages(printOrder, settings) {
    const pages = [];
    let pageOrder = [];
    
    // 根據列印順序產生頁面順序
    const shippingLength = shippingData.length;
    const detailLength = detailData.length;
    const maxLength = Math.max(shippingLength, detailLength);
    
    switch (printOrder) {
      case 'sequential': // 依序交錯: 物1明1, 物2明2, 物3明3
        for (let i = 0; i < maxLength; i++) {
          if (i < shippingLength) pageOrder.push({ type: 'shipping', index: i });
          if (i < detailLength) pageOrder.push({ type: 'detail', index: i });
        }
        break;
        
      case 'reverse': // 反序交錯: 物3明1, 物2明2, 物1明3
        for (let i = 0; i < maxLength; i++) {
          const shippingIndex = shippingLength - 1 - i;
          if (shippingIndex >= 0) pageOrder.push({ type: 'shipping', index: shippingIndex });
          if (i < detailLength) pageOrder.push({ type: 'detail', index: i });
        }
        break;
        
      case 'shipping-only': // 純印物流單（正序）
        for (let i = 0; i < shippingLength; i++) {
          pageOrder.push({ type: 'shipping', index: i });
        }
        break;
        
      case 'shipping-only-reverse': // 純印物流單（反序）
        for (let i = shippingLength - 1; i >= 0; i--) {
          pageOrder.push({ type: 'shipping', index: i });
        }
        break;
        
      case 'detail-only': // 純印出貨明細（正序）
        for (let i = 0; i < detailLength; i++) {
          pageOrder.push({ type: 'detail', index: i });
        }
        break;
        
      case 'detail-only-reverse': // 純印出貨明細（反序）
        for (let i = detailLength - 1; i >= 0; i--) {
          pageOrder.push({ type: 'detail', index: i });
        }
        break;
    }
    
    pageOrder.forEach(item => {
      const page = document.createElement('div');
      page.className = 'bv-preview-page bv-print-page';
      
      // 使用統一的紙張尺寸
      page.style.width = settings.paper.width + 'mm';
      page.style.height = settings.paper.height + 'mm';
      
      if (item.type === 'shipping') {
        // 取得對應的明細訂單編號
        const detailInfo = detailData[item.index];
        const orderNo = detailInfo ? detailInfo.orderNo : '';
        page.innerHTML = generateShippingPage(shippingData[item.index], settings, orderNo);
      } else {
        page.innerHTML = generateDetailPage(detailData[item.index], settings);
      }
      
      pages.push(page);
    });
    
    return pages;
  }
  
  function generateShippingPage(data, settings, orderNo) {
    if (!data || !data.html) return '';
    
    return `
      <div class="bv-shipping-content" style="
        width: ${settings.paper.width}mm;
        height: ${settings.paper.height}mm;
        position: relative;
        overflow: hidden;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
      ">
        <!-- 物流單內容 (最底層) -->
        <div style="
          position: relative;
          transform: scale(${settings.paper.scale / 100});
          transform-origin: center center;
          z-index: 1;
        ">
          ${data.html}
        </div>
        
        <!-- Logo (中間層) -->
        ${settings.shipping.logo ? `
          <img src="${settings.shipping.logo}" style="
            position: absolute;
            top: ${settings.shipping.logoY}%;
            left: ${settings.shipping.logoX}%;
            transform: translate(-50%, -50%);
            width: ${settings.shipping.logoSize}mm;
            opacity: ${settings.shipping.logoOpacity / 100};
            pointer-events: none;
            z-index: 5;
          ">
        ` : ''}
        
        <!-- 訂單編號 (最上層) -->
        ${settings.showOrderNumber && orderNo ? `
          <div style="
            position: absolute;
            top: ${settings.orderLabelTop}mm;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 4px 12px;
            border: 1px solid #333;
            border-radius: 4px;
            font-size: ${settings.orderLabelSize}px;
            font-weight: bold;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          ">
            訂單編號：${orderNo}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  function generateDetailPage(data, settings) {
    if (!data || !data.orderInfo) return '';
    
    const fields = getFieldSettings();
    const info = data.orderInfo;
    
    let html = `
      <div class="bv-detail-content" style="
        width: ${settings.paper.width}mm;
        height: ${settings.paper.height}mm;
        position: relative;
        overflow: hidden;
        font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
        font-size: ${settings.detail.textSize};
        box-sizing: border-box;
        background: white;
        margin: 0;
        padding: 0;
      ">
        ${settings.detail.logo ? `
          <div style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
          ">
            <img src="${settings.detail.logo}" style="
              position: absolute;
              top: ${settings.detail.logoY}%;
              left: ${settings.detail.logoX}%;
              transform: translate(-50%, -50%);
              width: ${settings.detail.logoSize}mm;
              opacity: ${settings.detail.logoOpacity / 100};
              pointer-events: none;
            ">
          </div>
        ` : ''}
        
        <div style="
          position: relative;
          z-index: 2;
          padding: ${settings.paper.margin}mm;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        ">
          <div style="
            transform: scale(${settings.paper.scale / 100});
            transform-origin: top left;
            width: ${100 / (settings.paper.scale / 100)}%;
            height: ${100 / (settings.paper.scale / 100)}%;
          ">
            <h2 style="text-align: center; margin: 0 0 15px 0; font-size: 24px;">出貨明細</h2>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: ${settings.detail.textSize};">
              <div style="flex: 1; padding-right: 20px;">
                <p style="margin: 3px 0;"><strong>訂單編號：</strong>${info.orderNo}</p>
                <p style="margin: 3px 0;"><strong>訂購日期：</strong>${info.orderDate}</p>
                <p style="margin: 3px 0;"><strong>訂購人：</strong>${fields.hideInfo ? maskName(info.customer) : info.customer}</p>
                <p style="margin: 3px 0;"><strong>訂購人帳號：</strong>${info.customerAccount}</p>
                <p style="margin: 3px 0;"><strong>聯絡電話：</strong>${fields.hideInfo ? maskPhone(info.phone) : info.phone}</p>
              </div>
              <div style="flex: 1;">
                <p style="margin: 3px 0;"><strong>付款方式：</strong>${info.paymentMethod}</p>
                <p style="margin: 3px 0;"><strong>送貨方式：</strong>${info.shippingMethod}</p>
                <p style="margin: 3px 0;"><strong>收件人：</strong>${fields.hideInfo ? maskName(info.recipient) : info.recipient}</p>
                <p style="margin: 3px 0;"><strong>收件人電話：</strong>${fields.hideInfo ? maskPhone(info.recipientPhone) : info.recipientPhone}</p>
                <p style="margin: 3px 0;"><strong>送貨地址：</strong>${info.address}</p>
                ${info.storeName ? `<p style="margin: 3px 0;"><strong>門市名稱：</strong>${info.storeName}</p>` : ''}
                ${fields.deliveryTime && info.deliveryTime ? `<p style="margin: 3px 0;"><strong>指定配送時段：</strong>${info.deliveryTime}</p>` : ''}
                ${fields.shippingTime && info.shippingTime ? `<p style="margin: 3px 0;"><strong>預計出貨日：</strong>${info.shippingTime}</p>` : ''}
              </div>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: ${settings.detail.textSize};">
              <thead>
                <tr style="border-top: 2px solid black; border-bottom: 2px solid black;">
                  <th style="text-align: left; padding: 6px;">品名</th>
                  ${!fields.hidePrice ? '<th style="text-align: right; padding: 6px;">單價</th>' : ''}
                  <th style="text-align: center; padding: 6px;">數量</th>
                  ${!fields.hidePrice ? '<th style="text-align: right; padding: 6px;">小計</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${info.items.map(item => `
                  <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 6px;">
                      ${fields.productImage && item.image ? `<img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; vertical-align: middle; margin-right: 8px;">` : ''}
                      ${item.name}
                    </td>
                    ${!fields.hidePrice ? `<td style="text-align: right; padding: 6px;">${item.price}</td>` : ''}
                    <td style="text-align: center; padding: 6px;">${item.qty}</td>
                    ${!fields.hidePrice ? `<td style="text-align: right; padding: 6px;">${item.subtotal}</td>` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            ${!fields.hidePrice ? `
              <table style="width: 100%; border-top: 1px solid black; border-bottom: 1px solid black; margin-top: 15px; font-size: ${settings.detail.textSize};">
                <tr>
                  <td style="text-align: right; padding: 6px;">商品總數量：</td>
                  <td style="text-align: right; padding: 6px; width: 120px;">${info.totalQty}</td>
                </tr>
                ${info.extraShipping ? `
                  <tr>
                    <td style="text-align: right; padding: 6px;">額外運費：</td>
                    <td style="text-align: right; padding: 6px;">${info.extraShipping}</td>
                  </tr>
                ` : ''}
                <tr>
                  <td style="text-align: right; padding: 6px; font-weight: bold;">總計：</td>
                  <td style="text-align: right; padding: 6px; font-weight: bold;">${info.total}</td>
                </tr>
              </table>
            ` : ''}
            
            ${fields.remark && info.remark ? `
              <div style="margin-top: 15px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
                <div style="background: #777; color: white; padding: 2px 6px; display: inline-block; margin-bottom: 4px; font-size: 12px;">顧客備註</div>
                <div style="font-size: ${settings.detail.textSize};">${info.remark}</div>
              </div>
            ` : ''}
            
            ${fields.manageRemark && info.manageRemark ? `
              <div style="margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
                <div style="background: #777; color: white; padding: 2px 6px; display: inline-block; margin-bottom: 4px; font-size: 12px;">後台備註</div>
                <div style="font-size: ${settings.detail.textSize};">${info.manageRemark}</div>
              </div>
            ` : ''}
            
            ${fields.printRemark && info.printRemark ? `
              <div style="margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
                <div style="background: #777; color: white; padding: 2px 6px; display: inline-block; margin-bottom: 4px; font-size: 12px;">列印備註</div>
                <div style="font-size: ${settings.detail.textSize};">${info.printRemark}</div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    return html;
  }
  
  // 遮罩函數
  function maskName(name) {
    if (!name) return '';
    if (name.length <= 1) return name;
    return name[0] + '＊'.repeat(name.length - 1);
  }
  
  function maskPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 7) return phone;
    return phone.substring(0, 4) + '***' + phone.substring(phone.length - 3);
  }
  
  function handlePrint() {
    const settings = getSettings();
    const printOrder = document.getElementById('bv-print-order').value;
    const pages = generatePages(printOrder, settings);
    
    if (pages.length === 0) {
      showNotification('沒有可列印的資料', 'warning');
      return;
    }
    
    // 直接呼叫列印
    window.print();
  }
  
  // 工具函數
  function updateValueDisplay(id) {
    const element = document.getElementById('bv-' + id);
    const valueElement = document.getElementById('bv-' + id + '-value');
    if (element && valueElement) {
      if (id.includes('scale') || id.includes('opacity')) {
        valueElement.textContent = element.value + '%';
      } else if (id.includes('size') || id.includes('margin') || id.includes('width') || id.includes('height') || id.includes('top')) {
        valueElement.textContent = element.value + (id.includes('label-size') ? 'px' : 'mm');
      }
    }
  }
  
  function updateRangeProgress(input) {
    const value = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--value', value + '%');
  }
  
  function getSettings() {
    return {
      paper: {
        width: parseInt(document.getElementById('bv-paper-width')?.value || 100),
        height: parseInt(document.getElementById('bv-paper-height')?.value || 150),
        scale: parseInt(document.getElementById('bv-scale')?.value || 100),
        margin: parseInt(document.getElementById('bv-margin')?.value || 5)
      },
      showOrderNumber: document.getElementById('bv-shipping-order')?.checked ?? true,
      orderLabelTop: parseInt(document.getElementById('bv-order-label-top')?.value || 5),
      orderLabelSize: parseInt(document.getElementById('bv-order-label-size')?.value || 14),
      shipping: {
        logo: savedLogos.shipping,
        logoSize: parseInt(document.getElementById('bv-shipping-logo-size')?.value || 30),
        logoX: parseInt(document.getElementById('bv-shipping-logo-x')?.value || 50),
        logoY: parseInt(document.getElementById('bv-shipping-logo-y')?.value || 50),
        logoOpacity: parseInt(document.getElementById('bv-shipping-logo-opacity')?.value || 20)
      },
      detail: {
        textSize: document.getElementById('bv-detail-text-size')?.value || '14px',
        logo: savedLogos.detail,
        logoSize: parseInt(document.getElementById('bv-detail-logo-size')?.value || 50),
        logoX: parseInt(document.getElementById('bv-detail-logo-x')?.value || 50),
        logoY: parseInt(document.getElementById('bv-detail-logo-y')?.value || 50),
        logoOpacity: parseInt(document.getElementById('bv-detail-logo-opacity')?.value || 20)
      }
    };
  }
  
  function getFieldSettings() {
    const fields = {};
    document.querySelectorAll('.bv-field-list input').forEach(checkbox => {
      const fieldName = checkbox.id.replace('field-', '');
      fields[fieldName] = checkbox.checked;
    });
    return fields;
  }
  
  function saveSettings() {
    const settings = getSettings();
    const fieldSettings = getFieldSettings();
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        bvShippingSettings: settings,
        bvFieldSettings: fieldSettings,
        bvShippingLogos: savedLogos
      });
    }
  }
  
  function loadSavedSettings() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bvShippingSettings', 'bvFieldSettings', 'bvShippingLogos'], (result) => {
        if (result.bvShippingSettings) {
          const settings = result.bvShippingSettings;
          
          // 載入紙張設定
          if (settings.paper) {
            document.getElementById('bv-paper-width').value = settings.paper.width;
            document.getElementById('bv-paper-height').value = settings.paper.height;
            document.getElementById('bv-scale').value = settings.paper.scale;
            document.getElementById('bv-margin').value = settings.paper.margin;
            updateValueDisplay('paper-width');
            updateValueDisplay('paper-height');
            updateValueDisplay('scale');
            updateValueDisplay('margin');
          }
          
          // 載入訂單標籤設定
          document.getElementById('bv-shipping-order').checked = settings.showOrderNumber;
          document.getElementById('bv-order-label-top').value = settings.orderLabelTop;
          document.getElementById('bv-order-label-size').value = settings.orderLabelSize;
          updateValueDisplay('order-label-top');
          updateValueDisplay('order-label-size');
          
          // 載入物流單Logo設定
          if (settings.shipping) {
            document.getElementById('bv-shipping-logo-size').value = settings.shipping.logoSize;
            document.getElementById('bv-shipping-logo-x').value = settings.shipping.logoX;
            document.getElementById('bv-shipping-logo-y').value = settings.shipping.logoY;
            document.getElementById('bv-shipping-logo-opacity').value = settings.shipping.logoOpacity;
            updateValueDisplay('shipping-logo-size');
            updateValueDisplay('shipping-logo-x');
            updateValueDisplay('shipping-logo-y');
            updateValueDisplay('shipping-logo-opacity');
          }
          
          // 載入明細設定
          if (settings.detail) {
            document.getElementById('bv-detail-text-size').value = settings.detail.textSize;
            document.getElementById('bv-detail-logo-size').value = settings.detail.logoSize;
            document.getElementById('bv-detail-logo-x').value = settings.detail.logoX;
            document.getElementById('bv-detail-logo-y').value = settings.detail.logoY;
            document.getElementById('bv-detail-logo-opacity').value = settings.detail.logoOpacity;
            updateValueDisplay('detail-logo-size');
            updateValueDisplay('detail-logo-x');
            updateValueDisplay('detail-logo-y');
            updateValueDisplay('detail-logo-opacity');
          }
          
          // 更新訂單標籤控制顯示
          const controls = document.getElementById('bv-order-label-controls');
          if (controls) {
            controls.style.display = settings.showOrderNumber ? 'block' : 'none';
          }
          
          // 更新所有 range 的進度條
          document.querySelectorAll('input[type="range"]').forEach(updateRangeProgress);
        }
        
        if (result.bvFieldSettings) {
          Object.keys(result.bvFieldSettings).forEach(field => {
            const checkbox = document.getElementById('field-' + field);
            if (checkbox) checkbox.checked = result.bvFieldSettings[field];
          });
        }
        
        // 載入Logo
        if (result.bvShippingLogos) {
          savedLogos = result.bvShippingLogos;
          
          // 物流單Logo
          if (savedLogos.shipping) {
            const preview = document.getElementById('bv-shipping-logo-preview');
            const prompt = document.getElementById('bv-shipping-upload-prompt');
            const uploadArea = document.getElementById('bv-shipping-logo-upload');
            const controls = document.getElementById('bv-shipping-logo-controls');
            
            if (preview) {
              preview.src = savedLogos.shipping;
              preview.style.display = 'block';
            }
            if (prompt) prompt.style.display = 'none';
            if (uploadArea) uploadArea.classList.add('has-logo');
            if (controls) controls.classList.add('active');
          }
          
          // 明細Logo
          if (savedLogos.detail) {
            const preview = document.getElementById('bv-detail-logo-preview');
            const prompt = document.getElementById('bv-detail-upload-prompt');
            const uploadArea = document.getElementById('bv-detail-logo-upload');
            const controls = document.getElementById('bv-detail-logo-controls');
            
            if (preview) {
              preview.src = savedLogos.detail;
              preview.style.display = 'block';
            }
            if (prompt) prompt.style.display = 'none';
            if (uploadArea) uploadArea.classList.add('has-logo');
            if (controls) controls.classList.add('active');
          }
        }
      });
    }
  }
  
  function loadSavedData() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bvShippingData', 'bvDetailData'], (result) => {
        if (result.bvShippingData) shippingData = result.bvShippingData;
        if (result.bvDetailData) detailData = result.bvDetailData;
        updateDataStatus();
        if (shippingData.length > 0 || detailData.length > 0) updatePreview();
      });
    }
  }
  
  function updateDataStatus() {
    const shippingCount = document.getElementById('bv-shipping-count');
    const detailCount = document.getElementById('bv-detail-count');
    if (shippingCount) {
      shippingCount.textContent = shippingData.length > 0 ? `已抓取 ${shippingData.length} 張` : '未抓取';
      shippingCount.className = shippingData.length > 0 ? 'bv-status-badge success' : 'bv-status-badge';
    }
    if (detailCount) {
      detailCount.textContent = detailData.length > 0 ? `已抓取 ${detailData.length} 張` : '未抓取';
      detailCount.className = detailData.length > 0 ? 'bv-status-badge success' : 'bv-status-badge';
    }
  }
  
  // 預設系統功能
  function initPresetSystem() {
    const presetSelect = document.getElementById('bv-preset-select');
    const savePresetBtn = document.getElementById('bv-save-preset');
    const deletePresetBtn = document.getElementById('bv-delete-preset');
    const resetFormatBtn = document.getElementById('bv-reset-format');
    const savePresetRow = document.getElementById('bv-save-preset-row');
    const newPresetName = document.getElementById('bv-new-preset-name');
    const confirmSaveBtn = document.getElementById('bv-confirm-save');
    const cancelSaveBtn = document.getElementById('bv-cancel-save');
    
    if (!presetSelect) return;
    
    // 載入預設檔列表
    loadPresetList();
    
    // 選擇設定檔時載入設定
    presetSelect.addEventListener('change', function() {
      const selectedPreset = presetSelect.value;
      if (selectedPreset) {
        const settings = getSettingsFromLocal('preset_' + selectedPreset);
        if (settings) {
          applySavedSettings(settings);
          saveSettingsToLocal('lastSelectedPreset', selectedPreset);
          showNotification(`已載入設定檔「${selectedPreset}」`, 'success');
        }
      }
    });
    
    // 儲存設定按鈕
    if (savePresetBtn) {
      savePresetBtn.addEventListener('click', function() {
        if (savePresetRow) {
          savePresetRow.style.display = 'flex';
        }
        if (newPresetName) {
          newPresetName.value = presetSelect.value || '';
          newPresetName.focus();
        }
      });
    }
    
    // 確認儲存
    if (confirmSaveBtn) {
      confirmSaveBtn.addEventListener('click', function() {
        if (!newPresetName) return;
        
        const presetName = newPresetName.value.trim();
        if (!presetName) {
          showNotification('請輸入設定檔名稱', 'warning');
          return;
        }
        
        const settings = saveCurrentSettings();
        saveSettingsToLocal('preset_' + presetName, settings);
        
        // 更新設定檔清單
        const allPresets = getSettingsFromLocal('presetList') || [];
        if (!allPresets.includes(presetName)) {
          allPresets.push(presetName);
          saveSettingsToLocal('presetList', allPresets);
        }
        
        // 更新最後選擇的設定檔
        saveSettingsToLocal('lastSelectedPreset', presetName);
        
        // 重新載入設定檔列表
        loadPresetList();
        if (savePresetRow) {
          savePresetRow.style.display = 'none';
        }
        
        showNotification(`設定檔「${presetName}」已儲存`, 'success');
      });
    }
    
    // 取消儲存
    if (cancelSaveBtn) {
      cancelSaveBtn.addEventListener('click', function() {
        if (savePresetRow) {
          savePresetRow.style.display = 'none';
        }
      });
    }
    
    // 刪除設定檔
    if (deletePresetBtn) {
      deletePresetBtn.addEventListener('click', function() {
        const selectedPreset = presetSelect.value;
        if (!selectedPreset) {
          showNotification('請先選擇一個設定檔', 'warning');
          return;
        }
        
        if (confirm(`確定要刪除設定檔「${selectedPreset}」嗎？`)) {
          // 從設定檔清單中移除
          const allPresets = getSettingsFromLocal('presetList') || [];
          const updatedPresets = allPresets.filter(name => name !== selectedPreset);
          saveSettingsToLocal('presetList', updatedPresets);
          
          // 刪除設定檔數據
          localStorage.removeItem('bvShopShipping_preset_' + selectedPreset);
          
          // 如果刪除的是最後選擇的設定檔，清除最後選擇記錄
          if (getSettingsFromLocal('lastSelectedPreset') === selectedPreset) {
            localStorage.removeItem('bvShopShipping_lastSelectedPreset');
          }
          
          // 重新載入設定檔列表
          loadPresetList();
          showNotification(`設定檔「${selectedPreset}」已刪除`, 'success');
        }
      });
    }
    
    // 清除格式按鈕
    if (resetFormatBtn) {
      resetFormatBtn.addEventListener('click', function() {
        if (confirm('確定要將所有設定重置為預設值嗎？\n\n此操作無法復原。')) {
          // 清除Logo
          savedLogos = { shipping: null, detail: null };
          ['shipping', 'detail'].forEach(type => {
            const preview = document.getElementById(`bv-${type}-logo-preview`);
            const prompt = document.getElementById(`bv-${type}-upload-prompt`);
            const uploadArea = document.getElementById(`bv-${type}-logo-upload`);
            const controls = document.getElementById(`bv-${type}-logo-controls`);
            const input = document.getElementById(`bv-${type}-logo-input`);
            
            if (preview) preview.style.display = 'none';
            if (prompt) prompt.style.display = 'flex';
            if (uploadArea) uploadArea.classList.remove('has-logo');
            if (controls) controls.classList.remove('active');
            if (input) input.value = '';
          });
          
          // 套用預設值
          applySavedSettings(getDefaultSettings());
          
          // 清除預設檔選擇
          if (presetSelect) {
            presetSelect.value = '';
          }
          
          // 清除最後選擇的預設檔記錄
          localStorage.removeItem('bvShopShipping_lastSelectedPreset');
          
          showNotification('已重置為預設值', 'success');
        }
      });
    }
    
    // Enter 鍵儲存設定檔
    if (newPresetName) {
      newPresetName.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && confirmSaveBtn) {
          confirmSaveBtn.click();
        }
      });
    }
  }
  
  function loadPresetList() {
    const presetSelect = document.getElementById('bv-preset-select');
    if (!presetSelect) return;
    
    const allPresets = getSettingsFromLocal('presetList') || [];
    const lastSelected = getSettingsFromLocal('lastSelectedPreset');
    
    // 清空現有選項
    while (presetSelect.options.length > 1) {
      presetSelect.remove(1);
    }
    
    // 添加所有設定檔
    allPresets.forEach(presetName => {
      const option = document.createElement('option');
      option.value = presetName;
      option.textContent = presetName;
      presetSelect.appendChild(option);
      
      // 如果是上次選擇的設定檔，預設選中
      if (presetName === lastSelected) {
        option.selected = true;
      }
    });
  }
  
  function saveCurrentSettings() {
    const settings = getSettings();
    const fieldSettings = getFieldSettings();
    return {
      ...settings,
      fields: fieldSettings,
      version: '2.0.0'
    };
  }
  
  function applySavedSettings(settings) {
    if (!settings) return;
    
    // 載入紙張設定
    if (settings.paper) {
      document.getElementById('bv-paper-width').value = settings.paper.width;
      document.getElementById('bv-paper-height').value = settings.paper.height;
      document.getElementById('bv-scale').value = settings.paper.scale;
      document.getElementById('bv-margin').value = settings.paper.margin;
      ['paper-width', 'paper-height', 'scale', 'margin'].forEach(id => {
        updateValueDisplay(id);
        const element = document.getElementById('bv-' + id);
        if (element) updateRangeProgress(element);
      });
    }
    
    // 載入訂單標籤設定
    document.getElementById('bv-shipping-order').checked = settings.showOrderNumber;
    document.getElementById('bv-order-label-top').value = settings.orderLabelTop;
    document.getElementById('bv-order-label-size').value = settings.orderLabelSize;
    ['order-label-top', 'order-label-size'].forEach(id => {
      updateValueDisplay(id);
      const element = document.getElementById('bv-' + id);
      if (element) updateRangeProgress(element);
    });
    
    // 載入Logo設定
    if (settings.shipping) {
      savedLogos.shipping = settings.shipping.logo;
      if (savedLogos.shipping) {
        const preview = document.getElementById('bv-shipping-logo-preview');
        const prompt = document.getElementById('bv-shipping-upload-prompt');
        const uploadArea = document.getElementById('bv-shipping-logo-upload');
        const controls = document.getElementById('bv-shipping-logo-controls');
        
        if (preview) {
          preview.src = savedLogos.shipping;
          preview.style.display = 'block';
        }
        if (prompt) prompt.style.display = 'none';
        if (uploadArea) uploadArea.classList.add('has-logo');
        if (controls) controls.classList.add('active');
      }
      
      document.getElementById('bv-shipping-logo-size').value = settings.shipping.logoSize;
      document.getElementById('bv-shipping-logo-x').value = settings.shipping.logoX;
      document.getElementById('bv-shipping-logo-y').value = settings.shipping.logoY;
      document.getElementById('bv-shipping-logo-opacity').value = settings.shipping.logoOpacity;
      ['shipping-logo-size', 'shipping-logo-x', 'shipping-logo-y', 'shipping-logo-opacity'].forEach(id => {
        updateValueDisplay(id);
        const element = document.getElementById('bv-' + id);
        if (element) updateRangeProgress(element);
      });
    }
    
    if (settings.detail) {
      savedLogos.detail = settings.detail.logo;
      if (savedLogos.detail) {
        const preview = document.getElementById('bv-detail-logo-preview');
        const prompt = document.getElementById('bv-detail-upload-prompt');
        const uploadArea = document.getElementById('bv-detail-logo-upload');
        const controls = document.getElementById('bv-detail-logo-controls');
        
        if (preview) {
          preview.src = savedLogos.detail;
          preview.style.display = 'block';
        }
        if (prompt) prompt.style.display = 'none';
        if (uploadArea) uploadArea.classList.add('has-logo');
        if (controls) controls.classList.add('active');
      }
      
      document.getElementById('bv-detail-text-size').value = settings.detail.textSize;
      document.getElementById('bv-detail-logo-size').value = settings.detail.logoSize;
      document.getElementById('bv-detail-logo-x').value = settings.detail.logoX;
      document.getElementById('bv-detail-logo-y').value = settings.detail.logoY;
      document.getElementById('bv-detail-logo-opacity').value = settings.detail.logoOpacity;
      ['detail-logo-size', 'detail-logo-x', 'detail-logo-y', 'detail-logo-opacity'].forEach(id => {
        updateValueDisplay(id);
        const element = document.getElementById('bv-' + id);
        if (element) updateRangeProgress(element);
      });
    }
    
    // 載入欄位設定
    if (settings.fields) {
      Object.keys(settings.fields).forEach(field => {
        const checkbox = document.getElementById('field-' + field);
        if (checkbox) checkbox.checked = settings.fields[field];
      });
    }
    
    // 更新訂單標籤控制顯示
    const controls = document.getElementById('bv-order-label-controls');
    if (controls) {
      controls.style.display = settings.showOrderNumber ? 'block' : 'none';
    }
    
    saveSettings();
    updatePreview();
  }
  
  function getDefaultSettings() {
    return {
      paper: {
        width: 100,
        height: 150,
        scale: 100,
        margin: 5
      },
      showOrderNumber: true,
      orderLabelTop: 5,
      orderLabelSize: 14,
      shipping: {
        logo: null,
        logoSize: 30,
        logoX: 50,
        logoY: 50,
        logoOpacity: 20
      },
      detail: {
        textSize: '14px',
        logo: null,
        logoSize: 50,
        logoX: 50,
        logoY: 50,
        logoOpacity: 20
      }
    };
  }
  
  function saveSettingsToLocal(name, settings) {
    try {
      localStorage.setItem('bvShopShipping_' + name, JSON.stringify(settings));
    } catch (e) {
      console.error('無法儲存設定：', e);
    }
  }
  
  function getSettingsFromLocal(name) {
    try {
      const settingsStr = localStorage.getItem('bvShopShipping_' + name);
      return settingsStr ? JSON.parse(settingsStr) : null;
    } catch (e) {
      console.error('無法讀取設定：', e);
      return null;
    }
  }
  
  function showNotification(message, type = 'info') {
    // 對物流單頁面，使用簡單的通知方式
    if (currentPage.type === 'shipping') {
      console.log(`[${type.toUpperCase()}] ${message}`);
      alert(message);
      return;
    }
    
    // 對明細頁面，使用視覺化通知
    const notification = document.createElement('div');
    notification.className = `bv-notification ${type}`;
    notification.innerHTML = `
      <span class="material-icons">${
        type === 'success' ? 'check_circle' : 
        type === 'warning' ? 'warning' : 
        type === 'error' ? 'error' : 
        'info'
      }</span>
      <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  // === 主程式執行 ===
  
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'togglePanel') {
        if (currentPage.type === 'detail') {
          if (panelActive) {
            deactivateDetailPanel();
          } else {
            activateDetailPanel();
          }
        }
      }
    });
  }
  
  // 自動初始化
  if (currentPage.type === 'shipping') {
    // 物流單頁自動顯示面板
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(injectShippingPanel, 300));
    } else {
      setTimeout(injectShippingPanel, 300);
    }
  } else if (currentPage.type === 'detail') {
    // 明細頁等待使用者啟動
    console.log('BV SHOP 出貨明細頁面已偵測，點擊擴充功能圖示以啟動');
  }
  
})();
