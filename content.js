            // 使用相同的配對邏輯
            if (shippingMap.has(detailCode)) {
              shipping = shippingMap.get(detailCode);
            } else {
              for (const [code, data] of shippingMap) {
                if (code.startsWith(detailCode) || detailCode.startsWith(code)) {
                  shipping = data;
                  break;
                }
              }
            }
            
            if (shipping) {
              pageOrder.push({ type: 'shipping', data: shipping, orderNo: detail.orderNo });
              pageOrder.push({ type: 'detail', data: detail });
            } else {
              pageOrder.push({ type: 'detail', data: detail });
            }
          } else {
            pageOrder.push({ type: 'detail', data: detail });
          }
        });
        break;
        
      case 'shipping-only': // 純物流單（正序）
        shippingData.forEach(data => {
          pageOrder.push({ type: 'shipping', data: data });
        });
        break;
        
      case 'shipping-only-reverse': // 純物流單（反序）
        [...shippingData].reverse().forEach(data => {
          pageOrder.push({ type: 'shipping', data: data });
        });
        break;
        
      case 'detail-only': // 純出貨明細（正序）
        detailData.forEach(data => {
          pageOrder.push({ type: 'detail', data: data });
        });
        break;
        
      case 'detail-only-reverse': // 純出貨明細（反序）
        [...detailData].reverse().forEach(data => {
          pageOrder.push({ type: 'detail', data: data });
        });
        break;
    }
    
    console.log(`\n=== 配對結果 ===`);
    console.log(`總共 ${pageOrder.length} 頁`);
    console.log(`物流單: ${pageOrder.filter(p => p.type === 'shipping').length} 張`);
    console.log(`明細: ${pageOrder.filter(p => p.type === 'detail').length} 張`);
    
    // 產生頁面
    pageOrder.forEach(item => {
      const page = document.createElement('div');
      page.className = 'bv-preview-page bv-print-page';
      
      page.style.cssText = `
        width: 100mm !important;
        height: 150mm !important;
        margin: 0 !important;
        padding: 0 !important;
        position: relative !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      `;
      
      if (item.type === 'shipping') {
        page.innerHTML = generateShippingPage(item.data, settings, item.orderNo);
      } else {
        page.innerHTML = generateDetailPage(item.data, settings);
      }
      
      pages.push(page);
    });
    
    return pages;
  }
  
  // 新增函數：標準化物流編號格式
  function normalizeServiceCode(code) {
    if (!code) return '';
    
    // 移除空格和特殊字符
    let normalized = code.trim().toUpperCase();
    
    // 如果是完整的服務代碼（如 F05816537582），可能需要只取前面部分
    // 7-11 的物流編號通常是 F + 8位數字
    const match = normalized.match(/F\d{8}/);
    if (match) {
      return match[0];
    }
    
    return normalized;
  }
  
  // 簡化的生成物流單頁面
  function generateShippingPage(data, settings, customOrderNo) {
    if (!data) return '';
    
    const displayOrderNo = customOrderNo || data.orderNo;
    
    // 始終使用 100mm x 150mm
    return `
      <div class="bv-shipping-content" style="
        width: 100mm;
        height: 150mm;
        position: relative;
        overflow: hidden;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      ">
        <!-- 底圖（最底層） -->
        ${settings.shipping.logo ? `
          <img src="${settings.shipping.logo}" 
               class="bv-watermark-logo"
               style="
                 position: absolute;
                 top: ${settings.shipping.logoY}%;
                 left: ${settings.shipping.logoX}%;
                 transform: translate(-50%, -50%);
                 width: ${settings.shipping.logoSize}mm;
                 opacity: ${settings.shipping.logoOpacity / 100};
                 --opacity: ${settings.shipping.logoOpacity / 100};
                 pointer-events: none;
                 z-index: 1;
               ">
        ` : ''}
        
        <!-- 物流單內容 -->
        <div style="z-index: 2; position: relative;">
          ${data.html}
        </div>
        
        <!-- 訂單編號標籤（最上層） -->
        ${settings.showOrderNumber && displayOrderNo ? `
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
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            white-space: nowrap;
          ">
            訂單編號：${displayOrderNo}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  function generateDetailPage(data, settings) {
    if (!data || !data.orderInfo) return '';
    
    const fields = getFieldSettings();
    const info = data.orderInfo;
    const scale = settings.paper.scale / 100;
    
    // 始終使用 100mm x 150mm，但內部邊距仍可調整
    const actualMargin = Math.min(settings.paper.margin, 10); // 限制最大邊距為 10mm
    const availableWidth = (100 - (actualMargin * 2)) / scale;
    
    return `
      <div class="bv-detail-content" style="
        width: 100mm;
        height: 150mm;
        position: relative;
        overflow: hidden;
        background: white;
        padding: ${actualMargin}mm;
        box-sizing: border-box;
      ">
        <!-- 底圖 -->
        ${settings.detail.logo ? `
          <img src="${settings.detail.logo}" 
               class="bv-watermark-logo"
               style="
                 position: absolute;
                 top: ${settings.detail.logoY}%;
                 left: ${settings.detail.logoX}%;
                 transform: translate(-50%, -50%);
                 width: ${settings.detail.logoSize}mm;
                 opacity: ${settings.detail.logoOpacity / 100};
                 --opacity: ${settings.detail.logoOpacity / 100};
                 pointer-events: none;
                 z-index: 1;
               ">
        ` : ''}
        
        <!-- 明細內容 -->
        <div style="
          transform: scale(${scale});
          transform-origin: top left;
          width: ${availableWidth}mm;
          position: relative;
          z-index: 2;
          font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
          font-size: ${settings.detail.textSize};
        ">
          <h2 style="text-align: center; margin: 0 0 8px 0; font-size: 18px;">出貨明細</h2>
          
          <!-- 基本資訊 -->
          <div style="font-size: ${settings.detail.textSize}; line-height: 1.4;">
            <div style="margin-bottom: 8px;">
              <p style="margin: 2px 0;"><strong>訂單編號：</strong>${info.orderNo}</p>
              <p style="margin: 2px 0;"><strong>訂購日期：</strong>${info.orderDate}</p>
              ${fields.showLogTraceId && data.logTraceId ? `<p style="margin: 2px 0;"><strong>物流編號：</strong>${data.logTraceId}</p>` : ''}
            </div>
            
            <div style="margin-bottom: 8px;">
              <p style="margin: 2px 0;"><strong>訂購人：</strong>${fields.hideInfo ? maskName(info.customer) : info.customer}</p>
              <p style="margin: 2px 0;"><strong>收件人：</strong>${fields.hideInfo ? maskName(info.recipient) : info.recipient}</p>
              <p style="margin: 2px 0;"><strong>電話：</strong>${fields.hideInfo ? maskPhone(info.recipientPhone) : info.recipientPhone}</p>
              <p style="margin: 2px 0;"><strong>地址：</strong>${info.address}</p>
              ${info.storeName ? `<p style="margin: 2px 0;"><strong>門市：</strong>${info.storeName}</p>` : ''}
              ${fields.deliveryTime && info.deliveryTime ? `<p style="margin: 2px 0;"><strong>指定配送時段：</strong>${info.deliveryTime}</p>` : ''}
              ${fields.shippingTime && info.shippingTime ? `<p style="margin: 2px 0;"><strong>預計出貨日：</strong>${info.shippingTime}</p>` : ''}
            </div>
          </div>
          
          <!-- 商品明細表格 -->
          <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: ${settings.detail.textSize};">
            <thead>
              <tr style="border-top: 1px solid black; border-bottom: 1px solid black;">
                <th style="text-align: left; padding: 4px; width: 60%;">品名</th>
                ${!fields.hidePrice ? '<th style="text-align: right; padding: 4px; width: 20%;">單價</th>' : ''}
                <th style="text-align: center; padding: 4px; width: ${fields.hidePrice ? '40%' : '10%'};">數量</th>
                ${!fields.hidePrice ? '<th style="text-align: right; padding: 4px; width: 10%;">小計</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${info.items.map(item => `
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 3px; font-size: 12px;">
                    ${fields.productImage && item.image ? `<img src="${item.image}" style="width: 20px; height: 20px; object-fit: cover; vertical-align: middle; margin-right: 4px;">` : ''}
                    <span>${item.name}</span>
                  </td>
                  ${!fields.hidePrice ? `<td style="text-align: right; padding: 3px; font-size: 12px;">${item.price}</td>` : ''}
                  <td style="text-align: center; padding: 3px; font-size: 12px;">${item.qty}</td>
                  ${!fields.hidePrice ? `<td style="text-align: right; padding: 3px; font-size: 12px;">${item.subtotal}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <!-- 總計 -->
          ${!fields.hidePrice ? `
            <div style="margin-top: 8px; text-align: right; font-size: ${settings.detail.textSize};">
              <p style="margin: 2px 0;">商品總數量：${info.totalQty}</p>
              ${info.extraShipping ? `<p style="margin: 2px 0;">額外運費：${info.extraShipping}</p>` : ''}
              <p style="margin: 2px 0; font-weight: bold;">總計：${info.total}</p>
            </div>
          ` : ''}
          
          <!-- 備註 -->
          ${fields.remark && info.remark ? `
            <div style="margin-top: 8px; padding: 4px; background: #f5f5f5; font-size: 12px;">
              <strong>顧客備註：</strong>${info.remark}
            </div>
          ` : ''}
          
          ${fields.manageRemark && info.manageRemark ? `
            <div style="margin-top: 4px; padding: 4px; background: #f5f5f5; font-size: 12px;">
              <strong>後台備註：</strong>${info.manageRemark}
            </div>
          ` : ''}
          
          ${fields.printRemark && info.printRemark ? `
            <div style="margin-top: 4px; padding: 4px; background: #f5f5f5; font-size: 12px;">
              <strong>列印備註：</strong>${info.printRemark}
            </div>
          ` : ''}
        </div>
      </div>
    `;
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
    
    // 移除之前的列印樣式
    const existingStyle = document.getElementById('bv-print-specific-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // 添加列印專用樣式 - 強制覆蓋所有原始樣式
    const printStyleElement = document.createElement('style');
    printStyleElement.id = 'bv-print-specific-styles';
    printStyleElement.textContent = `
      /* 強制覆蓋原始的列印樣式 */
      @media print {
        /* 最高優先級的頁面設定 */
        @page {
          size: 100mm 150mm !important;
          margin: 0 !important;
        }
        
        /* 覆蓋所有 html 和 body 的設定 */
        html {
          width: auto !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          font-size: 16px !important;
        }
        
        body {
          width: auto !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          /* 移除原始的 20cm 寬度限制 */
          max-width: none !important;
          min-width: auto !important;
        }
        
        /* 隱藏所有非列印內容 */
        #bv-shipping-assistant-panel,
        #bv-shipping-panel,
        .bv-notification,
        .ignore-print,
        .order-content,
        body > *:not(#bv-preview-container) {
          display: none !important;
          visibility: hidden !important;
        }
        
        /* 只顯示預覽容器 */
        #bv-preview-container {
          display: block !important;
          visibility: visible !important;
          width: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          position: static !important;
        }
        
        /* 每頁固定 100mm x 150mm */
        .bv-preview-page,
        .bv-print-page {
          display: block !important;
          visibility: visible !important;
          width: 100mm !important;
          height: 150mm !important;
          min-width: 100mm !important;
          min-height: 150mm !important;
          max-width: 100mm !important;
          max-height: 150mm !important;
          margin: 0 !important;
          padding: 0 !important;
          page-break-after: always !important;
          page-break-inside: avoid !important;
          position: relative !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          background: white !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        .bv-preview-page:last-child {
          page-break-after: auto !important;
        }
        
        /* 內容容器也固定尺寸 */
        .bv-shipping-content,
        .bv-detail-content {
          display: block !important;
          visibility: visible !important;
          width: 100mm !important;
          height: 150mm !important;
          margin: 0 !important;
          position: relative !important;
          box-sizing: border-box !important;
        }
        
        /* 確保物流單正確顯示 */
        .bv-shipping-wrapper,
        .div_frame {
          margin: 0 auto !important;
          transform: none !important;
        }

        /* 確保圖片正確顯示 */
        img {
          display: inline-block !important;
          visibility: visible !important;
          max-width: none !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        /* 特別處理 QR Code */
        img[src*="QRCode"],
        img[src*="qrcode"],
        img[src*="SendQRCode"],
        img#ctl00_Bill1_sendQRCode,
        img#ctl00_Bill1_QRCODE {
          display: inline-block !important;
          visibility: visible !important;
          opacity: 1 !important;
          width: auto !important;
          height: auto !important;
        }
        
        /* 確保圖片和顏色正確顯示 */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        /* 確保所有內容可見 */
        .bv-preview-page *,
        .bv-print-page * {
          visibility: visible !important;
        }
        
        /* 隱藏底圖外的其他元素 */
        .bv-watermark-logo {
          opacity: var(--opacity) !important;
        }
      }
      
      /* 添加到普通樣式區，避免被覆蓋 */
      @media all {
        #bv-print-specific-styles {
          display: none !important;
        }
      }
    `;
    
    // 插入到 head 最後，確保優先級最高
    document.head.appendChild(printStyleElement);
    
    // 暫時移除原始的 style 標籤
    const originalStyles = document.querySelectorAll('style');
    const styleStates = [];
    originalStyles.forEach(style => {
      if (style.id !== 'bv-print-specific-styles' && style.textContent.includes('@page')) {
        styleStates.push({
          element: style,
          disabled: style.disabled
        });
        style.disabled = true;
      }
    });
    
    // 延遲執行列印
    setTimeout(() => {
      window.print();
      
      // 列印後恢復原始樣式
      setTimeout(() => {
        // 移除我們的列印樣式
        const tempStyle = document.getElementById('bv-print-specific-styles');
        if (tempStyle) {
          tempStyle.remove();
        }
        
        // 恢復原始樣式
        styleStates.forEach(state => {
          state.element.disabled = state.disabled;
        });
      }, 2000);
    }, 100);
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
      const fieldName = checkbox.id.replace('bv-field-', '');
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
            const checkbox = document.getElementById('bv-field-' + field);
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
  
  // 預設系統功能 - 改用 chrome.storage
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
      if (selectedPreset && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([`preset_${selectedPreset}`], (result) => {
          const settings = result[`preset_${selectedPreset}`];
          if (settings) {
            applySavedSettings(settings);
            chrome.storage.local.set({ lastSelectedPreset: selectedPreset });
            showNotification(`已載入設定檔「${selectedPreset}」`, 'success');
          }
        });
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
        
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['presetList'], (result) => {
            const allPresets = result.presetList || [];
            if (!allPresets.includes(presetName)) {
              allPresets.push(presetName);
            }
            
            const storageData = {
              [`preset_${presetName}`]: settings,
              presetList: allPresets,
              lastSelectedPreset: presetName
            };
            
            chrome.storage.local.set(storageData, () => {
              loadPresetList();
              if (savePresetRow) {
                savePresetRow.style.display = 'none';
              }
              showNotification(`設定檔「${presetName}」已儲存`, 'success');
            });
          });
        }
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
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['presetList', 'lastSelectedPreset'], (result) => {
              const allPresets = result.presetList || [];
              const updatedPresets = allPresets.filter(name => name !== selectedPreset);
              
              const storageData = { presetList: updatedPresets };
              
              // 如果刪除的是最後選擇的設定檔，清除記錄
              if (result.lastSelectedPreset === selectedPreset) {
                chrome.storage.local.remove(['lastSelectedPreset']);
              }
              
              // 移除設定檔數據
              chrome.storage.local.remove([`preset_${selectedPreset}`], () => {
                chrome.storage.local.set(storageData, () => {
                  loadPresetList();
                  showNotification(`設定檔「${selectedPreset}」已刪除`, 'success');
                });
              });
            });
          }
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
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove(['lastSelectedPreset']);
          }
          
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
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['presetList', 'lastSelectedPreset'], (result) => {
        const allPresets = result.presetList || [];
        const lastSelected = result.lastSelectedPreset;
        
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
      });
    }
  }
  
  function saveCurrentSettings() {
    const settings = getSettings();
    const fieldSettings = getFieldSettings();
    return {
      ...settings,
      fields: fieldSettings,
      version: '2.2.0' // 更新版本號以支援物流編號配對
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
        const checkbox = document.getElementById('bv-field-' + field);
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
      },
      fields: {
        productImage: false,
        remark: false,
        manageRemark: false,
        printRemark: true,
        deliveryTime: false,
        shippingTime: true,
        hideInfo: true,
        hidePrice: true,
        showLogTraceId: true
      }
    };
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
  
  // 根據頁面類型自動執行對應的初始化
  if (currentPage.type === 'shipping') {
    // 物流單頁自動顯示面板
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (checkExtensionValid()) {
          setTimeout(injectShippingPanel, 300);
        }
      });
    } else {
      if (checkExtensionValid()) {
        setTimeout(injectShippingPanel, 300);
      }
    }
  } else if (currentPage.type === 'detail') {
    // 明細頁等待使用者啟動
    console.log('BV SHOP 出貨明細頁面已偵測，點擊擴充功能圖示以啟動');
    
    // 自動抓取明細資料（使用者啟動面板後）
    const observer = new MutationObserver((mutations) => {
      if (panelActive && document.querySelector('.order-content')) {
        fetchDetailData();
        observer.disconnect();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
})();
