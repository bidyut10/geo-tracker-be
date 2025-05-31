(function() {
  'use strict';
  const config = {
    endpoint: window.location.origin + '/api/track',
    sessionKey: 'tr_session',
    sessionTimeout: 30 * 60 * 1000, 
    batchSize: 10,
    batchTimeout: 5000, 
    maxRetries: 3,
    retryDelay: 1000 
  };

  // State management
  const state = {
    sessionId: null,
    lastPageView: null,
    eventQueue: [],
    isProcessing: false,
    projectId: null,
    initialized: false
  };

  // Initialize tracking
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    try {
      // Get project ID from script tag
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src;
        if (src.includes('t.js')) {
          const url = new URL(src);
          state.projectId = url.searchParams.get('pid');
          break;
        }
      }

      if (!state.projectId) {
        throw new Error('Project ID not found');
      }

      // Initialize session
      initSession();
      
      // Setup event listeners
      setupEventListeners();
      
      // Track initial pageview
      trackPageView();
    } catch (error) {
      console.error('[TrackRabbit] Initialization error:', error);
    }
  }

  // Session management
  function initSession() {
    try {
      const stored = localStorage.getItem(config.sessionKey);
      const now = Date.now();

      if (stored) {
        const { id, timestamp } = JSON.parse(stored);
        if (now - timestamp < config.sessionTimeout) {
          state.sessionId = id;
          return;
        }
      }

      state.sessionId = generateId();
      localStorage.setItem(config.sessionKey, JSON.stringify({
        id: state.sessionId,
        timestamp: now
      }));
    } catch (error) {
      state.sessionId = generateId(); 
    }
  }

  // Event tracking
  function trackPageView() {
    const data = {
      type: 'pageview',
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      timestamp: Date.now()
    };

    state.lastPageView = data;
    queueEvent(data);
  }

  function trackClick(e) {
    // Ignore clicks on tracking script elements
    if (e.target.closest('script[src*="t.js"]')) return;

    const target = e.target;
    const data = {
      type: 'click',
      element: {
        tag: target.tagName.toLowerCase(),
        id: target.id,
        class: target.className,
        text: target.textContent?.trim().substring(0, 100)
      },
      position: {
        x: e.clientX,
        y: e.clientY
      },
      timestamp: Date.now()
    };

    queueEvent(data);
  }

  function trackScroll() {
    const data = {
      type: 'scroll',
      depth: Math.round((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100),
      timestamp: Date.now()
    };

    queueEvent(data);
  }

  function trackRouteChange() {
    if (state.lastPageView) {
      const data = {
        type: 'route',
        from: state.lastPageView.url,
        to: window.location.href,
        timestamp: Date.now()
      };

      queueEvent(data);
      trackPageView();
    }
  }

  // Event queue management
  function queueEvent(event) {
    if (!state.sessionId || !state.projectId) return;

    state.eventQueue.push({
      ...event,
      sessionId: state.sessionId,
      projectId: state.projectId
    });

    if (state.eventQueue.length >= config.batchSize) {
      processQueue();
    } else if (!state.isProcessing) {
      setTimeout(processQueue, config.batchTimeout);
    }
  }

  async function processQueue() {
    if (state.isProcessing || state.eventQueue.length === 0) return;

    state.isProcessing = true;
    const batch = state.eventQueue.splice(0, config.batchSize);
    let retries = 0;

    while (retries < config.maxRetries) {
      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(batch),
          keepalive: true
        });

        if (response.ok) break;

        throw new Error(`HTTP error! status: ${response.status}`);
      } catch (error) {
        retries++;
        if (retries === config.maxRetries) {
          // Put events back in queue
          state.eventQueue.unshift(...batch);
        } else {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay * retries));
        }
      }
    }

    state.isProcessing = false;
    if (state.eventQueue.length > 0) {
      setTimeout(processQueue, config.batchTimeout);
    }
  }

  // Event listeners
  function setupEventListeners() {
    // Click tracking with debounce
    let clickTimeout;
    document.addEventListener('click', (e) => {
      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => trackClick(e), 100);
    }, { passive: true });

    // Scroll tracking with debounce
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(trackScroll, 100);
    }, { passive: true });

    // Route change tracking for SPAs
    if (window.history.pushState) {
      const originalPushState = window.history.pushState;
      window.history.pushState = function() {
        originalPushState.apply(this, arguments);
        trackRouteChange();
      };

      window.addEventListener('popstate', trackRouteChange);
    }

    // Unload tracking
    window.addEventListener('beforeunload', () => {
      const data = {
        type: 'unload',
        timestamp: Date.now()
      };
      
      // Use sendBeacon for unload events
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          config.endpoint,
          JSON.stringify([{
            ...data,
            sessionId: state.sessionId,
            projectId: state.projectId
          }])
        );
      } else {
        queueEvent(data);
        processQueue();
      }
    });
  }

  // Utility functions
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Start tracking
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
  