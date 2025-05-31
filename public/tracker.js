(function() {
    'use strict';
    
    // Configuration
    const config = {
        endpoint: window.location.origin + '/api/track',
        sessionKey: 'tr_session',
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
        batchSize: 10,
        batchTimeout: 5000, // 5 seconds
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

    // Get project ID from script URL
    const scripts = document.getElementsByTagName('script');
    const currentScript = scripts[scripts.length - 1];
    const projectId = new URL(currentScript.src).searchParams.get('pid');
    
    if (!projectId) {
        console.error('TrackRabbit: Project ID is required');
        return;
    }

    state.projectId = projectId;

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

    // Track page view
    function trackPageView() {
        const data = {
            type: 'pageview',
            url: window.location.href,
            referrer: document.referrer,
            title: document.title,
            timestamp: new Date().toISOString(),
            screen: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            userAgent: navigator.userAgent,
            language: navigator.language
        };
        state.lastPageView = data;
        addToQueue(data);
    }

    // Track clicks
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
            timestamp: new Date().toISOString()
        };
        addToQueue(data);
    }

    // Track scroll
    function trackScroll() {
        const data = {
            type: 'scroll',
            depth: Math.round((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100),
            timestamp: new Date().toISOString()
        };
        addToQueue(data);
    }

    // Track route changes
    function trackRouteChange() {
        if (state.lastPageView) {
            const data = {
                type: 'route',
                from: state.lastPageView.url,
                to: window.location.href,
                timestamp: new Date().toISOString()
            };
            addToQueue(data);
            trackPageView();
        }
    }

    // Track custom events
    function trackEvent(eventName, properties = {}) {
        const data = {
            type: 'event',
            name: eventName,
            properties: properties,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };
        addToQueue(data);
    }

    // Add event to queue
    function addToQueue(data) {
        if (!state.sessionId || !state.projectId) return;

        state.eventQueue.push({
            ...data,
            sessionId: state.sessionId,
            projectId: state.projectId
        });

        if (state.eventQueue.length >= config.batchSize) {
            sendBatch();
        } else if (!state.isProcessing) {
            setTimeout(sendBatch, config.batchTimeout);
        }
    }

    // Send batched events
    async function sendBatch() {
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
            setTimeout(sendBatch, config.batchTimeout);
        }
    }

    // Setup event listeners
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
                timestamp: new Date().toISOString()
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
                addToQueue(data);
                sendBatch();
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

    // Initialize tracking
    function init() {
        if (state.initialized) return;
        state.initialized = true;

        try {
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

    // Start tracking
    init();

    // Expose public API
    window.TrackRabbit = {
        trackEvent: trackEvent
    };
})(); 