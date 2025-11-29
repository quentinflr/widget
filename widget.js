(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const SCRIPT_TAG = document.currentScript;
  const PRODUCT_ID = SCRIPT_TAG.getAttribute('data-product');
  const API_BASE = 'https://mysellkit.com/version-test/api/1.1/wf';
  const CHECKOUT_BASE = 'https://mysellkit.com/version-test';
  
  let widgetConfig = null;
  let popupShown = false;
  let sessionId = null;
  
  // Check debug mode from multiple sources
  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG_MODE = urlParams.get('debug') === 'true' || 
                     urlParams.get('mysellkit_test') === 'true' ||
                     SCRIPT_TAG.getAttribute('data-debug') === 'true';
  
  if (DEBUG_MODE) {
    console.log('🔧 MySellKit DEBUG MODE ENABLED');
  }

  // ============================================
  // SESSION MANAGEMENT (localStorage avec expiration 24h)
  // ============================================
  
  function getSessionId() {
    if (sessionId) return sessionId;
    
    // Check localStorage for existing session (24h expiration)
    const stored = localStorage.getItem('mysellkit_session');
    const storedTime = localStorage.getItem('mysellkit_session_time');
    
    // If exists and < 24h old → reuse
    if (stored && storedTime && (Date.now() - parseInt(storedTime) < 86400000)) {
      sessionId = stored;
      if (DEBUG_MODE) {
        const age = Math.round((Date.now() - parseInt(storedTime)) / 1000 / 60);
        console.log(`🔄 Reusing session (${age}min old):`, sessionId);
      }
    } else {
      // Create new session
      sessionId = 'msk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('mysellkit_session', sessionId);
      localStorage.setItem('mysellkit_session_time', Date.now().toString());
      if (DEBUG_MODE) {
        console.log('✨ New session created:', sessionId);
      }
    }
    
    return sessionId;
  }

  // ============================================
  // GENERATE PURCHASE TOKEN (unique par achat)
  // ============================================
  
  function generatePurchaseToken() {
    return 'pt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
  }

  // ============================================
  // CHECK IF USER HAS PURCHASED THIS PRODUCT
  // ============================================
  
  function hasPurchasedProduct() {
    // Check localStorage for permanent purchase record
    const purchased = localStorage.getItem(`mysellkit_purchased_${PRODUCT_ID}`);
    if (purchased) {
      if (DEBUG_MODE) {
        console.log('✅ User has already purchased this product');
      }
      return true;
    }
    return false;
  }
  
  function markProductAsPurchased() {
    localStorage.setItem(`mysellkit_purchased_${PRODUCT_ID}`, 'true');
    if (DEBUG_MODE) {
      console.log('💾 Product marked as purchased');
    }
  }

  // ============================================
  // CHECK IF WIDGET SHOULD SHOW
  // ============================================
  
  function shouldShowWidget() {
    // Debug mode: toujours montrer (sauf si acheté)
    if (DEBUG_MODE) {
      if (hasPurchasedProduct()) {
        console.log('❌ Product purchased - widget won\'t show (even in debug mode)');
        return false;
      }
      console.log('✅ Debug mode: Widget will show');
      return true;
    }
    
    // Check if product was purchased
    if (hasPurchasedProduct()) {
      console.log('❌ Product already purchased');
      return false;
    }
    
    const lastSeen = localStorage.getItem(`mysellkit_seen_${PRODUCT_ID}`);
    if (lastSeen && Date.now() - lastSeen < 86400000) {
      console.log('❌ Widget already seen in last 24h');
      return false;
    }
    
    const closedThisSession = sessionStorage.getItem(`mysellkit_closed_${PRODUCT_ID}`);
    if (closedThisSession) {
      console.log('❌ Widget closed this session');
      return false;
    }
    
    return true;
  }

  // ============================================
  // TOAST NOTIFICATION
  // ============================================
  
  function showToast(message, type = 'error') {
    // Check if toast already exists
    let toast = document.getElementById('mysellkit-toast');
    
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mysellkit-toast';
      toast.className = 'mysellkit-toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = `mysellkit-toast mysellkit-toast-${type} mysellkit-toast-show`;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      toast.classList.remove('mysellkit-toast-show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 5000);
  }

  // ============================================
  // FETCH WIDGET CONFIG
  // ============================================
  
  async function fetchWidgetConfig() {
    try {
      if (DEBUG_MODE) {
        console.log('📡 Fetching config for product:', PRODUCT_ID);
      }
      
      const response = await fetch(`${API_BASE}/get-widget-config?product_id=${PRODUCT_ID}`);
      const data = await response.json();
      
      if (DEBUG_MODE) {
        console.log('📦 Config received:', data);
      }
      
      if (data.response && data.response.success === 'yes') {
        // Fix image URL if needed
        if (data.response.image && data.response.image.startsWith('//')) {
          data.response.image = 'https:' + data.response.image;
        }
        return data.response;
      } else {
        console.error('MySellKit: Invalid product ID');
        return null;
      }
    } catch (error) {
      console.error('MySellKit: Failed to fetch config', error);
      return null;
    }
  }

  // ============================================
  // TRACK EVENTS (avec support additionalData)
  // ============================================
  
  async function trackEvent(eventType, additionalData = {}) {
    try {
      if (DEBUG_MODE) {
        console.log('📊 Tracking event:', eventType, additionalData);
      }
      
      await fetch(`${API_BASE}/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: PRODUCT_ID,
          session_id: getSessionId(),
          event_type: eventType,
          timestamp: Date.now(),
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          ...additionalData
        })
      });
      
      if (DEBUG_MODE) {
        console.log('✅ Event tracked:', eventType);
      }
    } catch (error) {
      console.error('MySellKit: Failed to track event', error);
    }
  }

  // ============================================
  // HTML SANITIZATION (simple version, à améliorer avec DOMPurify)
  // ============================================
  
  function sanitizeHTML(html) {
    // Pour MVP: simple escaping
    // TODO: Implémenter DOMPurify pour production
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.innerHTML;
  }

  // ============================================
  // RENDER INCLUDED ITEMS
  // ============================================
  
  function renderIncludedItems(items) {
    if (!items || items.length === 0) return '';
    
    const itemsHTML = items.map(item => {
      // Detect file type from extension
      let icon = '📄';
      if (item.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) icon = '🖼️';
      if (item.match(/\.(mp4|mov|avi|webm)$/i)) icon = '🎥';
      if (item.match(/\.(pdf)$/i)) icon = '📄';
      if (item.match(/\.(zip|rar)$/i)) icon = '📦';
      if (item.match(/\.(kml|kmz|gpx)$/i)) icon = '🗺️';
      
      return `
        <div class="mysellkit-included-item">
          <div class="mysellkit-file-icon">${icon}</div>
          <span class="mysellkit-file-name">${item}</span>
        </div>
      `;
    }).join('');
    
    return `
      <div class="mysellkit-included">
        <h3 class="mysellkit-included-title">📦 What's Included:</h3>
        <div class="mysellkit-included-items">
          ${itemsHTML}
        </div>
      </div>
    `;
  }

  // ============================================
  // INJECT CSS
  // ============================================
  
  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      /* Reset */
      .mysellkit-popup *,
      .mysellkit-floating-widget *,
      .mysellkit-toast * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      /* Toast Notification */
      .mysellkit-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-size: 14px;
        font-weight: 500;
        color: #1F2937;
        z-index: 10000000;
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
        max-width: 350px;
        border-left: 4px solid #EF4444;
      }
      
      .mysellkit-toast-show {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      
      .mysellkit-toast-error {
        border-left-color: #EF4444;
      }
      
      .mysellkit-toast-success {
        border-left-color: #00D66F;
      }
      
      /* Overlay */
      .mysellkit-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 999999;
        align-items: center;
        justify-content: center;
        animation: mysellkit-fadeIn 0.3s ease;
      }
      
      .mysellkit-overlay.visible {
        display: flex;
      }
      
      /* Popup entrance animation */
      @keyframes mysellkit-slideUp {
        from {
          opacity: 0;
          transform: translateY(30px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      @keyframes mysellkit-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes mysellkit-floatSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      /* Main popup container */
      .mysellkit-popup {
        width: 900px;
        max-width: 900px;
        height: 600px;
        background: white;
        border-radius: 24px;
        overflow: hidden;
        display: flex;
        box-shadow: 0 25px 70px rgba(0, 0, 0, 0.35);
        position: relative;
        animation: mysellkit-slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      /* Close button */
      .mysellkit-close {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 32px;
        height: 32px;
        background: rgba(0, 0, 0, 0.06);
        border: none;
        border-radius: 50%;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 100;
        color: #4B5563;
      }
      
      .mysellkit-close:hover {
        background: rgba(0, 0, 0, 0.12);
        transform: scale(1.1);
        color: #1F2937;
      }
      
      /* Left column - Fixed content */
      .mysellkit-left {
        width: 450px;
        height: 600px;
        background: #FFFFFF;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      
      /* Top element - Image + Title */
      .mysellkit-top {
        display: flex;
        flex-direction: column;
      }
      
      .mysellkit-image-wrapper {
        position: relative;
        width: 402px;
        height: 301px;
        margin-bottom: 12px;
      }
      
      .mysellkit-image {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s ease;
      }
      
      .mysellkit-image:hover {
        transform: scale(1.02);
      }
      
      .mysellkit-title {
        width: 402px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 24px;
        line-height: 1.3;
        color: #1F2937;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        max-height: 62px;
        min-height: 62px;
      }
      
      /* Middle element - Price */
      .mysellkit-price-container {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-top: auto;
      }
      
      .mysellkit-price-current {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 500;
        font-size: 28px;
        color: #1F2937;
        letter-spacing: -0.02em;
      }
      
      .mysellkit-price-old {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 400;
        font-size: 22px;
        color: #9CA3AF;
        text-decoration: line-through;
        opacity: 0.8;
      }
      
      /* Bottom element - CTA + Powered by */
      .mysellkit-bottom {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .mysellkit-cta {
        width: 100%;
        height: 54px;
        background: #00D66F;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        position: relative;
        overflow: hidden;
      }
      
      .mysellkit-cta::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%);
        pointer-events: none;
      }
      
      .mysellkit-cta:hover:not(:disabled) {
        background: #00C563;
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(0, 214, 111, 0.35);
      }
      
      .mysellkit-cta:active:not(:disabled) {
        transform: translateY(0);
      }
      
      .mysellkit-cta:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
      }
      
      .mysellkit-cta-text {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 15px;
        color: #000000;
        letter-spacing: -0.01em;
      }
      
      .mysellkit-cta-arrow {
        font-size: 16px;
        transition: transform 0.2s ease;
      }
      
      .mysellkit-cta:hover:not(:disabled) .mysellkit-cta-arrow {
        transform: translateX(3px);
      }
      
      /* Loading spinner */
      .mysellkit-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        border-top-color: #000000;
        animation: mysellkit-spin 0.6s linear infinite;
      }
      
      @keyframes mysellkit-spin {
        to { transform: rotate(360deg); }
      }
      
      .mysellkit-powered {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-size: 12px;
        color: #9CA3AF;
        text-align: center;
        font-weight: 400;
      }
      
      .mysellkit-powered a {
        color: #9CA3AF;
        text-decoration: none;
        font-weight: 600;
        transition: color 0.2s ease;
      }
      
      .mysellkit-powered a:hover {
        color: #00D66F;
      }
      
      /* Right column - Scrollable content */
      .mysellkit-right {
        width: 450px;
        height: 600px;
        background: linear-gradient(180deg, #F9FAFB 0%, #F3F4F6 100%);
        padding: 24px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      
      /* Description */
      .mysellkit-description {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 400;
        font-size: 15px;
        line-height: 1.65;
        color: #4B5563;
        letter-spacing: 0.01em;
      }
      
      .mysellkit-description p {
        margin-bottom: 16px;
      }
      
      .mysellkit-description p:last-child {
        margin-bottom: 0;
      }
      
      .mysellkit-description strong {
        color: #1F2937;
        font-weight: 600;
      }
      
      .mysellkit-description ul,
      .mysellkit-description ol {
        list-style: none;
        padding: 0;
        margin-bottom: 16px;
      }
      
      .mysellkit-description li {
        margin-bottom: 8px;
      }
      
      /* Divider */
      .mysellkit-divider {
        border: none;
        height: 1px;
        background: rgba(0, 0, 0, 0.06);
        margin: 4px 0;
      }
      
      /* What's Included section */
      .mysellkit-included {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      
      .mysellkit-included-title {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 16px;
        color: #1F2937;
        margin-bottom: 4px;
      }
      
      .mysellkit-included-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .mysellkit-included-item {
        min-height: 54px;
        background: #FFFFFF;
        border-radius: 10px;
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: all 0.2s ease;
        border: 1px solid rgba(0, 0, 0, 0.04);
      }
      
      .mysellkit-included-item:hover {
        background: #FAFAFA;
        transform: translateX(4px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        border-color: rgba(0, 214, 111, 0.2);
      }
      
      .mysellkit-file-icon {
        width: 34px;
        height: 34px;
        background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%);
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
        transition: transform 0.2s ease;
      }
      
      .mysellkit-included-item:hover .mysellkit-file-icon {
        transform: scale(1.1);
      }
      
      .mysellkit-file-name {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 500;
        font-size: 14px;
        line-height: 1.5;
        color: #374151;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      /* Custom scrollbar */
      .mysellkit-right::-webkit-scrollbar {
        width: 6px;
      }
      
      .mysellkit-right::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.02);
      }
      
      .mysellkit-right::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 3px;
        transition: background 0.2s;
      }
      
      .mysellkit-right::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.25);
      }
      
      /* Mobile-only content - HIDDEN ON DESKTOP */
      .mysellkit-mobile-content {
        display: none;
      }
      
      /* ========================================== */
      /* FLOATING WIDGET */
      /* ========================================== */
      
      .mysellkit-floating-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: white;
        border-radius: 16px;
        padding: 14px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 999998;
        display: none;
        animation: mysellkit-floatSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      .mysellkit-floating-widget.visible {
        display: block;
      }
      
      .mysellkit-floating-widget:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16), 0 4px 8px rgba(0, 0, 0, 0.1);
      }
      
      .mysellkit-float-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .mysellkit-float-image {
        width: 64px;
        height: 64px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        object-fit: cover;
      }
      
      .mysellkit-float-info {
        flex: 1;
        min-width: 0;
      }
      
      .mysellkit-float-title {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 14px;
        line-height: 1.4;
        color: #1F2937;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        max-height: 39px;
      }
      
      .mysellkit-float-price {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 500;
        font-size: 18px;
        color: #1F2937;
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      
      .mysellkit-float-price-old {
        font-size: 14px;
        color: #9CA3AF;
        text-decoration: line-through;
        font-weight: 400;
      }
      
      /* Debug badge */
      .mysellkit-debug-badge {
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: #ff6b6b;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: bold;
        z-index: 9999999;
        font-family: monospace;
      }
      
      /* ========================================== */
      /* MOBILE RESPONSIVE (<769px) */
      /* ========================================== */
      
      @media (max-width: 768px) {
        
        .mysellkit-toast {
          left: 16px;
          right: 16px;
          max-width: none;
          top: 16px;
        }
        
        .mysellkit-overlay {
          align-items: flex-end;
        }
        
        .mysellkit-popup {
          width: 100%;
          max-width: 100%;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
          flex-direction: column;
          animation: mysellkit-slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .mysellkit-close {
          top: 16px;
          right: 16px;
          background: rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
        }
        
        .mysellkit-left {
          width: 100%;
          height: 100%;
          padding: 20px 20px 0 20px;
          gap: 0;
          display: block;
          overflow-y: auto;
          padding-bottom: 90px;
        }
        
        .mysellkit-right {
          display: none;
        }
        
        .mysellkit-top {
          margin-bottom: 20px;
        }
        
        .mysellkit-image-wrapper {
          width: 100%;
          height: auto;
          aspect-ratio: 4/3;
          margin-bottom: 16px;
        }
        
        .mysellkit-image {
          width: 100%;
          height: 100%;
        }
        
        .mysellkit-title {
          width: 100%;
          font-size: 22px;
        }
        
        .mysellkit-price-container {
          margin-top: 0;
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        
        .mysellkit-mobile-content {
          display: flex;
          flex-direction: column;
          gap: 28px;
          margin-bottom: 24px;
          padding-bottom: 24px;
        }
        
        .mysellkit-bottom {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          padding: 16px 20px 20px;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          z-index: 50;
          gap: 8px;
        }
        
        .mysellkit-cta {
          height: 52px;
        }
        
        .mysellkit-left::-webkit-scrollbar {
          width: 4px;
        }
        
        .mysellkit-left::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.02);
        }
        
        .mysellkit-left::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 2px;
        }
        
        .mysellkit-floating-widget {
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          border-radius: 16px 16px 0 0;
          padding: 14px 20px;
          box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12);
        }
        
        .mysellkit-floating-widget:hover {
          transform: translateY(-2px);
        }
        
        .mysellkit-float-image {
          width: 56px;
          height: 56px;
          font-size: 28px;
        }
        
        .mysellkit-float-title {
          font-size: 13px;
        }
        
        .mysellkit-float-price {
          font-size: 15px;
        }
      }
      
      /* Tablet adjustment */
      @media (min-width: 769px) and (max-width: 900px) {
        .mysellkit-popup {
          width: 95vw;
        }
        
        .mysellkit-left,
        .mysellkit-right {
          width: 50%;
        }
        
        .mysellkit-image-wrapper,
        .mysellkit-image,
        .mysellkit-title {
          width: 100%;
        }
        
        .mysellkit-top {
          margin-bottom: 16px;
        }
      }
    `;
    
    document.head.appendChild(style);
    
    // Add debug badge if in debug mode
    if (DEBUG_MODE) {
      const badge = document.createElement('div');
      badge.className = 'mysellkit-debug-badge';
      badge.textContent = '🔧 TEST MODE';
      document.body.appendChild(badge);
    }
  }

  // ============================================
  // CREATE POPUP HTML
  // ============================================
  
  function createPopup(config) {
    if (DEBUG_MODE) {
      console.log('🎨 Creating popup with config:', config);
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'mysellkit-overlay';
    overlay.id = 'mysellkit-widget';
    
    // Included items HTML
    const includedHTML = config.included_items && config.included_items.length > 0 
      ? renderIncludedItems(config.included_items)
      : '';
    
    // Description HTML (sanitized)
    const descriptionHTML = config.description_html || '';
    
    // Price display
    const priceHTML = config.show_price === 'yes' ? `
      <div class="mysellkit-price-container">
        <span class="mysellkit-price-current">€${config.price}</span>
        ${config.old_price ? `<span class="mysellkit-price-old">€${config.old_price}</span>` : ''}
      </div>
    ` : '';
    
    const floatPriceHTML = config.show_price === 'yes' ? `
      <div class="mysellkit-float-price">
        <span>€${config.price}</span>
        ${config.old_price ? `<span class="mysellkit-float-price-old">€${config.old_price}</span>` : ''}
      </div>
    ` : '';
    
    overlay.innerHTML = `
      <div class="mysellkit-popup">
        
        <button class="mysellkit-close" aria-label="Close">×</button>
        
        <div class="mysellkit-left">
          
          <div class="mysellkit-top">
            <div class="mysellkit-image-wrapper">
              <img src="${config.image}" alt="${config.title}" class="mysellkit-image" />
            </div>
            <h2 class="mysellkit-title">${config.title}</h2>
          </div>
          
          ${priceHTML}
          
          <div class="mysellkit-mobile-content">
            ${descriptionHTML ? `<div class="mysellkit-description">${descriptionHTML}</div>` : ''}
            ${includedHTML}
          </div>
          
          <div class="mysellkit-bottom">
            <button class="mysellkit-cta">
              <span class="mysellkit-cta-text">${config.cta_text || 'Get Instant Access'}</span>
              <span class="mysellkit-cta-arrow">→</span>
            </button>
            <p class="mysellkit-powered">
              Powered by <a href="https://mysellkit.com" target="_blank">mysellkit</a>
            </p>
          </div>
          
        </div>
        
        <div class="mysellkit-right">
          ${descriptionHTML ? `<div class="mysellkit-description">${descriptionHTML}</div>` : ''}
          ${includedHTML ? '<hr class="mysellkit-divider" />' : ''}
          ${includedHTML}
        </div>
        
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Create floating widget
    createFloatingWidget(config, floatPriceHTML);
    
    setupEventListeners(overlay, config);
  }

  // ============================================
  // CREATE FLOATING WIDGET
  // ============================================
  
  function createFloatingWidget(config, priceHTML) {
    const floatingWidget = document.createElement('div');
    floatingWidget.className = 'mysellkit-floating-widget';
    floatingWidget.id = 'mysellkit-floating';
    
    floatingWidget.innerHTML = `
      <div class="mysellkit-float-content">
        <img src="${config.image}" alt="${config.title}" class="mysellkit-float-image" />
        <div class="mysellkit-float-info">
          <div class="mysellkit-float-title">${config.title}</div>
          ${priceHTML}
        </div>
      </div>
    `;
    
    document.body.appendChild(floatingWidget);
    
    // Click on floating widget → Show popup
    floatingWidget.addEventListener('click', () => {
      if (DEBUG_MODE) {
        console.log('🔄 Floating widget clicked - reopening popup');
      }
      hideFloatingWidget();
      showPopup();
    });
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================
  
  function setupEventListeners(overlay, config) {
    // Close button
    overlay.querySelector('.mysellkit-close').addEventListener('click', () => {
      if (DEBUG_MODE) {
        console.log('❌ Close button clicked');
      }
      trackEvent('close');
      hidePopup();
      showFloatingWidget();
    });
    
    // Click overlay background
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (DEBUG_MODE) {
          console.log('❌ Overlay clicked (close)');
        }
        trackEvent('close');
        hidePopup();
        showFloatingWidget();
      }
    });
    
    // CTA button
    overlay.querySelector('.mysellkit-cta').addEventListener('click', async (e) => {
      if (DEBUG_MODE) {
        console.log('🛒 CTA button clicked');
      }
      
      const button = e.target.closest('.mysellkit-cta');
      
      // Generate unique purchase token
      const purchaseToken = generatePurchaseToken();
      
      if (DEBUG_MODE) {
        console.log('🎫 Purchase token generated:', purchaseToken);
      }
      
      // Track click with purchase token
      trackEvent('click', { purchase_token: purchaseToken });
      
      // Show loading state
      const textElement = button.querySelector('.mysellkit-cta-text');
      const arrowElement = button.querySelector('.mysellkit-cta-arrow');
      const originalText = textElement.textContent;
      
      textElement.textContent = 'Loading...';
      arrowElement.style.display = 'none';
      button.disabled = true;
      
      // Add spinner
      const spinner = document.createElement('span');
      spinner.className = 'mysellkit-spinner';
      button.appendChild(spinner);
      
      try {
        // Create Stripe Checkout Session
        const response = await fetch(`${API_BASE}/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_id: PRODUCT_ID,
            session_id: getSessionId(),
            purchase_token: purchaseToken,
            success_url: `${CHECKOUT_BASE}/payment-processing?token=${purchaseToken}`,
            cancel_url: window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'mysellkit_cancelled=true'
          })
        });
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
          console.log('💳 Checkout session created:', data);
        }
        
        if (data.response && data.response.success === 'yes') {
          // Store purchase token for potential return
          sessionStorage.setItem('mysellkit_purchase_token', purchaseToken);
          
          if (DEBUG_MODE) {
            console.log('✅ Checkout URL received, closing popup and redirecting...');
          }
          
          // Close popup before redirect (better UX)
          hidePopup();
          
          // Redirect to Stripe Checkout
          if (DEBUG_MODE) {
            console.log('🔗 Redirecting to Stripe:', data.response.checkout_url);
          }
          
          window.location.href = data.response.checkout_url;
        } else {
          console.error('Failed to create checkout session');
          textElement.textContent = 'Error - Try again';
          arrowElement.style.display = 'inline';
          spinner.remove();
          button.disabled = false;
        }
      } catch (error) {
        console.error('Error creating checkout:', error);
        textElement.textContent = originalText;
        arrowElement.style.display = 'inline';
        spinner.remove();
        button.disabled = false;
      }
    });
  }

  // ============================================
  // SHOW/HIDE POPUP & FLOATING WIDGET
  // ============================================
  
  function showPopup() {
    const overlay = document.getElementById('mysellkit-widget');
    if (!overlay) return;
    
    if (DEBUG_MODE) {
      console.log('🎉 Showing popup!');
    }
    
    overlay.classList.add('visible');
    popupShown = true;
    
    // Track impression only on first show
    if (!sessionStorage.getItem(`mysellkit_impression_${PRODUCT_ID}`)) {
      trackEvent('impression');
      sessionStorage.setItem(`mysellkit_impression_${PRODUCT_ID}`, 'true');
    }
    
    // Don't save to localStorage in debug mode
    if (!DEBUG_MODE) {
      localStorage.setItem(`mysellkit_seen_${PRODUCT_ID}`, Date.now());
    }
  }
  
  function hidePopup() {
    const overlay = document.getElementById('mysellkit-widget');
    if (!overlay) return;
    
    overlay.classList.remove('visible');
    
    // Don't save to sessionStorage in debug mode
    if (!DEBUG_MODE) {
      sessionStorage.setItem(`mysellkit_closed_${PRODUCT_ID}`, 'true');
    }
  }
  
  function showFloatingWidget() {
    const floating = document.getElementById('mysellkit-floating');
    if (!floating) return;
    
    if (DEBUG_MODE) {
      console.log('💬 Showing floating widget');
    }
    
    setTimeout(() => {
      floating.classList.add('visible');
    }, 300);
  }
  
  function hideFloatingWidget() {
    const floating = document.getElementById('mysellkit-floating');
    if (!floating) return;
    
    floating.classList.remove('visible');
  }
  
  function hideAllWidgets() {
    if (DEBUG_MODE) {
      console.log('🚫 Hiding all widgets (purchase completed)');
    }
    
    hidePopup();
    hideFloatingWidget();
  }

  // ============================================
  // CHECK FOR PAYMENT CANCEL
  // ============================================
  
  function checkForCancelledPayment() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('mysellkit_cancelled') === 'true') {
      if (DEBUG_MODE) {
        console.log('💳 Payment was cancelled, showing toast notification');
      }
      
      // Show toast notification
      showToast('Payment was not completed. You can try again anytime!', 'error');
      
      // Show floating widget (user didn't purchase)
      setTimeout(() => {
        showFloatingWidget();
      }, 500);
      
      // Clean URL
      const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]mysellkit_cancelled=true/, '').replace(/^&/, '?');
      window.history.replaceState({}, '', cleanUrl || window.location.pathname);
    }
  }
  
  // ============================================
  // CHECK FOR SUCCESSFUL PURCHASE
  // ============================================
  
  function checkForSuccessfulPurchase() {
    // Check if we're returning from a successful purchase
    // This could be done via URL param, or by checking sessionStorage
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('mysellkit_success') === 'true') {
      if (DEBUG_MODE) {
        console.log('✅ Successful purchase detected, marking product as purchased');
      }
      
      // Mark product as purchased
      markProductAsPurchased();
      
      // Hide all widgets
      hideAllWidgets();
      
      // Clean URL
      const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]mysellkit_success=true/, '').replace(/^&/, '?');
      window.history.replaceState({}, '', cleanUrl || window.location.pathname);
    }
  }

  // ============================================
  // TRIGGERS
  // ============================================
  
  function setupTriggers(config) {
    if (DEBUG_MODE) {
      console.log('⚡ Setting up trigger:', config.trigger_type, 'with value:', config.trigger_value);
    }
    
    // Only setup triggers if popup hasn't been shown yet
    if (!shouldShowWidget()) {
      return;
    }
    
    switch(config.trigger_type) {
      case 'scroll':
        setupScrollTrigger(config.trigger_value);
        break;
      case 'time':
        setupTimeTrigger(config.trigger_value);
        break;
      case 'exit_intent':
      case 'exit':
        setupExitTrigger();
        break;
      default:
        if (DEBUG_MODE) {
          console.log('⚠️ Unknown trigger type, defaulting to 5s time trigger');
        }
        setupTimeTrigger(5);
    }
  }
  
  function setupScrollTrigger(percentage) {
    if (DEBUG_MODE) {
      console.log(`📜 Scroll trigger set at ${percentage}%`);
    }
    
    let triggered = false;
    window.addEventListener('scroll', () => {
      if (triggered) return;
      const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      
      if (DEBUG_MODE && scrollPercent % 10 < 1) {
        console.log(`📜 Current scroll: ${scrollPercent.toFixed(0)}%`);
      }
      
      if (scrollPercent >= percentage) {
        if (DEBUG_MODE) {
          console.log(`✅ Scroll trigger activated at ${scrollPercent.toFixed(0)}%`);
        }
        showPopup();
        triggered = true;
      }
    });
  }
  
  function setupTimeTrigger(seconds) {
    if (DEBUG_MODE) {
      console.log(`⏱️ Time trigger set for ${seconds} seconds`);
    }
    
    setTimeout(() => {
      if (DEBUG_MODE) {
        console.log(`✅ Time trigger activated after ${seconds}s`);
      }
      showPopup();
    }, seconds * 1000);
  }
  
  function setupExitTrigger() {
    if (DEBUG_MODE) {
      console.log('🚪 Exit intent trigger set');
    }
    
    let triggered = false;
    document.addEventListener('mouseleave', (e) => {
      if (triggered) return;
      if (e.clientY > 10) return;
      
      if (DEBUG_MODE) {
        console.log('✅ Exit intent trigger activated');
      }
      showPopup();
      triggered = true;
    });
  }

  // ============================================
  // INIT
  // ============================================
  
  async function init() {
    if (DEBUG_MODE) {
      console.log('🚀 MySellKit Widget initializing...');
    }
    
    if (!PRODUCT_ID) {
      console.error('MySellKit: Missing data-product attribute');
      return;
    }
    
    if (DEBUG_MODE) {
      console.log('📦 Product ID:', PRODUCT_ID);
    }
    
    // Check for cancelled payment first
    checkForCancelledPayment();
    
    // Check for successful purchase
    checkForSuccessfulPurchase();
    
    // If product was purchased, don't show widget
    if (hasPurchasedProduct()) {
      if (DEBUG_MODE) {
        console.log('🛑 Product already purchased, widget initialization stopped');
      }
      return;
    }
    
    widgetConfig = await fetchWidgetConfig();
    if (!widgetConfig) {
      console.error('MySellKit: Failed to load widget config');
      return;
    }
    
    injectCSS();
    createPopup(widgetConfig);
    setupTriggers(widgetConfig);
    
    if (DEBUG_MODE) {
      console.log('✅ MySellKit Widget initialized successfully');
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
