// =============================================================
// frame_relay.js — runs in EVERY frame (main + all iframes)
// Responsible for: finding <video>, relaying progress to top,
// and cascading the "wake_up" signal down through nested iframes.
// =============================================================
(function () {
    'use strict';

    const APP_TAG = 'AniMangaTweaks';
    let isTrackerActive = false;

    function startVideoTracker() {
        if (isTrackerActive) return;
        isTrackerActive = true;

        setInterval(() => {
            const video = document.querySelector('video');
            // Only track videos longer than 5 minutes to skip ads
            if (video && video.duration > 300) {
                window.top.postMessage(
                    {
                        app: APP_TAG,
                        action: 'update_progress',
                        currentTime: video.currentTime,
                        duration: video.duration,
                    },
                    '*'
                );
            }
        }, 5000);
    }

    window.addEventListener('message', (event) => {
        if (!event.data || event.data.app !== APP_TAG) return;

        if (event.data.action === 'wake_up') {
            startVideoTracker();

            // Cascade the wake-up signal to any child iframes
            Array.from(document.querySelectorAll('iframe')).forEach((iframe) => {
                try {
                    iframe.contentWindow.postMessage(event.data, '*');
                } catch (_) {
                    // Cross-origin iframes will throw; postMessage itself is safe
                }
            });
        }
    });
})();