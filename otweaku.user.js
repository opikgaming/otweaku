// ==UserScript==
// @name         oTweakU (Oploverz, Samehadaku & Anoboy)
// @namespace    oTweakU
// @version      2.6
// @description  Anime web tweaks. Adblock, unified history tracker, and force dark mode.
// @match        *://*/*
// @allFrames    true
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    const isMainFrame = window.top === window.self;

    // =========================================
    // SECTION 0: IFRAME WORKER
    // =========================================
    if (!isMainFrame) {
        let isTrackerActive = false;

        window.addEventListener('message', (event) => {
            if (event.data && event.data.app === 'oTweakU' && event.data.action === 'init_tracker') {
                if (isTrackerActive) return;
                isTrackerActive = true;

                setInterval(() => {
                    const videoElement = document.querySelector('video');
                    if (videoElement && videoElement.duration > 0) {
                        event.source.postMessage({
                            app: 'oTweakU',
                            action: 'update_progress',
                            currentTime: videoElement.currentTime,
                            duration: videoElement.duration
                        }, event.origin);
                    }
                }, 5000);
            }
        });
        return;
    }

    // =========================================
    // MAIN FRAME GUARD 
    // =========================================
    const hostname = window.location.hostname;
    if (!hostname.includes('oploverz') && !hostname.includes('samehadaku') && !hostname.includes('anoboy')) {
        return;
    }

    let currentSlug = null;
    let currentEpisode = null;

    // =========================================
    // SECTION 1: AD REMOVAL
    // =========================================
    function handleAds() {
        if (hostname.includes('oploverz')) {
            const fullScreenWrappers = document.querySelectorAll('div.fixed.inset-0');
            fullScreenWrappers.forEach(wrapper => {
                if (wrapper.querySelector('button[aria-label="Tutup iklan"]')) {
                    wrapper.style.setProperty('display', 'none', 'important');
                }
            });

            const videoPlayerWrappers = document.querySelectorAll('div.absolute.z-10.size-full');
            videoPlayerWrappers.forEach(wrapper => {
                if (wrapper.querySelector('button.bg-destructive')) {
                    wrapper.style.setProperty('display', 'none', 'important');
                }
            });

            const stickyBottomWrappers = document.querySelectorAll('div.fixed.z-50.flex.w-full.flex-col');
            stickyBottomWrappers.forEach(wrapper => {
                if (wrapper.querySelector('button.bg-destructive')) {
                    wrapper.style.setProperty('display', 'none', 'important');
                }
            });

            const adClasses = [
                "pointer-events-auto overflow-hidden rounded-lg shadow-xl",
                "w-full overflow-hidden rounded-lg [&_*]:box-border [&_*]:max-w-full [&_iframe]:h-auto [&_iframe]:w-full [&_img]:h-auto [&_img]:w-full",
                "mx-auto mb-5 grid w-full max-w-screen-xl grid-cols-1 md:grid-cols-2",
                "mx-auto grid w-full max-w-screen-xl grid-cols-1 items-stretch justify-items-stretch md:grid-cols-2",
                "mb-5 grid w-full grid-cols-1 items-center justify-items-center"
            ];

            document.querySelectorAll('div').forEach(div => {
                const currentClass = div.getAttribute('class');
                if (!currentClass) return;

                if (adClasses.includes(currentClass) && div.style.display !== 'none') {
                     if (div.querySelector('a[rel="nofollow"]') || div.querySelector('iframe')) {
                          div.style.setProperty('display', 'none', 'important');
                     }
                }
            });
        }

        if (hostname.includes('samehadaku')) {
            document.querySelectorAll('.player-iklan, #playerIklan1, #playerIklan2').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });

            document.querySelectorAll('a[target="_blank"][rel*="nofollow"]').forEach(el => {
                const img = el.querySelector('img');
                if (img) {
                    const isGifAd = img.src.includes('.gif');
                    const isBetAd = el.href.includes('gacor');
                    const isSizedAd = img.getAttribute('style') && img.getAttribute('style').includes('width: 50%');

                    if (isGifAd || isBetAd || isSizedAd) {
                        el.style.setProperty('display', 'none', 'important');
                    }
                }
            });

            const hardcodedUrls = ['t.me/samehadaku_care', 'winbu.net', 'instagram.com/samehadaku.care'];
            document.querySelectorAll('a').forEach(a => {
                if (hardcodedUrls.some(url => a.href.includes(url))) {
                    a.style.setProperty('display', 'none', 'important');
                }
            });

            document.querySelectorAll('.followig, iframe[src*="facebook.com/plugins/like.php"]').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });

            document.querySelectorAll('p').forEach(p => {
                if (p.textContent.toLowerCase().includes('follow instagram untuk update')) {
                    p.style.setProperty('display', 'none', 'important');
                }
            });
        }

        if (hostname.includes('anoboy')) {
            document.querySelectorAll('.section a[href*="facebook.com/anoboych"]').forEach(el => {
                const sectionParent = el.closest('.section');
                if (sectionParent) {
                    sectionParent.style.setProperty('display', 'none', 'important');
                }
            });
        }
    }

    // =========================================
    // SECTION 2: DARK THEME TOGGLE
    // =========================================
    let isDarkMode = GM_getValue('dark_theme_enabled', true);
    let darkStyleElement = null;

    function applyDarkTheme() {
        if (!isDarkMode) {
            if (darkStyleElement) {
                darkStyleElement.remove();
                darkStyleElement = null;
            }
            return;
        }

        if (darkStyleElement) return;

        const darkThemeCSS = `
            body, html { background-color: #0f0f0f !important; color: #f1f1f1 !important; }
            [class*="bg-[#2d2850]"] { background-color: #0f0f0f !important; }
            [class*="bg-[#413a73]"] { background-color: #181818 !important; border-color: #303030 !important; }
            .bg-background, .bg-zinc-50, .bg-zinc-100 { background-color: #0f0f0f !important; }
            .bg-card { background-color: #181818 !important; border-color: #303030 !important; }
            .text-card-foreground { color: #f1f1f1 !important; }
            .border { border-color: #303030 !important; }

            .wrapper, #content, .widget, .post-body, .megamenu { background-color: #0f0f0f !important; color: #f1f1f1 !important; border-color: #303030 !important; }
            .box-header, .widget-title, .title-section { background-color: #181818 !important; color: #fff !important; border-color: #303030 !important; }
            a { color: #3ea6ff !important; }
        `;

        darkStyleElement = document.createElement('style');
        darkStyleElement.id = 'vm-dark-theme';
        darkStyleElement.textContent = darkThemeCSS;
        document.head.appendChild(darkStyleElement);
    }

    function toggleDarkTheme() {
        isDarkMode = !isDarkMode;
        GM_setValue('dark_theme_enabled', isDarkMode);
        applyDarkTheme();
    }

    // =========================================
    // SECTION 3: WATCH HISTORY TRACKER
    // =========================================
    function formatTitle(slug) {
        return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "00:00";
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function recordHistory() {
        const path = window.location.pathname;

        const oploverzMatch = path.match(/\/series\/([^/]+)\/episode\/(\d+)/);

        const stdMatch = path.match(/^\/([^/]+?)-episode-(\d+)/);

        if (hostname.includes('oploverz') && oploverzMatch) {
            currentSlug = oploverzMatch[1];
            currentEpisode = parseInt(oploverzMatch[2], 10);
        } else if ((hostname.includes('samehadaku') || hostname.includes('anoboy')) && stdMatch) {
            currentSlug = stdMatch[1];
            currentEpisode = parseInt(stdMatch[2], 10);
        } else {
            return;
        }

        const title = formatTitle(currentSlug);
        let history = GM_getValue('anime_history', {});

        if (!history[currentSlug]) {
            history[currentSlug] = {
                title: title,
                episodes: {}
            };
        }

        if (!history[currentSlug].episodes[currentEpisode]) {
            history[currentSlug].episodes[currentEpisode] = { currentTime: 0, duration: 0 };
            GM_setValue('anime_history', history);
        }

        trackNativeVideoProgress();
        wakeUpIframes();
    }

    function wakeUpIframes() {
        setInterval(() => {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    iframe.contentWindow.postMessage({ app: 'oTweakU', action: 'init_tracker' }, '*');
                } catch (e) {}
            });
        }, 3000);
    }

    function trackNativeVideoProgress() {
        setInterval(() => {
            if (!currentSlug || currentEpisode === null) return;

            const videoElement = document.querySelector('video');
            if (videoElement && videoElement.duration > 0) {
                let history = GM_getValue('anime_history', {});
                if (history[currentSlug] && history[currentSlug].episodes[currentEpisode]) {
                    history[currentSlug].episodes[currentEpisode].currentTime = videoElement.currentTime;
                    history[currentSlug].episodes[currentEpisode].duration = videoElement.duration;
                    GM_setValue('anime_history', history);
                }
            }
        }, 5000);
    }

    window.addEventListener('message', (event) => {
        if (event.data && event.data.app === 'oTweakU' && event.data.action === 'update_progress') {
            if (currentSlug && currentEpisode !== null) {
                let history = GM_getValue('anime_history', {});
                if (history[currentSlug] && history[currentSlug].episodes[currentEpisode]) {
                    history[currentSlug].episodes[currentEpisode].currentTime = event.data.currentTime;
                    history[currentSlug].episodes[currentEpisode].duration = event.data.duration;
                    GM_setValue('anime_history', history);
                }
            }
        }
    });

    // =========================================
    // SECTION 4: HISTORY MODAL UI
    // =========================================
    let isModalOpen = false;
    let isEditMode = false;

    function injectModalStyles() {
        if (document.getElementById('vm-modal-styles')) return;

        const modalCSS = `
            #vm-history-modal {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                width: 90%; max-width: 600px; max-height: 80vh;
                background-color: #181818; color: #f1f1f1;
                border: 1px solid #303030; border-radius: 12px;
                z-index: 999999; display: none; flex-direction: column;
                box-shadow: 0 10px 30px rgba(0,0,0,0.8);
                font-family: sans-serif;
            }
            #vm-history-header {
                padding: 16px; border-bottom: 1px solid #303030;
                display: flex; justify-content: space-between; align-items: center;
            }
            #vm-history-header h2 { margin: 0; font-size: 1.2rem; color: #fff; }
            .vm-header-actions { display: flex; gap: 12px; align-items: center; }

            #vm-edit-btn {
                background: #3ea6ff; color: #000; border: none; border-radius: 4px;
                padding: 4px 10px; font-size: 0.85rem; font-weight: bold; cursor: pointer;
            }
            #vm-edit-btn.active { background: #ff4a4a; color: #fff; }

            #vm-close-btn {
                background: none; border: none; color: #f1f1f1;
                font-size: 1.5rem; cursor: pointer; padding: 0; display: flex;
            }
            #vm-close-btn:hover { color: #ff4a4a; }

            #vm-history-controls { padding: 16px; border-bottom: 1px solid #303030; display: flex; gap: 8px; flex-direction: column; }
            #vm-history-search {
                width: 100%; padding: 10px; border-radius: 6px;
                background-color: #0f0f0f; color: #fff; border: 1px solid #303030;
                box-sizing: border-box;
            }

            #vm-delete-actions { display: none; justify-content: flex-end; }
            #vm-history-modal.edit-mode #vm-delete-actions { display: flex; }
            #vm-delete-selected-btn {
                background: #ff4a4a; color: #fff; border: none; border-radius: 4px;
                padding: 6px 12px; font-size: 0.85rem; cursor: pointer; font-weight: bold;
            }

            #vm-history-content { padding: 16px; overflow-y: auto; flex-grow: 1; }

            .vm-anime-item { margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px; }
            .vm-anime-checkbox {
                display: none; margin-top: 5px; width: 16px; height: 16px;
                accent-color: #ff4a4a; cursor: pointer;
            }
            #vm-history-modal.edit-mode .vm-anime-checkbox { display: block; }

            .vm-anime-data { flex-grow: 1; }
            .vm-anime-title { font-weight: bold; margin-bottom: 8px; color: #3ea6ff; }
            .vm-anime-episodes { display: flex; flex-wrap: wrap; gap: 6px; }

            .vm-ep-badge {
                background-color: #303030; padding: 4px 10px;
                border-radius: 4px; font-size: 0.85rem; color: #f1f1f1;
                display: flex; flex-direction: column; align-items: center;
            }
            .vm-ep-progress { font-size: 0.7rem; color: #aaa; margin-top: 2px; }

            #vm-history-backdrop {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.6); z-index: 999998; display: none;
            }
        `;
        const style = document.createElement('style');
        style.id = 'vm-modal-styles';
        style.textContent = modalCSS;
        document.head.appendChild(style);
    }

    function createHistoryModal() {
        injectModalStyles();

        const backdrop = document.createElement('div');
        backdrop.id = 'vm-history-backdrop';
        document.body.appendChild(backdrop);

        const modal = document.createElement('div');
        modal.id = 'vm-history-modal';
        modal.innerHTML = `
            <div id="vm-history-header">
                <h2>Riwayat Tontonan</h2>
                <div class="vm-header-actions">
                    <button id="vm-edit-btn">Edit</button>
                    <button id="vm-close-btn">&times;</button>
                </div>
            </div>
            <div id="vm-history-controls">
                <input type="text" id="vm-history-search" placeholder="Cari judul anime...">
                <div id="vm-delete-actions">
                    <button id="vm-delete-selected-btn">Hapus Terpilih</button>
                </div>
            </div>
            <div id="vm-history-content"></div>
        `;
        document.body.appendChild(modal);

        document.getElementById('vm-close-btn').addEventListener('click', toggleHistoryModal);
        backdrop.addEventListener('click', toggleHistoryModal);

        document.getElementById('vm-history-search').addEventListener('input', (e) => {
            renderHistoryList(e.target.value.toLowerCase());
        });

        // Edit Button Logic
        document.getElementById('vm-edit-btn').addEventListener('click', (e) => {
            isEditMode = !isEditMode;
            modal.classList.toggle('edit-mode', isEditMode);
            e.target.classList.toggle('active', isEditMode);
            e.target.textContent = isEditMode ? 'Batal' : 'Edit';

            if (!isEditMode) {
                document.querySelectorAll('.vm-anime-checkbox').forEach(cb => cb.checked = false);
            }
        });

        document.getElementById('vm-delete-selected-btn').addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.vm-anime-checkbox:checked');
            if (checkboxes.length === 0) return;

            let history = GM_getValue('anime_history', {});
            checkboxes.forEach(cb => {
                delete history[cb.dataset.slug];
            });
            GM_setValue('anime_history', history);

            renderHistoryList(document.getElementById('vm-history-search').value.toLowerCase());

            // Exit edit mode optionally (uncomment below if desired)
            // document.getElementById('vm-edit-btn').click();
        });
    }

    function renderHistoryList(searchQuery = '') {
        const contentDiv = document.getElementById('vm-history-content');
        const history = GM_getValue('anime_history', {});

        contentDiv.innerHTML = '';

        const keys = Object.keys(history);
        if (keys.length === 0) {
            contentDiv.innerHTML = '<p style="color: #888; text-align: center;">Belum ada riwayat tontonan.</p>';
            return;
        }

        let hasResults = false;

        // Sort keys alphabetically by title
        keys.sort((a, b) => history[a].title.localeCompare(history[b].title));

        keys.forEach(slug => {
            const data = history[slug];
            if (data.title.toLowerCase().includes(searchQuery)) {
                hasResults = true;

                const itemDiv = document.createElement('div');
                itemDiv.className = 'vm-anime-item';

                // Checkbox for Edit Mode
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'vm-anime-checkbox';
                checkbox.dataset.slug = slug;

                const dataDiv = document.createElement('div');
                dataDiv.className = 'vm-anime-data';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'vm-anime-title';
                titleDiv.textContent = data.title;

                const epsDiv = document.createElement('div');
                epsDiv.className = 'vm-anime-episodes';

                const sortedEpisodes = Object.keys(data.episodes).sort((a, b) => parseInt(a) - parseInt(b));

                sortedEpisodes.forEach(epKey => {
                    const epData = data.episodes[epKey];
                    const epBadge = document.createElement('span');
                    epBadge.className = 'vm-ep-badge';

                    let badgeHTML = `<span>Ep ${epKey}</span>`;

                    if (epData.duration && epData.duration > 0) {
                        const progressStr = `${formatTime(epData.currentTime)} / ${formatTime(epData.duration)}`;
                        badgeHTML += `<span class="vm-ep-progress">${progressStr}</span>`;
                    }

                    epBadge.innerHTML = badgeHTML;
                    epsDiv.appendChild(epBadge);
                });

                dataDiv.appendChild(titleDiv);
                dataDiv.appendChild(epsDiv);

                itemDiv.appendChild(checkbox);
                itemDiv.appendChild(dataDiv);
                contentDiv.appendChild(itemDiv);
            }
        });

        if (!hasResults) {
            contentDiv.innerHTML = '<p style="color: #888; text-align: center;">Anime tidak ditemukan.</p>';
        }
    }

    function toggleHistoryModal() {
        const modal = document.getElementById('vm-history-modal');
        const backdrop = document.getElementById('vm-history-backdrop');

        if (!modal) {
            createHistoryModal();
            return toggleHistoryModal();
        }

        isModalOpen = !isModalOpen;

        if (isModalOpen) {
            renderHistoryList();
            document.getElementById('vm-history-search').value = '';
            modal.style.display = 'flex';
            backdrop.style.display = 'block';
            document.getElementById('vm-history-search').focus();
        } else {
            modal.style.display = 'none';
            backdrop.style.display = 'none';

            // Reset edit mode on close
            if (isEditMode) {
                document.getElementById('vm-edit-btn').click();
            }
        }
    }

    // =========================================
    // EXECUTION
    // =========================================
    GM_registerMenuCommand("Tampilkan Riwayat Anime", toggleHistoryModal);
    GM_registerMenuCommand("Toggle Dark Mode", toggleDarkTheme);

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            toggleHistoryModal();
        }
    });

    const observer = new MutationObserver(() => handleAds());
    observer.observe(document.body, { childList: true, subtree: true });

    handleAds();
    applyDarkTheme();
    recordHistory();

})();
