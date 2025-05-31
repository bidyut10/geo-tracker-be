(function () {
    'use strict';

    // Configuration
    const config = {
        endpoint: 'http://localhost:4000/api/track',
        sessionKey: 'tr_session',
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
        batchSize: 10,
        batchTimeout: 5000, // 5 seconds
        maxRetries: 3,
        retryDelay: 1000,
        queueStorageKey: 'tr_event_queue' // Key for local storage
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

    // Utility function to load queue from local storage
    function loadQueue() {
        try {
            const storedQueue = localStorage.getItem(config.queueStorageKey);
            if (storedQueue) {
                state.eventQueue = JSON.parse(storedQueue);
            }
        } catch (error) {
            console.error('TrackRabbit: Failed to load queue from storage', error);
            state.eventQueue = []; // Reset queue on error
        }
    }

    // Utility function to save queue to local storage
    function saveQueue() {
        try {
            localStorage.setItem(config.queueStorageKey, JSON.stringify(state.eventQueue));
        } catch (error) {
            console.error('TrackRabbit: Failed to save queue to storage', error);
        }
    }

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
            console.error('TrackRabbit: Failed to initialize session', error);
        }
    }

    // Track page view
    function trackPageView() {
        const data = {
            type: 'pageview',
            url: window.location.href,
            referrer: document.referrer,
            title: document.title,
            timestamp: Date.now(), // Send as timestamp number
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
        try {
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
            addToQueue(data);
        } catch (error) {
            console.error('TrackRabbit: Error tracking click', error);
        }
    }

    // Track scroll
    function trackScroll() {
        try {
            const data = {
                type: 'scroll',
                depth: Math.round((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100),
                timestamp: Date.now()
            };
            addToQueue(data);
        } catch (error) {
            console.error('TrackRabbit: Error tracking scroll', error);
        }
    }

    // Track route changes
    function trackRouteChange() {
        try {
            if (state.lastPageView) {
                const data = {
                    type: 'route',
                    from: state.lastPageView.url,
                    to: window.location.href,
                    timestamp: Date.now()
                };
                addToQueue(data);
                trackPageView();
            }
        } catch (error) {
            console.error('TrackRabbit: Error tracking route change', error);
        }
    }

    // Track custom events
    function trackEvent(eventName, properties = {}) {
        try {
            if (!eventName) {
                console.warn('TrackRabbit: Custom event name is required');
                return;
            }
            const data = {
                type: 'custom',
                name: eventName,
                properties: properties,
                url: window.location.href,
                timestamp: Date.now()
            };
            addToQueue(data);
        } catch (error) {
            console.error('TrackRabbit: Error tracking custom event', error);
        }
    }

    // Add event to queue with basic validation
    function addToQueue(data) {
        if (!state.sessionId || !state.projectId) {
            console.warn('TrackRabbit: Session or Project ID not available, skipping event', data);
            return;
        }

        // Basic validation
        if (!data.type || !data.timestamp) {
            console.warn('TrackRabbit: Invalid event data, skipping', data);
            return;
        }

        // Add required fields
        const eventData = {
            ...data,
            sessionId: state.sessionId,
            projectId: state.projectId
        };

        state.eventQueue.push(eventData);
        saveQueue(); // Save queue after adding event

        console.log('TrackRabbit: Event added to queue:', eventData.type);

        // Process queue when it reaches batch size or after timeout
        if (state.eventQueue.length >= config.batchSize) {
            sendBatch();
        } else if (!state.isProcessing) {
            // Use a small timeout to allow multiple events to be queued before sending
            setTimeout(() => {
                if (state.eventQueue.length > 0 && !state.isProcessing) {
                    sendBatch();
                }
            }, config.batchTimeout);
        }
    }

    // Send batched events
    async function sendBatch() {
        if (state.isProcessing || state.eventQueue.length === 0) return;

        state.isProcessing = true;
        // Take a snapshot of the current queue and clear it
        const batch = [...state.eventQueue];
        state.eventQueue = [];
        saveQueue(); // Clear queue in storage immediately

        console.log(`TrackRabbit: Sending batch of ${batch.length} events`);

        let retries = 0;

        while (retries < config.maxRetries) {
            try {
                const response = await fetch(config.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(batch), // Send the batch as array directly
                    keepalive: true
                });

                if (response.ok) {
                    console.info(`TrackRabbit: Successfully sent batch of ${batch.length} events`);
                    state.isProcessing = false;
                    // If there are new events added while sending, process them
                    if (state.eventQueue.length > 0) {
                        setTimeout(sendBatch, 100);
                    }
                    return; // Batch sent successfully
                }

                throw new Error(`HTTP error! status: ${response.status}`);
            } catch (error) {
                retries++;
                console.error(`TrackRabbit: Failed to send batch (attempt ${retries}/${config.maxRetries})`, error);

                if (retries === config.maxRetries) {
                    // Put original events back at the beginning of the queue if all retries fail
                    state.eventQueue.unshift(...batch);
                    saveQueue(); // Save failed batch back to storage
                    console.error(`TrackRabbit: All retries failed, ${batch.length} events returned to queue`);
                } else {
                    await new Promise(resolve => setTimeout(resolve, config.retryDelay * retries));
                }
            }
        }

        state.isProcessing = false;
        // If there are new events added while sending (and retries failed), process them
        if (state.eventQueue.length > 0) {
            setTimeout(sendBatch, 100);
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        try {
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
                window.history.pushState = function () {
                    originalPushState.apply(this, arguments);
                    trackRouteChange();
                };

                window.addEventListener('popstate', trackRouteChange);
            }

            // Unload tracking
            window.addEventListener('beforeunload', () => {
                try {
                    const data = {
                        type: 'unload',
                        sessionId: state.sessionId,
                        projectId: state.projectId,
                        timestamp: Date.now()
                    };

                    // Use sendBeacon for unload events
                    if (navigator.sendBeacon) {
                        // Include pending events and unload event
                        const batch = [...state.eventQueue, data];
                        state.eventQueue = []; // Clear queue before sending beacon
                        saveQueue();

                        navigator.sendBeacon(
                            config.endpoint,
                            JSON.stringify(batch)
                        );
                    } else {
                        // Fallback for browsers that don't support sendBeacon
                        addToQueue(data);
                        sendBatch();
                    }
                } catch (error) {
                    console.error('TrackRabbit: Error in beforeunload handler', error);
                }
            });
        } catch (error) {
            console.error('TrackRabbit: Error setting up event listeners', error);
        }
    }

    // Utility functions
    function generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
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
            // Load queue from storage first
            loadQueue();

            // Initialize session
            initSession();

            // Setup event listeners
            setupEventListeners();

            // Track initial pageview
            trackPageView();

            // Attempt to send any events loaded from storage
            if (state.eventQueue.length > 0) {
                setTimeout(() => {
                    if (!state.isProcessing) {
                        sendBatch();
                    }
                }, 1000); // Wait a bit for initialization to complete
            }

        } catch (error) {
            console.error('TrackRabbit: Initialization error:', error);
        }
    }

    // Start tracking when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose public API
    window.TrackRabbit = {
        trackEvent: trackEvent,
        // Expose some internal state for debugging
        getState: () => ({ ...state, eventQueue: state.eventQueue.length }),
        sendBatch: sendBatch // Allow manual batch sending
    };
})();