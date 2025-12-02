(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const SCRIPT_TAG = document.currentScript;
  const PRODUCT_ID = SCRIPT_TAG.getAttribute('data-product');
  const API_BASE = 'https://mysellkit.com/version-test/api/1.1/wf';
  const CHECKOUT_BASE = 'https://mysellkit.com/version-test';
  const WIDGET_VERSION = '1.1.16';
  
  let widgetConfig = null;
  let popupShown = false;
  let sessionId = null;
  let triggerActivated = false;
  let currentScrollPercent = 0;
  let currentTimeElapsed = 0;
  let timeInterval = null;
  
  // Check debug mode from multiple sources
  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG_MODE = urlParams.get('debug') === 'true' || 
                     urlParams.get('mysellkit_test') === 'true' ||
                     SCRIPT_TAG.getAttribute('data-debug') === 'true';
  
  if (DEBUG_MODE) {
    console.log(`🔧 MySellKit DEBUG MODE ENABLED (v${WIDGET_VERSION})`);
  }

  // ============================================
  // SESSION MANAGEMENT (localStorage avec expiration 24h)
  // ============================================
  
  function getSessionId() {
    if (sessionId) return sessionId;
    
    // In debug mode, always create new session on page load
    if (DEBUG_MODE) {
      sessionId = 'msk_debug_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      console.log('🔄 Debug mode: New session per page load:', sessionId);
      return sessionId;
    }
    
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
  // CHECK IF AUTOMATIC TRIGGER SHOULD RUN
  // ============================================
  
  function shouldTriggerPopup() {
    // Debug mode: always reset on page load, allow trigger
    if (DEBUG_MODE) {
      if (hasPurchasedProduct()) {
        console.log('❌ Product purchased - no trigger');
        return false;
      }
      console.log('✅ Debug mode: Will trigger popup (fresh page load)');
      return true;
    }
    
    // Check if product was purchased
    if (hasPurchasedProduct()) {
      console.log('❌ Product already purchased');
      return false;
    }
    
    // Check if user already had an impression this session
    const hasImpressionThisSession = sessionStorage.getItem(`mysellkit_impression_${PRODUCT_ID}`);
    if (hasImpressionThisSession) {
      console.log('❌ Already had impression this session - no auto trigger (click widget to reopen)');
      return false;
    }
    
    // Check 24h cooldown (only for first trigger)
    const lastSeen = localStorage.getItem(`mysellkit_seen_${PRODUCT_ID}`);
    if (lastSeen && Date.now() - lastSeen < 86400000) {
      console.log('❌ Widget already seen in last 24h');
      return false;
    }
    
    return true;
  }
  
  // ============================================
  // CHECK IF FLOATING WIDGET SHOULD SHOW
  // ============================================
  
  function shouldShowFloatingWidget() {
    // Never show if product was purchased
    if (hasPurchasedProduct()) {
      return false;
    }
    
    // In debug mode, never auto-show floating on fresh load
    if (DEBUG_MODE) {
      return false;
    }
    
    // Show floating widget if user already had an impression this session
    const hasImpressionThisSession = sessionStorage.getItem(`mysellkit_impression_${PRODUCT_ID}`);
    if (hasImpressionThisSession) {
      return true;
    }
    
    return false;
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
  // DEBUG BADGE UPDATES
  // ============================================
  
  function updateDebugBadge() {
    if (!DEBUG_MODE) return;
    
    const badge = document.getElementById('mysellkit-debug-badge');
    if (!badge) return;
    
    const config = widgetConfig;
    if (!config) return;
    
    let triggerInfo = '';
    
    switch(config.trigger_type) {
      case 'scroll':
        triggerInfo = `📜 Scroll: ${currentScrollPercent}% / ${config.trigger_value}%`;
        break;
      case 'time':
        triggerInfo = `⏱️ Time: ${currentTimeElapsed}s / ${config.trigger_value}s`;
        break;
      case 'exit_intent':
      case 'exit':
        triggerInfo = `🚪 Exit Intent`;
        break;
      default:
        triggerInfo = `Unknown trigger`;
    }
    
    const statusIcon = triggerActivated ? '✅' : '⏳';
    const statusText = triggerActivated ? 'TRIGGERED' : 'WAITING';
    
    // Check if draft mode
    const isDraft = config.is_live !== 'yes';
    const draftLabel = isDraft ? '<div style="font-size: 10px; margin-top: 4px; background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: 600;">🚧 DRAFT MODE</div>' : '';
    
    badge.innerHTML = `
      <div style="font-size: 10px; margin-bottom: 4px;">🔧 TEST MODE v${WIDGET_VERSION}</div>
      ${draftLabel}
      <div style="font-size: 11px;">${statusIcon} ${statusText}</div>
      <div style="font-size: 10px; margin-top: 4px; opacity: 0.9;">${triggerInfo}</div>
    `;
  }

  // ============================================
  // RENDER INCLUDED ITEMS
  // ============================================
  
  function renderIncludedItems(items, includedTitle) {
    if (!items || items.length === 0) return '';
    
    // Default title if not provided
    const title = includedTitle || "📦 What's Included:";
    
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
        <h3 class="mysellkit-included-title">${title}</h3>
        <div class="mysellkit-included-items">
          ${itemsHTML}
        </div>
      </div>
    `;
  }

  // ============================================
  // INJECT CSS
  // ============================================
  
  function injectCSS(config) {
    const style = document.createElement('style');
    
    // Extract colors from config (with fallbacks)
    const primaryColor = config.primary_color || '#00D66F';
    const leftBg = config.left_background || '#FFFFFF';
    const rightBg = config.right_background || '#F9FAFB';
    const textColor = config.text_color || '#1F2937';
    const textColorLight = config.text_color_light || '#9CA3AF';
    const ctaTextColor = config.cta_text_color || '#000000';
    
    if (DEBUG_MODE) {
      console.log('🎨 Applying colors:', { 
        primaryColor, 
        leftBg, 
        rightBg,
        textColor,
        textColorLight,
        ctaTextColor
      });
    }
    
    style.textContent = `
      /* DM Sans Font */
      @font-face {
        font-family: 'DM Sans';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('https://mysellkit.github.io/widget/dm-sans-v17-latin-regular.woff2') format('woff2');
      }
      @font-face {
        font-family: 'DM Sans';
        font-style: normal;
        font-weight: 500;
        font-display: swap;
        src: url('https://mysellkit.github.io/widget/dm-sans-v17-latin-500.woff2') format('woff2');
      }
      @font-face {
        font-family: 'DM Sans';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url('https://mysellkit.github.io/widget/dm-sans-v17-latin-600.woff2') format('woff2');
      }
      
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
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
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
        border-left-color: ${primaryColor};
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
      
      /* Left column - Fixed content with space-between */
      .mysellkit-left {
        width: 450px;
        height: 600px;
        background: ${leftBg};
        padding: 24px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      
      /* Top element - Image + Title */
      .mysellkit-top {
        display: flex;
        flex-direction: column;
      }
      
      .mysellkit-image-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 4/3;
        margin-bottom: 16px;
      }
      
      .mysellkit-image-wrapper.no-image {
        display: none;
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
        width: 100%;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 600;
        font-size: 24px;
        line-height: 1.3;
        color: ${textColor};
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        max-height: 62px;
      }
      
      /* Bottom section - Price + CTA */
      .mysellkit-bottom-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      
      /* Price */
      .mysellkit-price-container {
        display: flex;
        align-items: baseline;
        gap: 12px;
      }
      
      .mysellkit-price-container.no-price {
        display: none;
      }
      
      .mysellkit-price-current {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 500;
        font-size: 28px;
        color: ${textColor};
        letter-spacing: -0.02em;
      }
      
      .mysellkit-price-old {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 400;
        font-size: 22px;
        color: ${textColorLight};
        text-decoration: line-through;
        opacity: 0.8;
      }
      
      /* CTA + Powered by */
      .mysellkit-cta-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .mysellkit-cta {
        width: 100%;
        height: 54px;
        background: ${primaryColor};
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
        filter: brightness(0.95);
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
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
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 600;
        font-size: 15px;
        color: ${ctaTextColor};
        letter-spacing: -0.01em;
      }
      
      .mysellkit-cta-arrow {
        font-size: 16px;
        color: ${ctaTextColor};
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
        border: 2px solid ${ctaTextColor}40;
        border-radius: 50%;
        border-top-color: ${ctaTextColor};
        animation: mysellkit-spin 0.6s linear infinite;
      }
      
      @keyframes mysellkit-spin {
        to { transform: rotate(360deg); }
      }
      
      .mysellkit-powered {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px;
        color: ${textColorLight};
        text-align: center;
        font-weight: 400;
      }
      
      .mysellkit-powered a {
        color: ${textColorLight};
        text-decoration: none;
        font-weight: 600;
        transition: color 0.2s ease;
      }
      
      .mysellkit-powered a:hover {
        color: ${primaryColor};
      }
      
      /* Right column - Scrollable content */
      .mysellkit-right {
        width: 450px;
        height: 600px;
        background: ${rightBg};
        padding: 24px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 48px;
      }
      
      /* Description */
      .mysellkit-description {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 400;
        font-size: 15px;
        line-height: 1.65;
        color: ${textColor};
        letter-spacing: 0.01em;
      }
      
      .mysellkit-description p {
        margin-bottom: 16px;
      }
      
      .mysellkit-description p:last-child {
        margin-bottom: 0;
      }
      
      .mysellkit-description h3 {
        font-size: 18px;
        font-weight: 600;
        color: ${textColor};
        margin-bottom: 12px;
        margin-top: 8px;
      }
      
      .mysellkit-description strong {
        color: ${textColor};
        font-weight: 600;
      }
      
      .mysellkit-description em {
        font-style: italic;
        color: ${textColor};
      }
      
      .mysellkit-description ul,
      .mysellkit-description ol {
        list-style: none;
        padding: 0;
        margin-bottom: 16px;
      }
      
      .mysellkit-description ul li::before {
        content: "•";
        color: ${textColor};
        font-weight: bold;
        display: inline-block;
        width: 1em;
        margin-left: -1em;
      }
      
      .mysellkit-description ul li {
        margin-left: 1em;
        margin-bottom: 8px;
        color: ${textColor};
      }
      
      .mysellkit-description ul li p {
        display: inline;
        margin: 0;
      }
      
      .mysellkit-description ol {
        counter-reset: item;
      }
      
      .mysellkit-description ol li {
        counter-increment: item;
        margin-bottom: 8px;
        margin-left: 1.5em;
        color: ${textColor};
      }
      
      .mysellkit-description ol li::before {
        content: counter(item) ".";
        color: ${textColor};
        font-weight: 600;
        display: inline-block;
        width: 1.5em;
        margin-left: -1.5em;
      }
      
      .mysellkit-description ol li p {
        display: inline;
        margin: 0;
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
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 600;
        font-size: 18px;
        color: ${textColor};
        margin-bottom: 4px;
      }
      
      .mysellkit-included-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .mysellkit-included-item {
        min-height: 54px;
        background: ${leftBg};
        border-radius: 10px;
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: all 0.2s ease;
        border: 1px solid rgba(0, 0, 0, 0.04);
      }
      
      .mysellkit-included-item:hover {
        background: ${leftBg};
        transform: translateX(4px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        border-color: ${primaryColor}33;
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
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 500;
        font-size: 14px;
        line-height: 1.5;
        color: ${textColor};
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
      
      .mysellkit-float-image.no-image {
        background: ${primaryColor};
        color: white;
        font-weight: bold;
      }
      
      .mysellkit-float-info {
        flex: 1;
        min-width: 0;
      }
      
      .mysellkit-float-title {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 600;
        font-size: 14px;
        line-height: 1.4;
        color: ${textColor};
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        max-height: 39px;
      }
      
      .mysellkit-float-price {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 500;
        font-size: 18px;
        color: ${textColor};
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      
      .mysellkit-float-price-old {
        font-size: 14px;
        color: ${textColorLight};
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
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        z-index: 9999999;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        line-height: 1.4;
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
          display: block;
          overflow-y: auto;
          padding-bottom: 126px;
          background: ${rightBg};
        }
        
        /* When price is hidden, reduce padding */
        .mysellkit-left.no-price-mobile {
          padding-bottom: 82px;
        }
        
        .mysellkit-right {
          display: none;
        }
        
        .mysellkit-top {
          margin-bottom: 48px;
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
          font-size: 24px;
        }
        
        .mysellkit-price-container {
          margin-top: 0;
          margin-bottom: 0;
        }
        
        .mysellkit-price-container.no-price {
          display: none;
          margin-bottom: 0;
        }
        
        .mysellkit-mobile-content {
          display: flex;
          flex-direction: column;
          gap: 48px;
          margin-bottom: 24px;
          padding-bottom: 24px;
        }
        
        .mysellkit-bottom-section {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: ${leftBg};
          padding: 16px 20px 20px;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          z-index: 50;
          gap: 16px;
        }
        
        .mysellkit-cta-section {
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
      badge.id = 'mysellkit-debug-badge';
      badge.innerHTML = `
        <div style="font-size: 10px; margin-bottom: 4px;">🔧 TEST MODE v${WIDGET_VERSION}</div>
        <div style="font-size: 11px;">⏳ WAITING</div>
      `;
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
      ? renderIncludedItems(config.included_items, config.included_title)
      : '';
    
    // Description HTML
    const descriptionHTML = config.description_html || '';
    
    // Check if image exists
    const hasImage = config.image && config.image.trim() !== '';
    const imageWrapperClass = hasImage ? 'mysellkit-image-wrapper' : 'mysellkit-image-wrapper no-image';
    const imageHTML = hasImage ? `<img src="${config.image}" alt="${config.title}" class="mysellkit-image" />` : '';
    
    // Price display
    const showPrice = config.show_price === 'yes';
    const priceContainerClass = showPrice ? 'mysellkit-price-container' : 'mysellkit-price-container no-price';
    const leftColumnClass = showPrice ? 'mysellkit-left' : 'mysellkit-left no-price-mobile';
    const priceHTML = showPrice ? `
      <div class="${priceContainerClass}">
        <span class="mysellkit-price-current">${config.currency}${config.price}</span>
        ${config.old_price ? `<span class="mysellkit-price-old">${config.currency}${config.old_price}</span>` : ''}
      </div>
    ` : '';
    
    const floatPriceHTML = showPrice ? `
      <div class="mysellkit-float-price">
        <span>${config.currency}${config.price}</span>
        ${config.old_price ? `<span class="mysellkit-float-price-old">${config.currency}${config.old_price}</span>` : ''}
      </div>
    ` : '';
    
    overlay.innerHTML = `
      <div class="mysellkit-popup">
        
        <button class="mysellkit-close" aria-label="Close">×</button>
        
        <div class="${leftColumnClass}">
          
          <div class="mysellkit-top">
            <div class="${imageWrapperClass}">
              ${imageHTML}
            </div>
            <h2 class="mysellkit-title">${config.title}</h2>
          </div>
          
          <div class="mysellkit-mobile-content">
            ${descriptionHTML ? `<div class="mysellkit-description">${descriptionHTML}</div>` : ''}
            ${includedHTML}
          </div>
          
          <div class="mysellkit-bottom-section">
            ${priceHTML}
            <div class="mysellkit-cta-section">
              <button class="mysellkit-cta">
                <span class="mysellkit-cta-text">${config.cta_text || 'Get Instant Access'}</span>
                <span class="mysellkit-cta-arrow">→</span>
              </button>
              <p class="mysellkit-powered">
                Powered by <a href="https://mysellkit.com" target="_blank">My Sell Kit</a>
              </p>
            </div>
          </div>
          
        </div>
        
        <div class="mysellkit-right">
          ${descriptionHTML ? `<div class="mysellkit-description">${descriptionHTML}</div>` : ''}
          ${includedHTML}
        </div>
        
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Create floating widget
    createFloatingWidget(config, floatPriceHTML, hasImage);
    
    setupEventListeners(overlay, config);
  }

  // ============================================
  // CREATE FLOATING WIDGET
  // ============================================
  
  function createFloatingWidget(config, priceHTML, hasImage) {
    const floatingWidget = document.createElement('div');
    floatingWidget.className = 'mysellkit-floating-widget';
    floatingWidget.id = 'mysellkit-floating';
    
    // Handle missing image in floating widget - use custom emoji
    const floatingEmoji = config.floating_emoji || '✨';
    const floatImageClass = hasImage ? 'mysellkit-float-image' : 'mysellkit-float-image no-image';
    const floatImageContent = hasImage 
      ? `<img src="${config.image}" alt="${config.title}" class="mysellkit-float-image" />`
      : `<div class="${floatImageClass}">${floatingEmoji}</div>`;
    
    floatingWidget.innerHTML = `
      <div class="mysellkit-float-content">
        ${floatImageContent}
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
      
      // Only show floating widget if persistent mode is enabled
      const persistentModeEnabled = config.persistent_mode !== 'no';
      if (persistentModeEnabled) {
        showFloatingWidget();
      }
    });
    
    // Click overlay background
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (DEBUG_MODE) {
          console.log('❌ Overlay clicked (close)');
        }
        trackEvent('close');
        hidePopup();
        
        // Only show floating widget if persistent mode is enabled
        const persistentModeEnabled = config.persistent_mode !== 'no';
        if (persistentModeEnabled) {
          showFloatingWidget();
        }
      }
    });
    
    // CTA button
    overlay.querySelector('.mysellkit-cta').addEventListener('click', async (e) => {
      // Check if product is in draft mode
      if (config.is_live !== 'yes') {
        if (DEBUG_MODE) {
          console.log('🚧 Cannot checkout: Product is in DRAFT mode');
        }
        showToast('This product is in draft mode. Checkout is disabled.', 'error');
        return;
      }
      
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
        
        // ENHANCED LOGGING FOR DEBUG
        if (DEBUG_MODE) {
          console.log('===== CHECKOUT API RESPONSE =====');
          console.log('💳 Full response:', JSON.stringify(data, null, 2));
          console.log('💳 Response structure check:', {
            hasResponse: !!data.response,
            hasSuccess: !!data.response?.success,
            successValue: data.response?.success,
            hasCheckoutUrl: !!data.response?.checkout_url,
            checkoutUrlValue: data.response?.checkout_url,
            hasError: !!data.response?.error,
            errorValue: data.response?.error
          });
          console.log('=================================');
        }
        
        // Check if response is valid
        if (data.response && data.response.success === 'yes' && data.response.checkout_url) {
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
          // Handle error
          console.error('❌ Invalid checkout response structure:', data);
          
          let errorMessage = 'Unable to start checkout. ';
          
          // Try to extract error message
          if (data.response?.error) {
            errorMessage += data.response.error;
          } else if (data.error) {
            errorMessage += data.error;
          } else if (data.response?.success === 'no') {
            errorMessage += 'The checkout session could not be created.';
          } else {
            errorMessage += 'Please try again or contact support.';
          }
          
          showToast(errorMessage, 'error');
          
          // Reset button
          textElement.textContent = originalText;
          arrowElement.style.display = 'inline';
          spinner.remove();
          button.disabled = false;
        }
      } catch (error) {
        console.error('❌ Checkout request failed:', error);
        showToast('Connection error. Please check your internet and try again.', 'error');
        
        // Reset button
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
      
      // Show floating widget if persistent mode is enabled
      if (widgetConfig && widgetConfig.persistent_mode !== 'no') {
        setTimeout(() => {
          showFloatingWidget();
        }, 500);
      }
      
      // Clean URL
      const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]mysellkit_cancelled=true/, '').replace(/^&/, '?');
      window.history.replaceState({}, '', cleanUrl || window.location.pathname);
    }
  }
  
  // ============================================
  // CHECK FOR SUCCESSFUL PURCHASE
  // ============================================
  
  function checkForSuccessfulPurchase() {
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
    
    // Only setup triggers if this is the first impression of the session
    if (!shouldTriggerPopup()) {
      if (DEBUG_MODE) {
        console.log('⚠️ Skipping automatic trigger setup (already had impression or purchased)');
      }
      return;
    }
    
    // Check if we should trigger floating widget on mobile instead of popup
    const isMobile = window.innerWidth <= 768;
    const triggerFloatingOnMobile = config.mobile_trigger_floating === 'yes';
    
    if (DEBUG_MODE && isMobile && triggerFloatingOnMobile) {
      console.log('📱 Mobile detected + floating trigger enabled - will show floating widget instead of popup');
    }
    
    switch(config.trigger_type) {
      case 'scroll':
        setupScrollTrigger(config.trigger_value, isMobile && triggerFloatingOnMobile);
        break;
      case 'time':
        setupTimeTrigger(config.trigger_value, isMobile && triggerFloatingOnMobile);
        break;
      case 'exit_intent':
      case 'exit':
        setupExitTrigger(isMobile && triggerFloatingOnMobile);
        break;
      default:
        if (DEBUG_MODE) {
          console.log('⚠️ Unknown trigger type, defaulting to 5s time trigger');
        }
        setupTimeTrigger(5, isMobile && triggerFloatingOnMobile);
    }
  }
  
  function setupScrollTrigger(percentage, showFloatingInstead) {
    if (DEBUG_MODE) {
      console.log(`📜 Scroll trigger set at ${percentage}%`);
    }
    
    let triggered = false;
    window.addEventListener('scroll', () => {
      if (triggered) return;
      
      const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      currentScrollPercent = Math.round(scrollPercent);
      
      if (DEBUG_MODE) {
        updateDebugBadge();
      }
      
      if (scrollPercent >= percentage) {
        if (DEBUG_MODE) {
          console.log(`✅ Scroll trigger activated at ${scrollPercent.toFixed(0)}%`);
        }
        
        triggerActivated = true;
        if (DEBUG_MODE) {
          updateDebugBadge();
        }
        
        if (showFloatingInstead) {
          // Mark impression as shown even for floating
          sessionStorage.setItem(`mysellkit_impression_${PRODUCT_ID}`, 'true');
          showFloatingWidget();
        } else {
          showPopup();
        }
        triggered = true;
      }
    });
  }
  
  function setupTimeTrigger(seconds, showFloatingInstead) {
    if (DEBUG_MODE) {
      console.log(`⏱️ Time trigger set for ${seconds} seconds`);
    }
    
    // Update timer in debug mode
    if (DEBUG_MODE) {
      timeInterval = setInterval(() => {
        currentTimeElapsed++;
        updateDebugBadge();
        
        if (currentTimeElapsed >= seconds) {
          clearInterval(timeInterval);
        }
      }, 1000);
    }
    
    setTimeout(() => {
      if (DEBUG_MODE) {
        console.log(`✅ Time trigger activated after ${seconds}s`);
      }
      
      triggerActivated = true;
      if (DEBUG_MODE) {
        updateDebugBadge();
      }
      
      if (showFloatingInstead) {
        // Mark impression as shown even for floating
        sessionStorage.setItem(`mysellkit_impression_${PRODUCT_ID}`, 'true');
        showFloatingWidget();
      } else {
        showPopup();
      }
    }, seconds * 1000);
  }
  
  function setupExitTrigger(showFloatingInstead) {
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
      
      triggerActivated = true;
      if (DEBUG_MODE) {
        updateDebugBadge();
      }
      
      if (showFloatingInstead) {
        // Mark impression as shown even for floating
        sessionStorage.setItem(`mysellkit_impression_${PRODUCT_ID}`, 'true');
        showFloatingWidget();
      } else {
        showPopup();
      }
      triggered = true;
    });
  }

  // ============================================
  // INIT
  // ============================================
  
  async function init() {
    if (DEBUG_MODE) {
      console.log(`🚀 MySellKit Widget v${WIDGET_VERSION} initializing...`);
    }
    
    if (!PRODUCT_ID) {
      console.error('MySellKit: Missing data-product attribute');
      return;
    }
    
    if (DEBUG_MODE) {
      console.log('📦 Product ID:', PRODUCT_ID);
    }
    
    // Fetch config first
    widgetConfig = await fetchWidgetConfig();
    if (!widgetConfig) {
      console.error('MySellKit: Failed to load widget config');
      return;
    }
    
    // Check if product is live
    if (widgetConfig.is_live !== 'yes' && !DEBUG_MODE) {
      console.log('🚧 Product is in DRAFT mode - widget will not load in production');
      return; // Stop initialization in production
    }
    
    if (widgetConfig.is_live !== 'yes' && DEBUG_MODE) {
      console.log('🚧 DRAFT MODE: Product is not live. Checkout disabled. Widget will still display in debug mode.');
    }
    
    // Check for cancelled payment first
    checkForCancelledPayment();
    
    // Check for successful purchase
    checkForSuccessfulPurchase();
    
    // If product was purchased, don't show anything
    if (hasPurchasedProduct()) {
      if (DEBUG_MODE) {
        console.log('🛑 Product already purchased, widget initialization stopped');
      }
      return;
    }
    
    // Inject CSS with colors from config
    injectCSS(widgetConfig);
    createPopup(widgetConfig);
    
    // Check if user already had impression this session
    if (shouldShowFloatingWidget()) {
      if (DEBUG_MODE) {
        console.log('💬 User already had impression this session - showing floating widget immediately');
      }
      // Only show if persistent mode is enabled
      const persistentModeEnabled = widgetConfig.persistent_mode !== 'no';
      if (persistentModeEnabled) {
        setTimeout(() => {
          showFloatingWidget();
        }, 100);
      }
    } else {
      // First time in this session - setup triggers
      setupTriggers(widgetConfig);
    }
    
    if (DEBUG_MODE) {
      console.log('✅ MySellKit Widget initialized successfully');
      updateDebugBadge();
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
