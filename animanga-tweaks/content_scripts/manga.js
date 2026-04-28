// =============================================================
// manga.js — MangaDex + Komiku + Komikindo + Maid history
//
// Runs on:
//   mangadex.org   — polls for chapter URL changes (SPA)
//   komiku.org     — /[title]-chapter-[n]/
//   komikindo.ch   — /[title]-chapter-[n]/
//   maid.my.id     — /[title]-chapter-[n]-bahasa-indonesia/
//
// Also handles: dark mode (Alt+D) and ad removal for komikindo.ch
//
// Depends on shared.js being loaded first (window.__AMT).
// =============================================================
(function () {
    'use strict';

    // ── Site detection ──────────────────────────────────────
    const hostname    = window.location.hostname;
    const isMangaDex  = hostname.includes('mangadex');
    const isKomiku    = hostname.includes('komiku');
    const isKomikindo = hostname.includes('komikindo');
    const isMaid      = hostname.includes('maid.my.id');

    // ── Custom manga sites (loaded from storage, managed via the aggregator's Settings UI) ──
    // Shape stored in chrome.storage.local under key 'tweaks_customMangaSites':
    //   Array of { hostname, parsePath? }
    //   hostname  : substring matched against window.location.hostname
    //   parsePath : (optional) JS function body string receiving (pathname) →
    //               { titleSlug, chapterNum, mangaTitle } | null
    //               Defaults to the standard /<title>-chapter-<n>/ parser.
    //
    // You can also still hard-code entries here as a fallback:
    const BUILTIN_CUSTOM_MANGA_SITES = [
        // { hostname: 'example-manga.com' },
        // { hostname: 'another-reader.net',
        //   parsePath: "const m=pathname.match(/^\\/read\\/([^/]+)\\/(\\d+)/); return m ? { titleSlug:m[1], chapterNum:m[2], mangaTitle:m[1].replace(/-/g,' ') } : null;" },
    ];

    // Will be populated asynchronously.
    let customMangaMatch = null;

    (async function loadCustomMangaSites() {
        let storedSites = [];
        try {
            const r = await chrome.storage.local.get(['tweaks_customMangaSites']);
            storedSites = r.tweaks_customMangaSites || [];
        } catch (_) {}

        const allCustom = [...BUILTIN_CUSTOM_MANGA_SITES, ...storedSites].map((s) => {
            if (typeof s.parsePath === 'string') {
				delete s.parsePath; // never eval strings
			}
            return s;
        }).filter((s) => s.hostname);

        customMangaMatch = allCustom.find((s) => hostname.includes(s.hostname));

        // Re-run boot logic that depends on customMangaMatch
        if (customMangaMatch) bootCustomManga();
    })();

    if (window.__AMT) window.__AMT.setDefaultTab('manga');

    // ─────────────────────────────────────────────
    // DARK MODE  (Alt+D to toggle)
    // ─────────────────────────────────────────────
    let isDarkMode  = true;
    let darkStyleEl = null;

    function buildDarkCSS() {
        if (isKomiku) return `
            /* === NUCLEAR BASELINE === */
            *:not(img):not(svg):not(path):not(#amt-modal):not(#amt-backdrop):not([id^="amt-"]):not([class^="amt-"]) {
                background-color: #0f0f0f !important;
                color: #e8e8e8 !important;
                border-color: #2e2e2e !important;
            }
            img { background-color: transparent !important; filter: none !important; }
            svg, path { background-color: transparent !important; }
            #amt-modal, #amt-modal *, #amt-backdrop {
                background-color: unset; color: unset; border-color: unset;
            }

            /* === LAYERED PALETTE === */
            #header, .site-header, header,
            #Navbawah, .perapih, .navb,
            .navbar, .navtop, #navtop,
            #footer, footer, .site-footer,
            .komik_info, .komik_info-content,
            .komik_info-content-info-all,
            .komik_info-content-native,
            .komik_info-chapters,
            #Berita, #Berita *,
            #history2, .ls112, .ls12,
            #history, .ls2, .ls2v, .ls2j,
            #rakbuku, .rakbuku,
            .chapter_list, .chapter_list ul, .chapter_list li,
            .rd_heading, .rdrp, .rdnv, .rdnvimgnv,
            .reader-area, #readerarea,
            ul.dropdown-menu, .sub-menu,
            .widget, aside,
            .bsx, .animpost, .post-item, .box,
            .komiklist, .komiklist li,
            .ls1, .ls1 li,
            .sosmed, .sosmed li,
            .fnav, .fnav li,
            .pagination a, .pagination span, .page-numbers {
                background-color: #181818 !important;
                color: #e8e8e8 !important;
                border-color: #2e2e2e !important;
            }
            .ls2, .ls2v, .ls2j,
            .chapter_list li, .rakbuku, .komiklist li, .ls1 li,
            ul.dropdown-menu li, .sub-menu li,
            .pagination a, .page-numbers {
                background-color: #212121 !important;
            }

            /* Nav */
            #header a, .site-header a, .navtop a, #navtop a { color: #d8d8d8 !important; }
            #header a:hover, .site-header a:hover { color: #fff !important; }

            /* Bottom nav */
            #Navbawah { border-top: 1px solid #2e2e2e !important; }
            .navb a { color: #c8c8c8 !important; }
            .navb a:hover { color: #fff !important; }
            .navb svg, .navb path { fill: currentColor !important; }

            /* History widget */
            .ls112 h2, .ls112 h3 { color: #f1f1f1 !important; }
            .ls112 button, #history2 button {
                background-color: #2a2a2a !important; color: #e8e8e8 !important;
                border: 1px solid #444 !important; border-radius: 4px !important;
            }
            .ls112 button:hover { background-color: #383838 !important; }
            .ls2j h4 a, .ls2j h4 { color: #d8d8d8 !important; }
            .ls2t { color: #999 !important; }
            .ls2l { color: #7eb8f0 !important; }
            .persen {
                background-color: #333 !important; border-radius: 4px !important;
                overflow: hidden !important; height: 5px !important;
            }
            .persen > div { background-color: #3ea6ff !important; height: 100% !important; }
            .rakbuku a p { color: #ccc !important; }
            .rakbuku a h3 { color: #f1f1f1 !important; }
            .rakbuku:hover { background-color: #272727 !important; }

            /* Chapter list */
            .chapter_list li a { color: #d0d0d0 !important; }
            .chapter_list li:hover { background-color: #272727 !important; }
            .chapter_list li .chapter_date { color: #777 !important; }

            /* Genre badges */
            .komik_info-content-genre a {
                background-color: #2e2e2e !important; color: #ccc !important;
                border: 1px solid #444 !important; border-radius: 4px !important;
            }

            /* Reader */
            .rd_heading select, .rdrp select, #readerarea select {
                background-color: #212121 !important; color: #e8e8e8 !important;
                border: 1px solid #3d3d3d !important;
            }

            /* Pagination */
            .pagination .current, .page-numbers.current {
                background-color: #333 !important; color: #fff !important;
            }

            /* Social / footer */
            .sosmed li a, .fnav li a { color: #aaa !important; }
            .sosmed li a:hover, .fnav li a:hover { color: #f1f1f1 !important; }
            #footer, footer { border-top: 1px solid #2e2e2e !important; }
            #footer a, footer a { color: #aaa !important; }
            #footer a:hover, footer a:hover { color: #f1f1f1 !important; }

            h1, h2, h3, h4, h5, h6 { color: #f1f1f1 !important; }

            button:not([id^="amt-"]):not([class^="amt-"]),
            .btn, .button, input[type="submit"], input[type="button"] {
                background-color: #454545 !important; color: #e8e8e8 !important;
                border: 1px solid #444 !important;
            }
            button:not([id^="amt-"]):not([class^="amt-"]):hover,
            .btn:hover { background-color: #383838 !important; }

            input[type="text"], input[type="search"],
            input[type="email"], textarea, select {
                background-color: #1e1e1e !important; color: #e8e8e8 !important;
                border: 1px solid #3d3d3d !important;
            }
        `;

        if (isKomikindo) return `
            html, body { background-color: #0f0f0f !important; color: #e8e8e8 !important; }
            #content, #main, #primary, #secondary, .wrapper, .container,
            .main-inner, #wrapper, .site-content {
                background-color: #0f0f0f !important; color: #e8e8e8 !important;
            }
            #header, .site-header, .centernav, .centernav.navs,
            .main-nav, #sticky-nav, .headfix {
                background-color: #181818 !important; border-bottom: 1px solid #333 !important;
            }
            .centernav .menu li a, .centernav .menu li span,
            #menu-menu-float li a, #menu-menu-float li span { color: #d8d8d8 !important; }
            .centernav .menu li a:hover, #menu-menu-float li a:hover { color: #fff !important; }
            .scrollToTop {
                background-color: #2a2a2a !important; color: #e8e8e8 !important;
                border: 1px solid #444 !important;
            }
            ul.dropdown-menu, .sub-menu {
                background-color: #1e1e1e !important; border: 1px solid #3d3d3d !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.6) !important;
            }
            .sub-menu li a { color: #d0d0d0 !important; }
            .sub-menu li a:hover { color: #fff !important; background-color: #2a2a2a !important; }
            .postbody, .entry-content, .inepcx {
                background-color: #181818 !important; color: #e8e8e8 !important;
            }
            .eplistcon, .eplister { background-color: #181818 !important; }
            .eplister ul li {
                background-color: #1e1e1e !important; border: 1px solid #2e2e2e !important;
                color: #d0d0d0 !important;
            }
            .eplister ul li:hover { background-color: #272727 !important; }
            .eplister ul li a { color: #d0d0d0 !important; }
            .eplister ul li span { color: #888 !important; }
            .komikdetail, .komik-info, .spe, .spe span, .spe b {
                background-color: #181818 !important; color: #e8e8e8 !important;
            }
            .entry-title { color: #f1f1f1 !important; }
            .genre-info a, .mgen a {
                background-color: #2e2e2e !important; color: #ccc !important;
                border-radius: 4px !important; border: 1px solid #444 !important;
            }
            .chpnw, .nxpnw, .readernavigation, #readerarea, .rdnv {
                background-color: #181818 !important; border-color: #333 !important;
                color: #e8e8e8 !important;
            }
            .chpnw a, .nxpnw a {
                background-color: #2a2a2a !important; color: #e8e8e8 !important;
                border: 1px solid #444 !important; border-radius: 5px !important;
            }
            .chpnw select, .nxpnw select, .readernavigation select {
                background-color: #1e1e1e !important; color: #e8e8e8 !important;
                border: 1px solid #3d3d3d !important;
            }
            .btn, button, .button, input[type="submit"], input[type="button"] {
                background-color: #2a2a2a !important; color: #e8e8e8 !important;
                border: 1px solid #444 !important;
            }
            #footer, footer, .site-footer {
                background-color: #111 !important; color: #999 !important;
                border-top: 1px solid #2a2a2a !important;
            }
            #footer a, footer a { color: #aaa !important; }
            #footer a:hover, footer a:hover { color: #f1f1f1 !important; }
            h1, h2, h3, h4, h5, h6 { color: #f1f1f1 !important; }
            .pagination a, .pagination span, .page-numbers {
                background-color: #1e1e1e !important; color: #ccc !important;
                border: 1px solid #3d3d3d !important;
            }
            .pagination .current, .page-numbers.current {
                background-color: #333 !important; color: #fff !important;
            }
            .widget, .sidebar, aside {
                background-color: #181818 !important; border: 1px solid #2e2e2e !important;
                color: #e8e8e8 !important;
            }
            .widget-title { color: #f1f1f1 !important; border-bottom: 1px solid #333 !important; }
            img { filter: none !important; }
        `;

        return ''; // MangaDex has its own dark mode
    }

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
        darkStyleEl = document.createElement('style');
        darkStyleEl.id = 'amt-manga-dark';
        darkStyleEl.textContent = buildDarkCSS();
        document.head.appendChild(darkStyleEl);
    }

    async function toggleDarkMode() {
        isDarkMode = !isDarkMode;
        await chrome.storage.local.set({ dark_mode: isDarkMode });
        if (darkStyleEl) { darkStyleEl.remove(); darkStyleEl = null; }
        applyDarkMode();
    }

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleDarkMode(); }
    });

    // ─────────────────────────────────────────────
    // AD REMOVAL — komikindo.ch only
    // ─────────────────────────────────────────────
    function handleAds() {
        if (!isKomikindo) return;
        document.querySelectorAll('.gulai_asam_manis').forEach((el) => {
            el.style.setProperty('display', 'none', 'important');
        });
        document.querySelectorAll('a[rel*="nofollow"], a[target="_blank"]').forEach((el) => {
            const img = el.querySelector('img');
            if (!img) return;
            if (
                img.src.includes('.gif') ||
                el.href.includes('slot') || el.href.includes('gacor') ||
                el.href.includes('casino') || el.href.includes('penta') ||
                el.href.includes('kaiko')
            ) {
                (el.closest('div') || el).style.setProperty('display', 'none', 'important');
            }
        });
    }

    // ─────────────────────────────────────────────
    // URL PARSING
    //
    // Handles:
    //   /title-chapter-133/
    //   /title-chapter-133.5/
    //   /title-chapter-133-5/          ← hyphen as decimal separator
    //   /title-chapter-133-5-bahasa-indonesia/  ← trailing word suffix
    //
    // Key decisions:
    //   - decodeURIComponent first so ♂ / special chars work
    //   - after "-chapter-<digits>", a "-<digit>" = decimal part
    //   - after "-chapter-<digits>", a "-<letter>" = ignorable suffix
    // ─────────────────────────────────────────────
    function parseChapterUrl(rawPathname) {
        // Decode percent-encoding (e.g. %e2%99%82 → ♂)
        let path;
        try { path = decodeURIComponent(rawPathname); }
        catch (_) { path = rawPathname; } // malformed encoding — use as-is

        // Pattern breakdown:
        //   ^\/(.+)        → greedy slug (backtracks to last "-chapter-")
        //   -chapter-      → literal separator
        //   (\d+)          → major chapter number
        //   (?:[.-](\d+))? → optional decimal part (dot OR hyphen + digits)
        //   (?:-[a-zA-Z]   → start of optional word suffix (letter after hyphen)
        //   [^/]*)? \/?$   → rest of suffix, then optional slash, end
        const m = path.match(
            /^\/(.+)-chapter-(\d+)(?:[.-](\d+))?(?:-[a-zA-Z][^/]*)?\/?$/i
        );
        if (!m) return null;

        const titleSlug  = m[1];
        const major      = m[2];
        const minor      = m[3]; // undefined if no decimal part

        // Build display number: "133" or "133.5"
        const chapterNum = minor ? `${major}.${minor}` : major;

        // Build human title from slug (capitalize each word, keep symbols intact)
        const mangaTitle = titleSlug
            .split('-')
            .map((w) => w ? w.charAt(0).toUpperCase() + w.slice(1) : w)
            .join(' ');

        return { titleSlug, chapterNum, mangaTitle };
    }

    // ─────────────────────────────────────────────
    // STORAGE HELPERS (shared with MangaDex)
    // ─────────────────────────────────────────────
    async function loadHistory() {
        const r = await chrome.storage.local.get(['md_history_data']);
        try { return JSON.parse(r.md_history_data || '[]'); } catch { return []; }
    }

    async function persistHistory(history) {
        if (history.length > 300) history = history.slice(0, 300);
        await chrome.storage.local.set({ md_history_data: JSON.stringify(history) });
        if (window.__AMT) window.__AMT.notifyHistoryUpdate();
    }

    // ─────────────────────────────────────────────
    // KOMIKU / KOMIKINDO / MAID HISTORY
    // ─────────────────────────────────────────────
    async function recordKomikHistory() {
        const parsed = parseChapterUrl(window.location.pathname);
        if (!parsed) return;

        const { titleSlug, chapterNum, mangaTitle } = parsed;
        const chapterId = `${hostname}:${titleSlug}:ch${chapterNum}`;

        let history = await loadHistory();
        const entry = {
            chapterId,
            url:        window.location.href,
            mangaTitle,
            chapterStr: `Chapter ${chapterNum}`,
            timestamp:  Date.now(),
        };
        const idx = history.findIndex((i) => i.chapterId === chapterId);
        if (idx !== -1) history.splice(idx, 1);
        history.unshift(entry);
        await persistHistory(history);
    }

    // ─────────────────────────────────────────────
    // MANGADEX HISTORY
    // ─────────────────────────────────────────────
    function parseMDTitle(rawTitle) {
        const clean = rawTitle.replace(/\s*-\s*MangaDex$/i, '');
        const parts = clean.split(' - ');
        return {
            chapterStr: parts[0].replace(/^\d+\s*\|\s*/, '').trim(),
            mangaTitle: parts.length > 1 ? parts.slice(1).join(' - ').trim() : 'Unknown Title',
        };
    }

    async function saveMDHistory(chapterId, url, docTitle) {
        let history = await loadHistory();
        history = history.map((item) => {
            if (!item.mangaTitle) {
                const p = parseMDTitle(item.title || '');
                item.mangaTitle = p.mangaTitle; item.chapterStr = p.chapterStr;
            }
            return item;
        });
        const parsed = parseMDTitle(docTitle);
        const entry  = { chapterId, url, ...parsed, timestamp: Date.now() };
        const idx    = history.findIndex((i) => i.chapterId === chapterId);
        if (idx !== -1) history.splice(idx, 1);
        history.unshift(entry);
        await persistHistory(history);
    }

    let lastMDUrl = '';
    function checkMDUrl() {
        const currentUrl = window.location.href;
        if (!currentUrl.includes('/chapter/')) return;
        const title = document.title;
        if (title === 'MangaDex' || title.toLowerCase().includes('loading')) return;
        if (currentUrl !== lastMDUrl) {
            const m = currentUrl.match(/\/chapter\/([a-f0-9-]+)/i);
            if (m) { lastMDUrl = currentUrl; saveMDHistory(m[1], currentUrl, title); }
        }
    }

    // ─────────────────────────────────────────────
    // BOOT
    // ─────────────────────────────────────────────
    initDarkMode();

    if (isKomikindo) {
        handleAds();
        new MutationObserver(handleAds).observe(document.body, { childList: true, subtree: true });
    }

    if (isKomiku || isKomikindo || isMaid) recordKomikHistory();
    if (isMangaDex) setInterval(checkMDUrl, 2000);
	
	//Parser
	function parseWithConfig(cfg, pathname) {
    // If a urlPattern regex string is provided, use it
    // Expected: two capture groups — (1) id/slug, (2) page/chapter number
    if (cfg.urlPattern) {
        try {
            const re = new RegExp(cfg.urlPattern);
            const m = pathname.match(re);
            if (!m) return null;
            const slug = m[1];
            const num  = m[2];
            // titleFromPage: if true, parse manga title from document.title
            // titlePattern: regex string to extract title from document.title
            //   first capture group = title, applied before stripping
            let mangaTitle = slug.replace(/-/g, ' ');
            if (cfg.titleFromPage) {
                const raw = cfg.titlePattern
                    ? (document.title.match(new RegExp(cfg.titlePattern)) || [])[1] || document.title
                    : document.title;
                mangaTitle = raw.replace(/\s*-\s*Page\s*\d+.*$/i, '')
                               .replace(/\s*[|»].*$/, '')
                               .trim() || mangaTitle;
            }
            return { titleSlug: (cfg.slugPrefix || '') + slug, chapterNum: num, mangaTitle };
        } catch (_) { return null; }
    }
    // Fall back to standard chapter URL parser
    return parseChapterUrl(pathname);
}

    // Called once customMangaMatch is resolved (may run later, after storage load)
    function bootCustomManga() {
        if (!customMangaMatch) return;
        // Use custom parsePath if provided, otherwise fall back to the standard parseChapterUrl
        const parsed = parseWithConfig(customMangaMatch, window.location.pathname);
		// Watch for URL changes (History API navigation, e.g. nhentai page turns)
		let lastPath = window.location.pathname;
		setInterval(() => {
			const path = window.location.pathname;
			if (path === lastPath) return;
			lastPath = path;
			const newParsed = parseWithConfig(customMangaMatch, path);
			if (!newParsed) return;
			const { titleSlug, chapterNum, mangaTitle } = newParsed;
			const chapterId = `${hostname}:${titleSlug}:ch${chapterNum}`;
			loadHistory().then((history) => {
				const entry = {
					chapterId,
					url:        window.location.href,
					mangaTitle,
					chapterStr: `Chapter ${chapterNum}`,
					timestamp:  Date.now(),
				};
				const idx = history.findIndex((i) => i.chapterId === chapterId);
				if (idx !== -1) history.splice(idx, 1);
				history.unshift(entry);
				persistHistory(history);
				if (window.__AMT) window.__AMT.notifyHistoryUpdate();
			});
		}, 1000);
        if (parsed) {
            const { titleSlug, chapterNum, mangaTitle } = parsed;
            const chapterId = `${hostname}:${titleSlug}:ch${chapterNum}`;
            loadHistory().then((history) => {
                const entry = {
                    chapterId,
                    url:        window.location.href,
                    mangaTitle,
                    chapterStr: `Chapter ${chapterNum}`,
                    timestamp:  Date.now(),
                };
                const idx = history.findIndex((i) => i.chapterId === chapterId);
                if (idx !== -1) history.splice(idx, 1);
                history.unshift(entry);
                persistHistory(history);
            });
        }
    }
})();