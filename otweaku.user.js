// ==UserScript==
// @name         oTweakU (Oploverz & Samehadaku)
// @namespace    oTweakU
// @version      2.1
// @description  Anime web tweaks. Adblock, unified history tracker, and toggleable dark mode.
// @match        *://*.oploverz.ltd/*
// @match        *://*.oploverz.*/*
// @match        *://*.samehadaku.*/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // =========================================
    // BAGIAN 1: PENGHAPUSAN IKLAN
    // =========================================
    function handleAds() {
        const hostname = window.location.hostname;

        // --- IKLAN OPLOVERZ ---
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

        // --- IKLAN SAMEHADAKU ---
        if (hostname.includes('samehadaku')) {
            // 1. Iklan Video Player (Overlay)
            document.querySelectorAll('.player-iklan, #playerIklan1, #playerIklan2').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });

            // 2. Iklan Banner Baris
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

            // 3. Iklan Hardcoded & Plugin Sosial
            const hardcodedUrls = ['t.me/samehadaku_care', 'winbu.net', 'instagram.com/samehadaku.care'];
            document.querySelectorAll('a').forEach(a => {
                if (hardcodedUrls.some(url => a.href.includes(url))) {
                    a.style.setProperty('display', 'none', 'important');
                }
            });

            // Widget media sosial dan teks
            document.querySelectorAll('.followig, iframe[src*="facebook.com/plugins/like.php"]').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });

            document.querySelectorAll('p').forEach(p => {
                if (p.textContent.toLowerCase().includes('follow instagram untuk update')) {
                    p.style.setProperty('display', 'none', 'important');
                }
            });
        }
    }

    // =========================================
    // BAGIAN 2: TEMA GELAP (BISA DI-TOGGLE)
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

        if (darkStyleElement) return; // Mencegah injeksi ganda

        const darkThemeCSS = `
            /* Aturan umum & Oploverz */
            body, html { background-color: #0f0f0f !important; color: #f1f1f1 !important; }
            [class*="bg-[#2d2850]"] { background-color: #0f0f0f !important; }
            [class*="bg-[#413a73]"] { background-color: #181818 !important; border-color: #303030 !important; }
            .bg-background, .bg-zinc-50, .bg-zinc-100 { background-color: #0f0f0f !important; }
            .bg-card { background-color: #181818 !important; border-color: #303030 !important; }
            .text-card-foreground { color: #f1f1f1 !important; }
            .border { border-color: #303030 !important; }

            /* Override Khusus Samehadaku */
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
    // BAGIAN 3: PELACAK RIWAYAT TONTONAN
    // =========================================
    function formatTitle(slug) {
        return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    function recordHistory() {
        const path = window.location.pathname;
        let slug, episodeNum;

        // Regex untuk Oploverz: /series/[slug]/episode/[num]/
        const oploverzMatch = path.match(/\/series\/([^/]+)\/episode\/(\d+)/);

        // Regex Fleksibel untuk Samehadaku: Menangkap /[slug]-episode-[num] dengan/tanpa string tambahan di belakang
        const samehadakuMatch = path.match(/^\/([^/]+?)-episode-(\d+)/);

        if (oploverzMatch) {
            slug = oploverzMatch[1];
            episodeNum = parseInt(oploverzMatch[2], 10);
        } else if (samehadakuMatch) {
            slug = samehadakuMatch[1];
            episodeNum = parseInt(samehadakuMatch[2], 10);
        } else {
            return; // Bukan halaman episode
        }

        const title = formatTitle(slug);
        let history = GM_getValue('anime_history', {});

        if (!history[slug]) {
            history[slug] = {
                title: title,
                episodes: []
            };
        }

        if (!history[slug].episodes.includes(episodeNum)) {
            history[slug].episodes.push(episodeNum);
            history[slug].episodes.sort((a, b) => a - b);
            GM_setValue('anime_history', history);
        }
    }

    // =========================================
    // BAGIAN 4: UI MODAL RIWAYAT
    // =========================================
    let isModalOpen = false;

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
            #vm-close-btn {
                background: none; border: none; color: #f1f1f1;
                font-size: 1.5rem; cursor: pointer; padding: 0 8px;
            }
            #vm-close-btn:hover { color: #ff4a4a; }
            #vm-history-controls { padding: 16px; border-bottom: 1px solid #303030; }
            #vm-history-search {
                width: 100%; padding: 10px; border-radius: 6px;
                background-color: #0f0f0f; color: #fff; border: 1px solid #303030;
                box-sizing: border-box;
            }
            #vm-history-content {
                padding: 16px; overflow-y: auto; flex-grow: 1;
            }
            .vm-anime-item { margin-bottom: 16px; }
            .vm-anime-title {
                font-weight: bold; margin-bottom: 8px; color: #3ea6ff;
            }
            .vm-anime-episodes {
                display: flex; flex-wrap: wrap; gap: 6px;
            }
            .vm-ep-badge {
                background-color: #303030; padding: 4px 10px;
                border-radius: 4px; font-size: 0.85rem; color: #f1f1f1;
            }
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
                <button id="vm-close-btn">&times;</button>
            </div>
            <div id="vm-history-controls">
                <input type="text" id="vm-history-search" placeholder="Cari judul anime...">
            </div>
            <div id="vm-history-content"></div>
        `;
        document.body.appendChild(modal);

        document.getElementById('vm-close-btn').addEventListener('click', toggleHistoryModal);
        backdrop.addEventListener('click', toggleHistoryModal);

        document.getElementById('vm-history-search').addEventListener('input', (e) => {
            renderHistoryList(e.target.value.toLowerCase());
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

        keys.forEach(slug => {
            const data = history[slug];
            if (data.title.toLowerCase().includes(searchQuery)) {
                hasResults = true;

                const itemDiv = document.createElement('div');
                itemDiv.className = 'vm-anime-item';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'vm-anime-title';
                titleDiv.textContent = data.title;

                const epsDiv = document.createElement('div');
                epsDiv.className = 'vm-anime-episodes';

                data.episodes.forEach(ep => {
                    const epBadge = document.createElement('span');
                    epBadge.className = 'vm-ep-badge';
                    epBadge.textContent = 'Ep ' + ep;
                    epsDiv.appendChild(epBadge);
                });

                itemDiv.appendChild(titleDiv);
                itemDiv.appendChild(epsDiv);
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
        }
    }

    // =========================================
    // EKSEKUSI
    // =========================================

    // Daftarkan Menu Command
    GM_registerMenuCommand("Tampilkan Riwayat Anime", toggleHistoryModal);
    GM_registerMenuCommand("Toggle Dark Mode", toggleDarkTheme);

    // Tombol Pintasan (Alt + H)
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
