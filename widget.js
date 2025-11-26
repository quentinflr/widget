(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const SCRIPT_TAG = document.currentScript;
  const PRODUCT_ID = SCRIPT_TAG.getAttribute('data-product');
  const API_BASE = 'https://mysellkit.com/api/1.1/wf';
  const CHECKOUT_BASE = 'https://mysellkit.com';
  
  let widgetConfig = null;
  let widgetShown = false;
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
  // SESSION MANAGEMENT
  // ============================================
  
  function getSessionId() {
    if (sessionId) return sessionId;
    
    sessionId = sessionStorage.getItem('mysellkit_session');
    
    if (!sessionId) {
      sessionId = 'msk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('mysellkit_session', sessionId);
    }
    
    if (DEBUG_MODE) {
      console.log('🔑 Session ID:', sessionId);
    }
    
    return sessionId;
  }

  // ============================================
  // CHECK IF WIDGET SHOULD SHOW
  // ============================================
  
  function shouldShowWidget() {
    // Debug mode: toujours montrer
    if (DEBUG_MODE) {
      console.log('✅ Debug mode: Widget will show');
      return true;
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
  // TRACK EVENTS
  // ============================================
  
  async function trackEvent(eventType) {
    try {
      if (DEBUG_MODE) {
        console.log('📊 Tracking event:', eventType);
      }
      
      await fetch(`${API_BASE}/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: PRODUCT_ID,
          event_type: eventType,
          session_id: getSessionId(),
          timestamp: Date.now(),
          page_url: window.location.href,
          user_agent: navigator.userAgent
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
  // INJECT CSS
  // ============================================
  
  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
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
      
      .mysellkit-popup {
        background: white;
        border-radius: 16px;
        padding: 32px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        position: relative;
        animation: mysellkit-slideUp 0.3s ease;
        text-align: center;
      }
      
      .mysellkit-overlay.bottom-right {
        align-items: flex-end;
        justify-content: flex-end;
        padding: 20px;
        background: transparent;
      }
      
      .mysellkit-overlay.bottom-right .mysellkit-popup {
        max-width: 320px;
        animation: mysellkit-slideInRight 0.3s ease;
      }
      
      .mysellkit-close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: transparent;
        border: none;
        font-size: 28px;
        line-height: 1;
        cursor: pointer;
        color: #999;
        transition: color 0.2s;
        padding: 0;
        width: 32px;
        height: 32px;
      }
      
      .mysellkit-close:hover {
        color: #333;
      }
      
      .mysellkit-image {
        width: 100%;
        max-width: 200px;
        height: auto;
        border-radius: 12px;
        margin-bottom: 20px;
      }
      
      .mysellkit-title {
        font-size: 24px;
        font-weight: 700;
        color: #1a1a1a;
        margin: 0 0 12px 0;
        line-height: 1.3;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      
      .mysellkit-price {
        font-size: 32px;
        font-weight: 800;
        color: #3B82F6;
        margin: 0 0 24px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      
      .mysellkit-cta {
        background: #3B82F6;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 16px 32px;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        transition: all 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      
      .mysellkit-cta:hover {
        background: #2563EB;
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
      }
      
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
      
      @keyframes mysellkit-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes mysellkit-slideUp {
        from { 
          opacity: 0;
          transform: translateY(30px);
        }
        to { 
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @keyframes mysellkit-slideInRight {
        from { 
          opacity: 0;
          transform: translateX(30px);
        }
        to { 
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      @media (max-width: 480px) {
        .mysellkit-popup {
          padding: 24px;
          max-width: 90%;
        }
        
        .mysellkit-title {
          font-size: 20px;
        }
        
        .mysellkit-price {
          font-size: 28px;
        }
        
        .mysellkit-cta {
          font-size: 16px;
          padding: 14px 28px;
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
    
    if (config.position === 'bottom-right') {
      overlay.classList.add('bottom-right');
    }
    
    overlay.innerHTML = `
      <div class="mysellkit-popup">
        <button class="mysellkit-close" aria-label="Close">×</button>
        <img src="${config.image}" alt="${config.title}" class="mysellkit-image">
        <h3 class="mysellkit-title">${config.title}</h3>
        <p class="mysellkit-price">€${config.price}</p>
        <button class="mysellkit-cta">Get Now</button>
      </div>
    `;
    
    document.body.appendChild(overlay);
    setupEventListeners(overlay, config);
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================
  
  function setupEventListeners(overlay, config) {
    overlay.querySelector('.mysellkit-close').addEventListener('click', () => {
      if (DEBUG_MODE) {
        console.log('❌ Close button clicked');
      }
      hidePopup();
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (DEBUG_MODE) {
          console.log('❌ Overlay clicked (close)');
        }
        hidePopup();
      }
    });
    
    overlay.querySelector('.mysellkit-cta').addEventListener('click', async () => {
      if (DEBUG_MODE) {
        console.log('🛒 CTA button clicked');
      }
      
      // Track click
      trackEvent('click');
      
      // Show loading state
      const button = overlay.querySelector('.mysellkit-cta');
      const originalText = button.textContent;
      button.textContent = 'Loading...';
      button.disabled = true;
      
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
            success_url: `${CHECKOUT_BASE}/success?session_id={CHECKOUT_SESSION_ID}&product_id=${PRODUCT_ID}&tracking_session=${getSessionId()}`,
            cancel_url: window.location.href
          })
        });
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
          console.log('💳 Checkout session created:', data);
        }
        
        if (data.response && data.response.success === 'yes') {
          // Redirect to Stripe Checkout
          if (DEBUG_MODE) {
            console.log('🔗 Redirecting to Stripe:', data.response.checkout_url);
          }
          window.location.href = data.response.checkout_url;
        } else {
          console.error('Failed to create checkout session');
          button.textContent = 'Error - Try again';
          button.disabled = false;
        }
      } catch (error) {
        console.error('Error creating checkout:', error);
        button.textContent = originalText;
        button.disabled = false;
      }
    });
  }

  // ============================================
  // SHOW/HIDE POPUP
  // ============================================
  
  function showPopup() {
    if (widgetShown) {
      if (DEBUG_MODE) {
        console.log('⚠️ Widget already shown');
      }
      return;
    }
    
    if (!shouldShowWidget()) {
      return;
    }
    
    const overlay = document.getElementById('mysellkit-widget');
    if (!overlay) return;
    
    if (DEBUG_MODE) {
      console.log('🎉 Showing widget!');
    }
    
    overlay.classList.add('visible');
    widgetShown = true;
    
    trackEvent('impression');
    
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

  // ============================================
  // TRIGGERS
  // ============================================
  
  function setupTriggers(config) {
    if (DEBUG_MODE) {
      console.log('⚡ Setting up trigger:', config.trigger_type, 'with value:', config.trigger_value);
    }
    
    switch(config.trigger_type) {
      case 'scroll':
        setupScrollTrigger(config.trigger_value);
        break;
      case 'time':
        setupTimeTrigger(config.trigger_value);
        break;
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
