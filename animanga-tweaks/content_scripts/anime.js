// =============================================================
// anime.js — Main-frame logic for anime sites
//
// Runs on every URL (hostname-gated internally).
// Handles: ad removal, dark mode, episode history recording,
//          and waking up child iframes for video tracking.
//
// Depends on shared.js being loaded first (window.__AMT).
// =============================================================
(function () {
    'use strict';

    // ── Only run on the top-level page ──────────────────────
    if (window.top !== window.self) return;

    // ── Site gate ───────────────────────────────────────────
    const hostname = window.location.hostname;
    const isOploverz   = hostname.includes('oploverz');
    const isSamehadaku = hostname.includes('samehadaku');
    const isAnoboy     = hostname.includes('anoboy');

    // ── Custom anime sites (loaded from storage, managed via the aggregator's Settings UI) ──
    // Shape stored in chrome.storage.local under key 'tweaks_customAnimeSites':
    //   Array of { hostname, pattern, formatSlug? }
    //   hostname   : substring matched against window.location.hostname
    //   pattern    : regex string with two capture groups — (1) slug, (2) episode number
    //                applied to window.location.pathname
    //   formatSlug : (optional) JS function body string, e.g. "return slug.replace(/-/g,' ');"
    //                evaluated at runtime; defaults to hyphen-split title-case
    //
    // You can also still hard-code entries here as a fallback:
    const BUILTIN_CUSTOM_ANIME_SITES = [
        // { hostname: 'example-anime.com', pattern: '/^\\/([^/]+?)-episode-(\\d+)/' },
    ];

    // Will be populated asynchronously; gate execution until ready.
    let customMatch = null;
    let bootReady   = false;

    (async function loadAndBoot() {
        let storedSites = [];
        try {
            const r = await chrome.storage.local.get(['tweaks_customAnimeSites']);
            storedSites = r.tweaks_customAnimeSites || [];
        } catch (_) {}

        const allCustom = [...BUILTIN_CUSTOM_ANIME_SITES, ...storedSites].map((s) => {
            // Convert stored pattern string back to RegExp
            if (typeof s.pattern === 'string') {
                const m = s.pattern.match(/^\/(.*)\/([gimsuy]*)$/);
                s = { ...s, pattern: m ? new RegExp(m[1], m[2]) : null };
            }
            // Convert stored formatSlug string back to function
            if (typeof s.formatSlug === 'string') {
                try { s = { ...s, formatSlug: new Function('slug', s.formatSlug) }; } catch (_) {}
            }
            return s;
        }).filter((s) => s.hostname && s.pattern);

        customMatch = allCustom.find((s) => hostname.includes(s.hostname));

        if (!isOploverz && !isSamehadaku && !isAnoboy && !customMatch) return;

        boot();
    })();

    // Everything below is wrapped in boot() so it runs after storage is resolved.
    function boot() {
    const APP_TAG = 'AniMangaTweaks';

    // Tell the modal to default to the Anime tab on these sites
    if (window.__AMT) window.__AMT.setDefaultTab('anime');

    // ─────────────────────────────────────────────
    // DARK MODE  (Alt+D to toggle)
    // ─────────────────────────────────────────────
    let isDarkMode = true;
    let darkStyleEl = null;

    async function initDarkMode() {
        const r = await chrome.storage.local.get(['dark_mode']);
        isDarkMode = r.dark_mode !== undefined ? r.dark_mode : true;
        applyDarkMode();
    }

    function applyDarkMode() {
        if (!isDarkMode) {
            if (darkStyleEl) { darkStyleEl.remove(); darkStyleEl = null; }
            return;
        }
        if (darkStyleEl) return;

        const css = `
            body, html { background-color: #0f0f0f !important; color: #f1f1f1 !important; }
            [class*="bg-[#2d2850]"] { background-color: #0f0f0f !important; }
            [class*="bg-[#413a73]"] { background-color: #181818 !important; border-color: #303030 !important; }
            .bg-background, .bg-zinc-50, .bg-zinc-100 { background-color: #0f0f0f !important; }
            .bg-card { background-color: #181818 !important; border-color: #303030 !important; }
            .text-card-foreground { color: #f1f1f1 !important; }
            .border { border-color: #303030 !important; }
            .wrapper, #content, .widget, .post-body, .megamenu {
                background-color: #0f0f0f !important;
                color: #f1f1f1 !important;
                border-color: #303030 !important;
            }
            .box-header, .widget-title, .title-section {
                background-color: #181818 !important;
                color: #fff !important;
                border-color: #303030 !important;
            }
            a { color: #3ea6ff !important; }
        `;
        darkStyleEl = document.createElement('style');
        darkStyleEl.textContent = css;
        document.head.appendChild(darkStyleEl);
    }

    async function toggleDarkMode() {
        isDarkMode = !isDarkMode;
        await chrome.storage.local.set({ dark_mode: isDarkMode });
        applyDarkMode();
    }

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            toggleDarkMode();
        }
    });

    // ─────────────────────────────────────────────
    // AD REMOVAL
    // ─────────────────────────────────────────────
    function handleAds() {
        if (isOploverz) {
            // Full-screen ad overlays (identified by close button inside)
            document.querySelectorAll('div.fixed.inset-0').forEach((wrapper) => {
                if (wrapper.querySelector('button[aria-label="Tutup iklan"]')) {
                    wrapper.style.setProperty('display', 'none', 'important');
                }
            });

            // In-player ad overlays (identified by bg-destructive button inside)
            document.querySelectorAll('div.absolute.z-10.size-full').forEach((wrapper) => {
                if (wrapper.querySelector('button.bg-destructive')) {
                    wrapper.style.setProperty('display', 'none', 'important');
                }
            });

            // Sticky bottom ad banners
            document.querySelectorAll('div.fixed.z-50.flex.w-full.flex-col').forEach((wrapper) => {
                if (wrapper.querySelector('button.bg-destructive')) {
                    wrapper.style.setProperty('display', 'none', 'important');
                }
            });

            // Specific ad container classes (hardcoded by design — these don't match regular content)
            const adClasses = [
                'pointer-events-auto overflow-hidden rounded-lg shadow-xl',
                'w-full overflow-hidden rounded-lg [&_*]:box-border [&_*]:max-w-full [&_iframe]:h-auto [&_iframe]:w-full [&_img]:h-auto [&_img]:w-full',
                'mx-auto mb-5 grid w-full max-w-screen-xl grid-cols-1 md:grid-cols-2',
                'mx-auto grid w-full max-w-screen-xl grid-cols-1 items-stretch justify-items-stretch md:grid-cols-2',
                'mb-5 grid w-full grid-cols-1 items-center justify-items-center',
            ];
            document.querySelectorAll('div').forEach((div) => {
                const cls = div.getAttribute('class');
                if (!cls) return;
                if (
                    adClasses.includes(cls) &&
                    div.style.display !== 'none' &&
                    (div.querySelector('a[rel="nofollow"]') || div.querySelector('iframe'))
                ) {
                    div.style.setProperty('display', 'none', 'important');
                }
            });
        }

        if (isSamehadaku) {
            // Dedicated ad player elements
            document.querySelectorAll('.player-iklan, #playerIklan1, #playerIklan2').forEach((el) => {
                el.style.setProperty('display', 'none', 'important');
            });

            // GIF / gambling / sized banner ads
            document.querySelectorAll('a[target="_blank"][rel*="nofollow"]').forEach((el) => {
                const img = el.querySelector('img');
                if (!img) return;
                if (
                    img.src.includes('.gif') ||
                    el.href.includes('gacor') ||
                    (img.getAttribute('style') || '').includes('width: 50%')
                ) {
                    el.style.setProperty('display', 'none', 'important');
                }
            });

            // Hardcoded promotional links
            ['t.me/samehadaku_care', 'winbu.net', 'instagram.com/samehadaku.care'].forEach((url) => {
                document.querySelectorAll(`a[href*="${url}"]`).forEach((a) => {
                    a.style.setProperty('display', 'none', 'important');
                });
            });

            // Social follow widgets
            document.querySelectorAll('.followig, iframe[src*="facebook.com/plugins/like.php"]').forEach((el) => {
                el.style.setProperty('display', 'none', 'important');
            });

            // Promotional "follow" paragraphs
            document.querySelectorAll('p').forEach((p) => {
                if (p.textContent.toLowerCase().includes('follow instagram untuk update')) {
                    p.style.setProperty('display', 'none', 'important');
                }
            });
        }

        if (isAnoboy) {
            document.querySelectorAll('.section a[href*="facebook.com/anoboych"]').forEach((el) => {
                const section = el.closest('.section');
                if (section) section.style.setProperty('display', 'none', 'important');
            });
        }
    }

    // ─────────────────────────────────────────────
    // WATCH HISTORY
    // ─────────────────────────────────────────────
    let currentSlug    = null;
    let currentEpisode = null;

    function formatTitle(slug) {
        return slug
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    async function recordHistory() {
        const path = window.location.pathname;

        const oploverzMatch = path.match(/\/series\/([^/]+)\/episode\/(\d+)/);
        const stdMatch      = path.match(/^\/([^/]+?)-episode-(\d+)/);

        if (isOploverz && oploverzMatch) {
            currentSlug    = oploverzMatch[1];
            currentEpisode = parseInt(oploverzMatch[2], 10);
        } else if ((isSamehadaku || isAnoboy) && stdMatch) {
            currentSlug    = stdMatch[1];
            currentEpisode = parseInt(stdMatch[2], 10);
        } else if (customMatch) {
            const m = path.match(customMatch.pattern);
            if (!m) return; // Not an episode page on this custom site
            currentSlug    = m[1];
            currentEpisode = parseInt(m[2], 10);
        } else {
            return; // Not an episode page
        }

        const title = customMatch && customMatch.formatSlug
            ? customMatch.formatSlug(currentSlug)
            : formatTitle(currentSlug);
        const r = await chrome.storage.local.get(['anime_history']);
        const history = r.anime_history || {};

        if (!history[currentSlug]) {
            history[currentSlug] = { title, episodes: {} };
        }

        // Always update lastAccessed so sorting by recent works
        history[currentSlug].lastAccessed = Date.now();

        if (!history[currentSlug].episodes[currentEpisode]) {
            // New episode entry — store URL for quick-open
            history[currentSlug].episodes[currentEpisode] = {
                currentTime: 0,
                duration: 0,
                url: window.location.href,
            };
            await chrome.storage.local.set({ anime_history: history });
        } else if (!history[currentSlug].episodes[currentEpisode].url) {
            // Backfill URL for entries recorded before this feature was added
            history[currentSlug].episodes[currentEpisode].url = window.location.href;
            await chrome.storage.local.set({ anime_history: history });
        } else {
            // Already exists — still save the updated lastAccessed
            await chrome.storage.local.set({ anime_history: history });
        }

        if (window.__AMT) window.__AMT.notifyHistoryUpdate();

        // Start tracking video on the main frame directly
        // (frame_relay.js also runs here; we kick it via postMessage)
        window.postMessage({ app: APP_TAG, action: 'wake_up' }, '*');

        // Periodically wake up child iframes (they may load late)
        startIframeWakeUp();
    }

    function startIframeWakeUp() {
        setInterval(() => {
            document.querySelectorAll('iframe').forEach((iframe) => {
                try {
                    iframe.contentWindow.postMessage({ app: APP_TAG, action: 'wake_up' }, '*');
                } catch (_) {}
            });
        }, 3000);
    }

    // Receive progress reports from any frame
    window.addEventListener('message', async (event) => {
        if (!event.data || event.data.app !== APP_TAG) return;
        if (event.data.action !== 'update_progress') return;
        if (currentSlug === null || currentEpisode === null) return;

        const r = await chrome.storage.local.get(['anime_history']);
        const history = r.anime_history || {};

        if (history[currentSlug]?.episodes[currentEpisode]) {
            history[currentSlug].episodes[currentEpisode].currentTime = event.data.currentTime;
            history[currentSlug].episodes[currentEpisode].duration    = event.data.duration;
            await chrome.storage.local.set({ anime_history: history });
        }
    });

    // ─────────────────────────────────────────────
    // BOOT
    // ─────────────────────────────────────────────
    initDarkMode();
    recordHistory();

    // Run ad removal on page mutations (dynamic content)
    const observer = new MutationObserver(handleAds);
    observer.observe(document.body, { childList: true, subtree: true });
    handleAds();
    } // end boot()
})();