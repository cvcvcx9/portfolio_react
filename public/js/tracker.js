/**
 * MongoDash User Behavior Tracker
 * 
 * 사용법:
 * <script src="/js/tracker.js"></script>
 * <script>
 *   const tracker = new MongoDashTracker({
 *     apiEndpoint: 'http://localhost:8080/api/track'
 *   });
 *   tracker.init();
 * </script>
 */

class MongoDashTracker {
    constructor(config) {
        this.apiEndpoint = config.apiEndpoint || 'http://api.cvcvcx9.org:8081/api/track';
        this.sessionId = this.generateUUID();
        this.eventBuffer = [];
        this.bufferLimit = 10; // 10개 쌓이면 자동 전송
        this.flushInterval = 5000; // 5초마다 자동 전송
        this.lastMouseTime = 0;
    }

    init() {
        console.log('MongoDash Tracker Initialized');
        this.startSession();
        this.setupEventListeners();
        
        // 주기적으로 데이터 전송
        setInterval(() => this.flush(), this.flushInterval);
    }

    // 1. 세션 시작 (방문자 정보 전송)
    async startSession() {
        const sessionData = {
            sessionId: this.sessionId,
            referrer: document.referrer,
            referrerDomain: this.getDomain(document.referrer),
            landingUrl: window.location.href,
            deviceType: this.getDeviceType(),
            userAgent: navigator.userAgent,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        };

        try {
            await fetch(`${this.apiEndpoint}/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionData)
            });
            console.log('Session started:', this.sessionId);
        } catch (e) {
            console.error('Failed to start session', e);
        }
    }

    // 2. 이벤트 리스너 등록
    setupEventListeners() {
        // 클릭 이벤트
        document.addEventListener('click', (e) => {
            this.trackEvent('CLICK', {
                x: e.pageX,
                y: e.pageY,
                targetSelector: this.getSelector(e.target)
            });
        });

        // 마우스 이동 (Throttling: 0.5초마다 수집)
        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - this.lastMouseTime > 500) {
                this.trackEvent('MOVE', {
                    x: e.pageX,
                    y: e.pageY
                });
                this.lastMouseTime = now;
            }
        });

        // 페이지 이탈 시 남은 데이터 전송
        window.addEventListener('beforeunload', () => {
            this.flush();
        });
    }

    // 3. 이벤트 버퍼에 추가
    trackEvent(type, data = {}) {
        const event = {
            sessionId: this.sessionId,
            pageUrl: window.location.href,
            eventType: type,
            timestamp: new Date().toISOString(),
            ...data
        };

        this.eventBuffer.push(event);

        if (this.eventBuffer.length >= this.bufferLimit) {
            this.flush();
        }
    }

    // 4. 데이터 전송 (Flush)
    async flush() {
        if (this.eventBuffer.length === 0) return;

        const eventsToSend = [...this.eventBuffer];
        this.eventBuffer = []; // 버퍼 비우기

        try {
            // sendBeacon은 페이지 이탈 시에도 안정적으로 전송됨
            const blob = new Blob([JSON.stringify(eventsToSend)], { type: 'application/json' });
            navigator.sendBeacon(`${this.apiEndpoint}/events`, blob);
            
            // fetch fallback (sendBeacon이 안될 경우를 대비해 fetch도 고려 가능하지만 여기선 생략)
            console.log(`Flushed ${eventsToSend.length} events`);
        } catch (e) {
            console.error('Failed to flush events', e);
            // 실패 시 다시 버퍼에 넣는 로직이 필요할 수 있음
        }
    }

    // --- 유틸리티 함수들 ---

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    getDeviceType() {
        const width = window.innerWidth;
        if (width < 768) return 'mobile';
        if (width < 1024) return 'tablet';
        return 'desktop';
    }

    getDomain(url) {
        if (!url) return null;
        try {
            return new URL(url).hostname;
        } catch (e) {
            return null;
        }
    }

    getSelector(element) {
        if (!element) return null;
        if (element.id) return '#' + element.id;
        if (element.className) return '.' + element.className.split(' ').join('.');
        return element.tagName.toLowerCase();
    }
}

if (typeof window !== 'undefined') {
    window.MongoDashTracker = MongoDashTracker;
}
