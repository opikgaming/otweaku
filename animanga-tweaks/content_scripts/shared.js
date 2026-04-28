// =============================================================
// shared.js — Unified AniManga History Modal
//
// Tabs: Anime | Manga | Edit JSON
// Keyboard shortcut: Alt+H  (toggle modal)
//                    Alt+D  (dark mode — handled by anime.js / manga.js)
//
// Exposes window.__AMT = { toggleModal, notifyHistoryUpdate, setDefaultTab }
//
// Storage keys (all optional fields are backward-compatible):
//   anime_history : { [slug]: { title, episodes: { [ep]: { currentTime, duration, url? } },
//                               label?, note?, episodeNotes?: { [ep]: string } } }
//   md_history_data : JSON string — array of chapter entries (unchanged)
//   manga_meta      : JSON string — { [mangaTitle]: { label?, note?,
//                                     chapterNotes?: { [chapterId]: string } } }
// =============================================================
(function () {
    'use strict';

    if (window.__AMT_INIT) return;
    window.__AMT_INIT = true;

    // ─────────────────────────────────────────────
    // STORAGE HELPERS
    // ─────────────────────────────────────────────
    const Storage = {
        async getAnimeHistory() {
            const r = await chrome.storage.local.get(['anime_history']);
            return r.anime_history || {};
        },
        async setAnimeHistory(h) {
            await chrome.storage.local.set({ anime_history: h });
        },
        async getMangaHistory() {
            const r = await chrome.storage.local.get(['md_history_data']);
            try { return JSON.parse(r.md_history_data || '[]'); } catch { return []; }
        },
        async setMangaHistory(h) {
            await chrome.storage.local.set({ md_history_data: JSON.stringify(h) });
        },
        async getMangaMeta() {
            const r = await chrome.storage.local.get(['manga_meta']);
            try { return JSON.parse(r.manga_meta || '{}'); } catch { return {}; }
        },
        async setMangaMeta(m) {
            await chrome.storage.local.set({ manga_meta: JSON.stringify(m) });
        },
    };

    // ─────────────────────────────────────────────
    // GITHUB CLOUD SYNC
    // ─────────────────────────────────────────────
    // !! Replace the token below with your actual GitHub PAT !!
    // File: content_scripts/shared.js  (search for GH_TOKEN)
    const GH_TOKEN = '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';
    const GH_OWNER = 'opikgaming';
    const GH_REPO  = 'ore-no-database-da';
    const GH_HISTORY_PATH = 'anm_data.json';   // anime history
    const GH_SITES_PATH   = 'anm_prof.json';   // custom sites

    async function ghGetFile(path) {
        const res = await fetch(
            `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
            { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' } }
        );
        if (res.status === 404) return { content: null, sha: null };
        if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
        const data = await res.json();
        const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
        return { content, sha: data.sha };
    }

    async function ghPutFile(path, sha, content) {
        const body = { message: `AniMangaTweaks backup ${new Date().toISOString()}`,
                       content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))) };
        if (sha) body.sha = sha;
        const res = await fetch(
            `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
            { method: 'PUT', headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
              body: JSON.stringify(body) }
        );
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || res.status); }
    }

    async function ghPushHistory(statusEl) {
        statusEl.className = 'amt-gh-status inf'; statusEl.textContent = 'Pushing…';
        try {
            const [anime, manga, meta] = await Promise.all([
                Storage.getAnimeHistory(), Storage.getMangaHistory(), Storage.getMangaMeta()
            ]);
            const payload = { anime_history: anime, md_history_data: manga, manga_meta: meta };
            const { sha } = await ghGetFile(GH_HISTORY_PATH);
            await ghPutFile(GH_HISTORY_PATH, sha, payload);
            statusEl.className = 'amt-gh-status ok';
            statusEl.textContent = 'Pushed';
        } catch (e) {
            statusEl.className = 'amt-gh-status err'; statusEl.textContent = 'Error: ' + e.message;
        }
    }

    async function ghPullHistory(statusEl) {
        statusEl.className = 'amt-gh-status inf'; statusEl.textContent = 'Pulling…';
        try {
            const { content } = await ghGetFile(GH_HISTORY_PATH);
            if (!content) { statusEl.className = 'amt-gh-status err'; statusEl.textContent = 'No data in repo yet.'; return; }
            if (content.anime_history)   await Storage.setAnimeHistory(content.anime_history);
            if (content.md_history_data) await Storage.setMangaHistory(content.md_history_data);
            if (content.manga_meta)      await Storage.setMangaMeta(content.manga_meta);
            statusEl.className = 'amt-gh-status ok';
            statusEl.textContent = 'Imported ✓ ' + new Date().toLocaleTimeString();
            // Refresh textarea content if JSON editor is open
            if (activeTab === 'json') renderJsonEditor();
        } catch (e) {
            statusEl.className = 'amt-gh-status err'; statusEl.textContent = 'Error: ' + e.message;
        }
    }

    async function ghPushSites(statusEl) {
        statusEl.className = 'amt-gh-status inf'; statusEl.textContent = 'Pushing…';
        try {
            const r = await chrome.storage.local.get(['tweaks_customAnimeSites', 'tweaks_customMangaSites']);
            const payload = { animeSites: r.tweaks_customAnimeSites || [], mangaSites: r.tweaks_customMangaSites || [] };
            const { sha } = await ghGetFile(GH_SITES_PATH);
            await ghPutFile(GH_SITES_PATH, sha, payload);
            statusEl.className = 'amt-gh-status ok';
            statusEl.textContent = 'Pushed';
        } catch (e) {
            statusEl.className = 'amt-gh-status err'; statusEl.textContent = 'Error: ' + e.message;
        }
    }

    async function ghPullSites(statusEl) {
        statusEl.className = 'amt-gh-status inf'; statusEl.textContent = 'Pulling…';
        try {
            const { content } = await ghGetFile(GH_SITES_PATH);
            if (!content) { statusEl.className = 'amt-gh-status err'; statusEl.textContent = 'No data in repo yet.'; return; }
            if (Array.isArray(content.animeSites)) await chrome.storage.local.set({ tweaks_customAnimeSites: content.animeSites });
            if (Array.isArray(content.mangaSites)) await chrome.storage.local.set({ tweaks_customMangaSites: content.mangaSites });
            statusEl.className = 'amt-gh-status ok';
            statusEl.textContent = 'Imported ✓ ' + new Date().toLocaleTimeString();
            if (activeTab === 'sites') renderSites();
        } catch (e) {
            statusEl.className = 'amt-gh-status err'; statusEl.textContent = 'Error: ' + e.message;
        }
    }


    function formatTime(s) {
        if (!s || isNaN(s)) return '00:00';
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    }

    function escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
        })[c]);
    }

    function formatDate(ts) {
        const d = new Date(ts);
        return d.toLocaleDateString('en-US') + ' ' +
               d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    // ─────────────────────────────────────────────
    // LABEL CONFIG
    // ─────────────────────────────────────────────
    const LABELS = {
        'watching': { text: 'Watching', bg: '#1a3a5c', color: '#3ea6ff', border: '#2a5a8c' },
        'on-hold':  { text: 'On Hold',  bg: '#3a2a1a', color: '#ffa040', border: '#5a4a2a' },
        'finished': { text: 'Finished', bg: '#1a3a1a', color: '#4ade80', border: '#2a5a2a' },
        'dropped':  { text: 'Dropped',  bg: '#3a1a1a', color: '#ff4a4a', border: '#5a2a2a' },
    };

    // Returns 0 = active (watching/on-hold/no label), 1 = finished, 2 = dropped
    function labelGroup(label) {
        if (label === 'finished') return 1;
        if (label === 'dropped')  return 2;
        return 0;
    }

    // ─────────────────────────────────────────────
    // MODAL STATE
    // ─────────────────────────────────────────────
    let isOpen     = false;
    let activeTab  = 'anime';   // 'anime' | 'manga' | 'json'
    let isEditMode = false;

    let animeSearch     = '';
    let animePage       = 1;
    let animeFilter     = 'all';
    let animeTotalPages = 1;
    const ANIME_PER_PAGE = 8;

    let mangaSearch     = '';
    let mangaPage       = 1;
    let mangaFilter     = 'all';
    let mangaTotalPages = 1;
    const MANGA_PER_PAGE = 5;

    let selectedSlugs      = new Set();
    let selectedChapterIds = new Set();

    // ─────────────────────────────────────────────
    // STYLES
    // ─────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('amt-styles')) return;
        const css = `
            body, html {
                background-color: #0f0f0f !important;
                color: #f1f1f1 !important;
            }
            #content, .wrapper, .container, .main-inner, #wrapper {
                background-color: #0f0f0f !important;
            }
            article, section, aside, header, footer, nav {
                background-color: transparent !important;
            }
            div, article, section, aside, header, footer, nav, ul, li {
                border-color: #272727 !important;
            }
            ul.dropdown-menu, .sub-menu, .c4 {
                background-color: #212121 !important;
                border-radius: 6px !important;
                border: 1px solid #3d3d3d !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
            }
            .bsx, .animpost, .post-item, .widget, .box, .megavid {
                background-color: #212121 !important;
                border-radius: 8px !important;
                border: 1px solid #3d3d3d !important;
                overflow: hidden;
            }
            input, button, select, textarea {
                background-color: #212121 !important;
                color: #f1f1f1 !important;
                border: 1px solid #3d3d3d !important;
            }

            /* ── Backdrop ── */
            #amt-backdrop {
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.65);
                z-index: 2147483645;
                display: none;
            }

            /* ── Modal ── */
            #amt-modal {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 90%; max-width: 660px; max-height: 84vh;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: brightness(0.2);
                color: #f1f1f1;
                border: 1px solid #303030; border-radius: 12px;
                z-index: 2147483646;
                display: none; flex-direction: column;
                box-shadow: 0 14px 48px rgba(0,0,0,0.9);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 14px;
            }

            /* ── Header ── */
            #amt-header {
                padding: 14px 16px;
                border-bottom: 1px solid #303030;
                display: flex; justify-content: space-between; align-items: center;
                flex-shrink: 0;
            }
            #amt-header h2 {
                margin: 0; font-size: 1.05rem; color: #fff;
                font-weight: 700; letter-spacing: 0.02em;
            }
            .amt-header-btns { display: flex; gap: 8px; align-items: center; }
            #amt-edit-btn {
                background: #3ea6ff; color: #000; border: none;
                border-radius: 5px; padding: 4px 13px;
                font-size: 0.8rem; font-weight: 700; cursor: pointer;
                transition: background 0.15s;
            }
            #amt-edit-btn.active { background: #ff4a4a; color: #fff; }
            #amt-edit-btn:hover:not(.active) { background: #61b8ff; }
            #amt-modal[data-tab="json"] #amt-edit-btn { display: none; }
            #amt-close-btn {
                background: none; border: none; color: #888;
                font-size: 1.35rem; cursor: pointer; padding: 0 3px;
                line-height: 1; transition: color 0.15s;
            }
            #amt-close-btn:hover { color: #ff4a4a; }

            /* ── Tabs ── */
            #amt-tabs {
                display: flex; border-bottom: 1px solid #303030;
                flex-shrink: 0;
            }
            .amt-tab {
                flex: 1; padding: 10px 0;
                background: rgba(0,0,0,0.8); border: none; border-bottom: 2px solid transparent;
                color: #777; cursor: pointer; font-size: 0.86rem; font-weight: 600;
                transition: color 0.15s, border-color 0.15s;
            }
            .amt-tab:hover { color: #ccc; }
            .amt-tab[data-tab="anime"].active  { color: #3ea6ff; border-bottom-color: #3ea6ff; }
            .amt-tab[data-tab="manga"].active  { color: #ff6740; border-bottom-color: #ff6740; }
            .amt-tab[data-tab="json"].active   { color: #a78bfa; border-bottom-color: #a78bfa; }
            .amt-tab[data-tab="sites"].active  { color: #4ade80; border-bottom-color: #4ade80; }

            /* ── Controls ── */
            #amt-controls {
                padding: 11px 16px;
                border-bottom: 1px solid #303030;
                display: flex; flex-direction: column; gap: 8px;
                flex-shrink: 0;
            }
            #amt-modal[data-tab="json"] #amt-controls { display: none; }
            #amt-modal[data-tab="sites"] #amt-controls { display: none; }
            #amt-modal[data-tab="sites"] #amt-edit-btn { display: none; }
            #amt-modal[data-tab="sites"] #amt-add-btn  { display: none; }

            #amt-search {
                width: 100%; padding: 8px 11px; border-radius: 6px;
                background: #111; color: #f1f1f1;
                border: 1px solid #3a3a3a; outline: none;
                box-sizing: border-box; font-size: 0.88rem;
                transition: border-color 0.15s;
            }
            #amt-search:focus { border-color: #3ea6ff; }
            #amt-search::placeholder { color: #555; }

            /* ── Filter row ── */
            #amt-filter-row { display: flex; gap: 5px; flex-wrap: wrap; }
            .amt-filter-btn {
                font-size: 0.71rem; padding: 2px 10px;
                border-radius: 10px; border: 1px solid #2a2a2a;
                background: #141414; color: #555; cursor: pointer;
                transition: all 0.15s; font-weight: 600;
            }
            .amt-filter-btn:hover { color: #aaa; border-color: #555; }
            .amt-filter-btn.active[data-label="all"]      { background: #2e2e2e; border-color: #555;    color: #ddd; }
            .amt-filter-btn.active[data-label="watching"] { background: #1a3a5c; border-color: #2a5a8c; color: #3ea6ff; }
            .amt-filter-btn.active[data-label="on-hold"]  { background: #3a2a1a; border-color: #5a4a2a; color: #ffa040; }
            .amt-filter-btn.active[data-label="finished"] { background: #1a3a1a; border-color: #2a5a2a; color: #4ade80; }
            .amt-filter-btn.active[data-label="dropped"]  { background: #3a1a1a; border-color: #5a2a2a; color: #ff4a4a; }

            #amt-delete-bar { display: none; justify-content: flex-end; }
            #amt-modal.edit-mode #amt-delete-bar { display: flex; }
            #amt-delete-selected-btn {
                background: #ff4a4a; color: #fff; border: none;
                border-radius: 5px; padding: 6px 14px;
                font-size: 0.8rem; font-weight: 700; cursor: pointer;
            }
            #amt-delete-selected-btn:disabled { opacity: 0.35; cursor: default; }

            /* ── Scrollable content ── */
            #amt-content {
                padding: 14px 16px; overflow-y: auto; flex-grow: 1;
                scrollbar-width: thin; scrollbar-color: #3a3a3a #181818;
            }
            #amt-content::-webkit-scrollbar { width: 5px; }
            #amt-content::-webkit-scrollbar-track { background: #181818; }
            #amt-content::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 3px; }

            /* ── Pagination ── */
            #amt-pagination {
                padding: 10px 16px;
                border-top: 1px solid #303030;
                display: flex; justify-content: space-between; align-items: center;
                flex-shrink: 0; gap: 4px;
            }
            #amt-modal[data-tab="json"] #amt-pagination { display: none; }
            .amt-page-btn {
                background: #2a2a2a; color: #f1f1f1;
                border: 1px solid #3a3a3a; border-radius: 5px;
                padding: 5px 10px; cursor: pointer; font-size: 0.8rem;
                transition: background 0.15s; flex-shrink: 0;
            }
            .amt-page-btn:hover:not(:disabled) { background: #383838; }
            .amt-page-btn:disabled { opacity: 0.3; cursor: default; }
            .amt-page-info {
                font-size: 0.8rem; color: #777;
                flex: 1; text-align: center;
            }

            /* ── History rows ── */
            .amt-row {
                margin-bottom: 16px;
                display: flex; align-items: flex-start; gap: 10px;
            }
            .amt-item-checkbox {
                display: none; margin-top: 4px;
                width: 15px; height: 15px;
                accent-color: #ff4a4a; cursor: pointer; flex-shrink: 0;
            }
            #amt-modal.edit-mode .amt-item-checkbox { display: block; }

            .amt-item-body { flex-grow: 1; min-width: 0; }

            .amt-item-title-row {
                display: flex; align-items: center; flex-wrap: wrap;
                gap: 6px; margin-bottom: 6px;
            }
            .amt-item-title {
                font-weight: 700; font-size: 0.93rem;
            }
            #amt-modal[data-tab="anime"] .amt-item-title { color: #3ea6ff; }
            #amt-modal[data-tab="manga"] .amt-item-title { color: #ff6740; }

            /* ── Label pill ── */
            .amt-label-pill {
                display: inline-flex; align-items: center;
                font-size: 0.63rem; font-weight: 700;
                padding: 1px 7px; border-radius: 10px;
                text-transform: uppercase; letter-spacing: 0.05em;
                flex-shrink: 0;
            }

            /* ── Label select (edit mode) ── */
            .amt-label-select {
                font-size: 0.71rem; background: #1a1a1a; color: #bbb;
                border: 1px solid #333; border-radius: 4px;
                padding: 2px 5px; cursor: pointer;
            }
            .amt-label-select:focus { outline: none; border-color: #555; }

            /* ── Note widgets ── */
            .amt-note-wrap { margin-top: 3px; }

            .amt-note-toggle {
                font-size: 0.67rem; color: #444; background: none;
                border: 1px solid #252525; border-radius: 4px;
                padding: 1px 7px; cursor: pointer;
                transition: color 0.15s, border-color 0.15s;
            }
            .amt-note-toggle:hover { color: #999; border-color: #555; }
            .amt-note-toggle.has-note { color: #9d7fe8; border-color: #4c3f7a; }

            .amt-note-area {
                margin-top: 5px; padding: 7px 9px;
                background: #0e0e0e; border: 1px solid #2a2a2a;
                border-radius: 5px; font-size: 0.79rem;
                color: #c4b5fd; white-space: pre-wrap;
                word-break: break-word; line-height: 1.5;
            }
            .amt-note-textarea {
                display: block; width: 100%; box-sizing: border-box;
                background: #0e0e0e; color: #e0e0e0;
                border: 1px solid #4c3f7a; border-radius: 5px;
                padding: 7px 9px; font-size: 0.79rem;
                resize: vertical; outline: none;
                font-family: inherit; min-height: 56px;
                margin-top: 5px; line-height: 1.5;
            }
            .amt-note-textarea:focus { border-color: #a78bfa; }

            /* ── Per-episode / per-chapter note toggle ── */
            .amt-ep-note-toggle {
                font-size: 0.61rem; color: #3a3a3a; background: none;
                border: 1px solid #222; border-radius: 3px;
                padding: 1px 5px; cursor: pointer; margin-top: 3px;
                transition: color 0.15s, border-color 0.15s;
                display: none;
            }
            #amt-modal.edit-mode .amt-ep-note-toggle { display: inline-block; }
            .amt-ep-note-toggle.has-note {
                color: #9d7fe8; border-color: #4c3f7a;
                display: inline-block;
            }
            .amt-ep-note-toggle:hover { color: #888; border-color: #444; }

            .amt-ep-note-area {
                margin-top: 3px; padding: 5px 7px;
                background: #0e0e0e; border: 1px solid #2a2a2a;
                border-radius: 4px; font-size: 0.7rem;
                color: #c4b5fd; white-space: pre-wrap; word-break: break-word;
            }
            .amt-ep-note-textarea {
                display: block; width: 100%; box-sizing: border-box;
                background: #0e0e0e; color: #e0e0e0;
                border: 1px solid #4c3f7a; border-radius: 4px;
                padding: 5px 7px; font-size: 0.7rem;
                resize: vertical; outline: none;
                font-family: inherit; min-height: 44px; margin-top: 3px;
            }
            .amt-ep-note-textarea:focus { border-color: #a78bfa; }

            /* ── Badge grid ── */
            .amt-badge-list {
                display: flex; flex-wrap: wrap; gap: 6px;
                margin-top: 8px;
            }

            .amt-ep-badge, .amt-ch-badge {
                position: relative;
                background: #242424; border: 1px solid #383838;
                border-radius: 5px; padding: 5px 11px;
                display: flex; flex-direction: column; align-items: flex-start;
                font-size: 0.8rem; transition: border-color 0.15s;
            }
            .amt-ep-badge:hover, .amt-ch-badge:hover { border-color: #555; }

            .amt-ep-badge a {
                color: #f1f1f1; text-decoration: none;
            }
            .amt-ep-badge a:hover { color: #3ea6ff; }
            .amt-ep-progress { font-size: 0.67rem; color: #888; margin-top: 2px; }

            .amt-ch-badge { max-width: 185px; }
            .amt-ch-badge a {
                color: #f1f1f1; text-decoration: none;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                display: block; max-width: 100%;
            }
            .amt-ch-badge a:hover { color: #ff6740; }
            .amt-ch-time { font-size: 0.67rem; color: #888; margin-top: 2px; }

            /* ── Per-badge delete (edit mode) ── */
            .amt-del-x {
                display: none;
                position: absolute; top: -7px; right: -7px;
                background: #ff4a4a; color: #fff; border: none;
                border-radius: 50%; width: 17px; height: 17px;
                font-size: 11px; font-weight: 700; line-height: 1;
                cursor: pointer; padding: 0;
                align-items: center; justify-content: center;
                transition: background 0.15s;
            }
            .amt-del-x:hover { background: #ff2020; }
            #amt-modal.edit-mode .amt-del-x { display: flex; }

            /* ── Section divider (finished / dropped groups) ── */
            .amt-section-divider {
                width: 100%;
                font-size: 0.67rem; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.1em; color: #444;
                padding: 8px 0 10px 0;
                border-top: 1px solid #1e1e1e; margin-top: 2px;
            }

            /* ── JSON Editor ── */
            .amt-json-note {
                margin: 0 0 12px 0; padding: 10px 13px;
                background: #1a1530; border: 1px solid #4c3f7a;
                border-radius: 7px; font-size: 0.79rem;
                line-height: 1.6; color: #c4b5fd;
            }
            .amt-json-note strong { color: #a78bfa; }
            .amt-json-note code {
                background: #2d2850; padding: 1px 5px;
                border-radius: 3px; font-size: 0.9em;
                font-family: 'Fira Code', 'Consolas', monospace;
            }
            .amt-json-section { margin-bottom: 14px; }
            .amt-json-label {
                font-size: 0.77rem; font-weight: 700; color: #888;
                text-transform: uppercase; letter-spacing: 0.08em;
                margin-bottom: 5px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .amt-json-label span { color: #555; font-weight: 400; text-transform: none; letter-spacing: 0; }
            .amt-json-textarea {
                width: 100%; height: 130px;
                background: #0f0f0f; color: #e0e0e0;
                border: 1px solid #3a3a3a; border-radius: 6px;
                padding: 9px 11px; box-sizing: border-box;
                font-family: 'Fira Code', 'Consolas', monospace;
                font-size: 0.78rem; line-height: 1.5;
                resize: vertical; outline: none;
                transition: border-color 0.15s;
            }
            .amt-json-textarea:focus { border-color: #a78bfa; }
            .amt-json-textarea.error { border-color: #ff4a4a !important; }
            .amt-json-actions {
                display: flex; gap: 8px; align-items: center; margin-top: 4px;
            }
            .amt-json-save-btn {
                background: #a78bfa; color: #000; border: none;
                border-radius: 5px; padding: 7px 18px;
                font-size: 0.82rem; font-weight: 700; cursor: pointer;
                transition: background 0.15s;
            }
            .amt-json-save-btn:hover { background: #c4b5fd; }
            .amt-json-reset-btn {
                background: #2a2a2a; color: #ccc;
                border: 1px solid #3a3a3a; border-radius: 5px;
                padding: 7px 14px; font-size: 0.82rem; cursor: pointer;
                transition: background 0.15s;
            }
            .amt-json-reset-btn:hover { background: #383838; }
            .amt-json-status {
                font-size: 0.78rem; margin-left: 4px;
                opacity: 0; transition: opacity 0.3s;
            }
            .amt-json-status.ok  { color: #4ade80; opacity: 1; }
            .amt-json-status.err { color: #ff4a4a; opacity: 1; }
            .amt-json-export-btn {
                background: #1a3a2a; color: #4ade80;
                border: 1px solid #2a5a3a; border-radius: 5px;
                padding: 7px 14px; font-size: 0.82rem; cursor: pointer;
                transition: background 0.15s; margin-left: auto;
            }
            .amt-json-export-btn:hover { background: #243f30; }
            .amt-json-import-btn {
                background: #1a2a3a; color: #3ea6ff;
                border: 1px solid #2a3a5a; border-radius: 5px;
                padding: 7px 14px; font-size: 0.82rem; cursor: pointer;
                transition: background 0.15s;
            }
            .amt-json-import-btn:hover { background: #1f3347; }

            /* ── Empty state ── */
            .amt-empty {
                text-align: center; color: #555;
                padding: 32px 0; font-size: 0.88rem;
            }

            /* ── Manual Add button ── */
            #amt-add-btn {
                background: #1a3a1a; color: #4ade80;
                border: 1px solid #2a5a2a; border-radius: 5px;
                padding: 4px 11px; font-size: 0.8rem; font-weight: 700;
                cursor: pointer; transition: background 0.15s;
            }
            #amt-add-btn:hover { background: #213f21; }
            #amt-modal[data-tab="json"] #amt-add-btn { display: none; }

            /* ── Manual Add panel ── */
            #amt-add-panel {
                display: none;
                padding: 12px 16px;
                border-bottom: 1px solid #303030;
                background: #0d1a0d;
                flex-direction: column; gap: 8px;
                flex-shrink: 0;
            }
            #amt-add-panel.open { display: flex; }
            #amt-modal[data-tab="json"] #amt-add-panel { display: none !important; }

            .amt-add-row {
                display: flex; gap: 7px; align-items: center; flex-wrap: wrap;
            }
            .amt-add-label {
                font-size: 0.74rem; color: #777; min-width: 68px; flex-shrink: 0;
            }
            .amt-add-input {
                flex: 1; min-width: 60px;
                padding: 5px 9px; border-radius: 5px;
                background: #111; color: #f1f1f1;
                border: 1px solid #2e4a2e; outline: none;
                font-size: 0.82rem; box-sizing: border-box;
                transition: border-color 0.15s;
            }
            .amt-add-input:focus { border-color: #4ade80; }
            .amt-add-input.error { border-color: #ff4a4a !important; }
            .amt-add-save-btn {
                background: #4ade80; color: #000; border: none;
                border-radius: 5px; padding: 5px 14px;
                font-size: 0.8rem; font-weight: 700; cursor: pointer;
                transition: background 0.15s; flex-shrink: 0;
            }
            .amt-add-save-btn:hover { background: #6aee96; }
            .amt-add-cancel-btn {
                background: #1e1e1e; color: #888;
                border: 1px solid #2e2e2e; border-radius: 5px;
                padding: 5px 11px; font-size: 0.8rem; cursor: pointer;
                transition: background 0.15s; flex-shrink: 0;
            }
            .amt-add-cancel-btn:hover { background: #2a2a2a; color: #ccc; }
            .amt-add-hint {
                font-size: 0.7rem; color: #4a6a4a; line-height: 1.5;
            }
            .amt-add-status {
                font-size: 0.75rem; margin-left: 2px;
            }
            .amt-add-status.ok  { color: #4ade80; }
            .amt-add-status.err { color: #ff4a4a; }

            /* ── GitHub Cloud Sync ── */
            .amt-gh-sync-bar {
                display: flex; align-items: center; gap: 8px;
                padding: 10px 14px;
                background: #0d1a0d; border: 1px solid #1e3a1e;
                border-radius: 7px; margin-bottom: 10px; flex-wrap: wrap;
            }
            .amt-gh-sync-label {
                font-size: 0.75rem; color: #4ade80; font-weight: 700;
                flex-shrink: 0;
            }
            .amt-gh-sync-btn {
                font-size: 0.76rem; font-weight: 700; cursor: pointer;
                border-radius: 5px; padding: 4px 12px; border: none;
                transition: background 0.15s, opacity 0.15s;
            }
            .amt-gh-push-btn {
                background: #1a3a5c; color: #3ea6ff;
                border: 1px solid #2a5a8c;
            }
            .amt-gh-push-btn:hover { background: #1e4a72; }
            .amt-gh-pull-btn {
                background: #1e3a1e; color: #4ade80;
                border: 1px solid #2a5a2a;
            }
            .amt-gh-pull-btn:hover { background: #243a24; }
            .amt-gh-sync-btn:disabled { opacity: 0.35; cursor: default; }
            .amt-gh-status {
                font-size: 0.73rem; margin-left: 2px; flex: 1; min-width: 0;
            }
            .amt-gh-status.ok  { color: #4ade80; }
            .amt-gh-status.err { color: #ff4a4a; }
            .amt-gh-status.inf { color: #aaa; }

            /* ── Custom Sites Import/Export ── */
            .amt-sites-iobtn {
                font-size: 0.73rem; font-weight: 700; cursor: pointer;
                border-radius: 5px; padding: 3px 11px;
                background: #141414; color: #aaa;
                border: 1px solid #2a2a2a;
                transition: background 0.15s, color 0.15s;
            }
            .amt-sites-iobtn:hover { background: #1e1e1e; color: #eee; }
        `;
        const el = document.createElement('style');
        el.id = 'amt-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    // ─────────────────────────────────────────────
    // BUILD DOM
    // ─────────────────────────────────────────────
    function buildModal() {
        injectStyles();

        const backdrop = document.createElement('div');
        backdrop.id = 'amt-backdrop';
        document.body.appendChild(backdrop);

        const modal = document.createElement('div');
        modal.id = 'amt-modal';
        modal.dataset.tab = activeTab;
        modal.innerHTML = `
            <div id="amt-header">
                <h2>AniManga History</h2>
                <div class="amt-header-btns">
                    <button id="amt-add-btn">&#x2b; Add</button>
                    <button id="amt-edit-btn">Edit</button>
                    <button id="amt-close-btn">&#x2715;</button>
                </div>
            </div>
            <div id="amt-tabs">
                <button class="amt-tab" data-tab="anime">Anime</button>
                <button class="amt-tab" data-tab="manga">Manga</button>
                <button class="amt-tab" data-tab="json">Edit JSON</button>
                <button class="amt-tab" data-tab="sites">Sites</button>
            </div>
            <div id="amt-add-panel"></div>
            <div id="amt-controls">
                <input type="text" id="amt-search" placeholder="Search...">
                <div id="amt-filter-row">
                    <button class="amt-filter-btn active" data-label="all">All</button>
                    <button class="amt-filter-btn" data-label="watching">Watching</button>
                    <button class="amt-filter-btn" data-label="on-hold">On Hold</button>
                    <button class="amt-filter-btn" data-label="finished">Finished</button>
                    <button class="amt-filter-btn" data-label="dropped">Dropped</button>
                </div>
                <div id="amt-delete-bar">
                    <button id="amt-delete-selected-btn" disabled>Delete Selected (0)</button>
                </div>
            </div>
            <div id="amt-content"></div>
            <div id="amt-pagination">
                <button class="amt-page-btn" id="amt-first-btn">&#x7c;&#x25C4;</button>
                <button class="amt-page-btn" id="amt-prev-btn">&#x25C4; Prev</button>
                <span class="amt-page-info" id="amt-page-info">Page 1 / 1</span>
                <button class="amt-page-btn" id="amt-next-btn">Next &#x25BA;</button>
                <button class="amt-page-btn" id="amt-last-btn">&#x25BA;&#x7c;</button>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelectorAll('.amt-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.tab === activeTab);
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        backdrop.addEventListener('click', closeModal);
        document.getElementById('amt-close-btn').addEventListener('click', closeModal);
        document.getElementById('amt-edit-btn').addEventListener('click', toggleEditMode);
        document.getElementById('amt-delete-selected-btn').addEventListener('click', deleteSelected);
        document.getElementById('amt-add-btn').addEventListener('click', toggleAddPanel);

        document.getElementById('amt-search').addEventListener('input', (e) => {
            if (activeTab === 'anime') { animeSearch = e.target.value.toLowerCase(); animePage = 1; }
            else                       { mangaSearch = e.target.value.toLowerCase(); mangaPage = 1; }
            renderContent();
        });

        document.getElementById('amt-filter-row').addEventListener('click', (e) => {
            const btn = e.target.closest('.amt-filter-btn');
            if (!btn) return;
            const label = btn.dataset.label;
            if (activeTab === 'anime') { animeFilter = label; animePage = 1; }
            else                       { mangaFilter = label; mangaPage = 1; }
            syncFilterButtons(label);
            renderContent();
        });

        document.getElementById('amt-first-btn').addEventListener('click', () => {
            if (activeTab === 'anime') animePage = 1;
            else mangaPage = 1;
            renderContent();
        });
        document.getElementById('amt-prev-btn').addEventListener('click', () => {
            if (activeTab === 'anime' && animePage > 1) animePage--;
            else if (activeTab === 'manga' && mangaPage > 1) mangaPage--;
            renderContent();
        });
        document.getElementById('amt-next-btn').addEventListener('click', () => {
            if (activeTab === 'anime' && animePage < animeTotalPages) animePage++;
            else if (activeTab === 'manga' && mangaPage < mangaTotalPages) mangaPage++;
            renderContent();
        });
        document.getElementById('amt-last-btn').addEventListener('click', () => {
            if (activeTab === 'anime') animePage = animeTotalPages;
            else mangaPage = mangaTotalPages;
            renderContent();
        });
    }

    // ─────────────────────────────────────────────
    // MANUAL ADD PANEL
    // ─────────────────────────────────────────────
    let addPanelOpen = false;

    function toggleAddPanel() {
        addPanelOpen ? closeAddPanel() : openAddPanel();
    }

    function closeAddPanel() {
        addPanelOpen = false;
        const panel = document.getElementById('amt-add-panel');
        if (!panel) return;
        panel.classList.remove('open');
        panel.innerHTML = '';
        const btn = document.getElementById('amt-add-btn');
        if (btn) btn.textContent = '+ Add';
    }

    function openAddPanel() {
        addPanelOpen = true;
        const panel = document.getElementById('amt-add-panel');
        if (!panel) return;
        panel.classList.add('open');
        const btn = document.getElementById('amt-add-btn');
        if (btn) btn.textContent = '✕ Cancel';
        buildAddPanel(panel);
    }

    function buildAddPanel(panel) {
        panel.innerHTML = '';
        if (activeTab === 'anime') buildAnimeAddPanel(panel);
        else if (activeTab === 'manga') buildMangaAddPanel(panel);
    }

    function buildAnimeAddPanel(panel) {
        const currentUrl = window.location.href;

        // Try to auto-detect title from URL (best-effort)
        const autoSlug = (() => {
            const p = window.location.pathname;
            // Oploverz style: /series/<slug>/episode/<n>
            let m = p.match(/\/series\/([^/]+)\/episode\/(\d+)/);
            if (m) return { slug: m[1], ep: m[2] };
            // Standard style: /<slug>-episode-<n>
            m = p.match(/^\/([^/]+?)-episode-(\d+)/);
            if (m) return { slug: m[1], ep: m[2] };
            return null;
        })();

        const hintText = autoSlug
            ? 'Auto-detected from current URL. Adjust if needed.'
            : 'Manually enter the series slug and episode number.';

        const slugInput = document.createElement('input');
        slugInput.className   = 'amt-add-input';
        slugInput.placeholder = 'series-slug (e.g. my-hero-academia)';
        slugInput.value       = autoSlug ? autoSlug.slug : '';
        slugInput.title       = 'Lowercase hyphen-separated slug that identifies this series';

        const epInput = document.createElement('input');
        epInput.className   = 'amt-add-input';
        epInput.placeholder = 'Episode # (e.g. 5)';
        epInput.type        = 'number';
        epInput.min         = '1';
        epInput.style.maxWidth = '110px';
        epInput.value       = autoSlug ? autoSlug.ep : '';

        const urlInput = document.createElement('input');
        urlInput.className   = 'amt-add-input';
        urlInput.placeholder = 'URL (leave blank to use current page)';
        urlInput.value       = currentUrl;

        const status = document.createElement('span');
        status.className = 'amt-add-status';

        const saveBtn = document.createElement('button');
        saveBtn.className   = 'amt-add-save-btn';
        saveBtn.textContent = 'Save';

        saveBtn.addEventListener('click', async () => {
            slugInput.classList.remove('error');
            epInput.classList.remove('error');
            urlInput.classList.remove('error');
            status.className = 'amt-add-status';
            status.textContent = '';

            const slug = slugInput.value.trim().toLowerCase().replace(/\s+/g, '-');
            const ep   = parseInt(epInput.value, 10);
            const url  = urlInput.value.trim() || window.location.href;

            let hasError = false;
            if (!slug) { slugInput.classList.add('error'); hasError = true; }
            if (!ep || ep < 1) { epInput.classList.add('error'); hasError = true; }
            if (hasError) { status.className = 'amt-add-status err'; status.textContent = 'Fill required fields.'; return; }

            const title = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const h = await Storage.getAnimeHistory();
            if (!h[slug]) h[slug] = { title, episodes: {}, lastAccessed: Date.now() };
            h[slug].lastAccessed = Date.now();
            if (!h[slug].episodes[ep]) {
                h[slug].episodes[ep] = { currentTime: 0, duration: 0, url };
            } else {
                h[slug].episodes[ep].url = url; // update URL if already exists
            }
            await Storage.setAnimeHistory(h);
            status.className = 'amt-add-status ok';
            status.textContent = `Saved Ep ${ep} of "${title}"`;
            if (window.__AMT) window.__AMT.notifyHistoryUpdate();
            setTimeout(() => closeAddPanel(), 1200);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className   = 'amt-add-cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', closeAddPanel);

        const hint = document.createElement('div');
        hint.className   = 'amt-add-hint';
        hint.textContent = hintText;

        const row1 = document.createElement('div');
        row1.className = 'amt-add-row';
        const l1 = document.createElement('span'); l1.className = 'amt-add-label'; l1.textContent = 'Series slug';
        row1.appendChild(l1); row1.appendChild(slugInput);

        const row2 = document.createElement('div');
        row2.className = 'amt-add-row';
        const l2 = document.createElement('span'); l2.className = 'amt-add-label'; l2.textContent = 'Episode #';
        row2.appendChild(l2); row2.appendChild(epInput);

        const row3 = document.createElement('div');
        row3.className = 'amt-add-row';
        const l3 = document.createElement('span'); l3.className = 'amt-add-label'; l3.textContent = 'URL';
        row3.appendChild(l3); row3.appendChild(urlInput);

        const row4 = document.createElement('div');
        row4.className = 'amt-add-row';
        row4.appendChild(saveBtn); row4.appendChild(cancelBtn); row4.appendChild(status);

        panel.appendChild(hint);
        panel.appendChild(row1);
        panel.appendChild(row2);
        panel.appendChild(row3);
        panel.appendChild(row4);

        slugInput.focus();
    }

    function buildMangaAddPanel(panel) {
        const currentUrl = window.location.href;

        // Best-effort auto-detect from current URL
        const autoDetect = (() => {
            const p = window.location.pathname;
            // Standard komiku/maid style: /<title>-chapter-<n>/
            const m = p.match(/^\/(.+)-chapter-(\d+(?:[.-]\d+)?)(?:-[a-zA-Z][^/]*)?\/?$/i);
            if (m) {
                const slug = m[1];
                const num  = m[2].replace('-', '.');
                const title = slug.split('-').map((w) => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
                return { slug, num, title };
            }
            // MangaDex style: /chapter/<uuid>
            if (p.match(/\/chapter\/[a-f0-9-]+/i)) {
                const docTitle = document.title.replace(/\s*-\s*MangaDex$/i, '');
                const parts    = docTitle.split(' - ');
                return {
                    slug:  null,
                    num:   '',
                    title: parts.length > 1 ? parts.slice(1).join(' - ').trim() : docTitle,
                };
            }
            return null;
        })();

        const hintText = autoDetect
            ? 'Auto-detected from current URL. Adjust if needed.'
            : 'Enter manga title and chapter number manually.';

        const titleInput = document.createElement('input');
        titleInput.className   = 'amt-add-input';
        titleInput.placeholder = 'Manga title (e.g. One Piece)';
        titleInput.value       = autoDetect ? autoDetect.title : '';

        const chInput = document.createElement('input');
        chInput.className   = 'amt-add-input';
        chInput.placeholder = 'Chapter # (e.g. 42 or 42.5)';
        chInput.style.maxWidth = '130px';
        chInput.value       = autoDetect ? autoDetect.num : '';

        const urlInput = document.createElement('input');
        urlInput.className   = 'amt-add-input';
        urlInput.placeholder = 'URL (leave blank to use current page)';
        urlInput.value       = currentUrl;

        const status = document.createElement('span');
        status.className = 'amt-add-status';

        const saveBtn = document.createElement('button');
        saveBtn.className   = 'amt-add-save-btn';
        saveBtn.textContent = 'Save';

        saveBtn.addEventListener('click', async () => {
            titleInput.classList.remove('error');
            chInput.classList.remove('error');
            status.className = 'amt-add-status';
            status.textContent = '';

            const mangaTitle = titleInput.value.trim();
            const chapterNum = chInput.value.trim();
            const url        = urlInput.value.trim() || window.location.href;

            let hasError = false;
            if (!mangaTitle) { titleInput.classList.add('error'); hasError = true; }
            if (!chapterNum) { chInput.classList.add('error'); hasError = true; }
            if (hasError) { status.className = 'amt-add-status err'; status.textContent = 'Fill required fields.'; return; }

            // Build a stable chapterId from title + chapter number
            const slugForId  = mangaTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const chapterId  = `manual:${slugForId}:ch${chapterNum}`;
            const chapterStr = `Chapter ${chapterNum}`;

            let history = await Storage.getMangaHistory();
            const idx = history.findIndex((i) => i.chapterId === chapterId);
            const entry = { chapterId, url, mangaTitle, chapterStr, timestamp: Date.now() };
            if (idx !== -1) history.splice(idx, 1);
            history.unshift(entry);
            if (history.length > 300) history = history.slice(0, 300);
            await Storage.setMangaHistory(history);

            status.className = 'amt-add-status ok';
            status.textContent = `Saved ${chapterStr} of "${mangaTitle}"`;
            if (window.__AMT) window.__AMT.notifyHistoryUpdate();
            setTimeout(() => closeAddPanel(), 1200);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className   = 'amt-add-cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', closeAddPanel);

        const hint = document.createElement('div');
        hint.className   = 'amt-add-hint';
        hint.textContent = hintText;

        const row1 = document.createElement('div');
        row1.className = 'amt-add-row';
        const l1 = document.createElement('span'); l1.className = 'amt-add-label'; l1.textContent = 'Title';
        row1.appendChild(l1); row1.appendChild(titleInput);

        const row2 = document.createElement('div');
        row2.className = 'amt-add-row';
        const l2 = document.createElement('span'); l2.className = 'amt-add-label'; l2.textContent = 'Chapter #';
        row2.appendChild(l2); row2.appendChild(chInput);

        const row3 = document.createElement('div');
        row3.className = 'amt-add-row';
        const l3 = document.createElement('span'); l3.className = 'amt-add-label'; l3.textContent = 'URL';
        row3.appendChild(l3); row3.appendChild(urlInput);

        const row4 = document.createElement('div');
        row4.className = 'amt-add-row';
        row4.appendChild(saveBtn); row4.appendChild(cancelBtn); row4.appendChild(status);

        panel.appendChild(hint);
        panel.appendChild(row1);
        panel.appendChild(row2);
        panel.appendChild(row3);
        panel.appendChild(row4);

        titleInput.focus();
    }

    // ─────────────────────────────────────────────
    // TAB / EDIT MODE HELPERS
    // ─────────────────────────────────────────────
    function syncFilterButtons(activeLabel) {
        document.querySelectorAll('.amt-filter-btn').forEach((b) =>
            b.classList.toggle('active', b.dataset.label === activeLabel)
        );
    }

    function switchTab(tab) {
        if (isEditMode) resetEditMode();
        if (addPanelOpen) closeAddPanel();
        activeTab = tab;
        // Reset filter per tab switch
        animeFilter = 'all'; mangaFilter = 'all';
        const modal = document.getElementById('amt-modal');
        modal.dataset.tab = tab;
        modal.querySelectorAll('.amt-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
        syncFilterButtons('all');
        const searchEl = document.getElementById('amt-search');
        if (searchEl && tab !== 'sites') searchEl.value = tab === 'manga' ? mangaSearch : animeSearch;
        renderContent();
    }

    function toggleEditMode() {
        if (isEditMode) { resetEditMode(); } else { enableEditMode(); }
        updateDeleteBtn();
        renderContent(); // re-render so edit-mode elements are added/removed via JS
    }
    function enableEditMode() {
        isEditMode = true;
        document.getElementById('amt-modal').classList.add('edit-mode');
        const btn = document.getElementById('amt-edit-btn');
        btn.classList.add('active'); btn.textContent = 'Cancel';
    }
    function resetEditMode() {
        isEditMode = false;
        selectedSlugs.clear(); selectedChapterIds.clear();
        const modal = document.getElementById('amt-modal');
        if (!modal) return;
        modal.classList.remove('edit-mode');
        const btn = document.getElementById('amt-edit-btn');
        if (btn) { btn.classList.remove('active'); btn.textContent = 'Edit'; }
    }
    function updateDeleteBtn() {
        const btn = document.getElementById('amt-delete-selected-btn');
        if (!btn) return;
        const count = activeTab === 'anime' ? selectedSlugs.size : selectedChapterIds.size;
        btn.textContent = `Delete Selected (${count})`;
        btn.disabled = count === 0;
    }
    async function deleteSelected() {
        if (activeTab === 'anime') {
            if (!selectedSlugs.size) return;
            const h = await Storage.getAnimeHistory();
            selectedSlugs.forEach((s) => delete h[s]);
            await Storage.setAnimeHistory(h); selectedSlugs.clear();
        } else {
            if (!selectedChapterIds.size) return;
            let h = await Storage.getMangaHistory();
            h = h.filter((i) => !selectedChapterIds.has(i.chapterId));
            await Storage.setMangaHistory(h); selectedChapterIds.clear();
        }
        updateDeleteBtn(); renderContent();
    }

    // ─────────────────────────────────────────────
    // RENDER DISPATCH
    // ─────────────────────────────────────────────
    function renderContent() {
        const pag = document.getElementById('amt-pagination');
        if (activeTab === 'json') {
            if (pag) pag.style.display = 'none';
            renderJsonEditor();
            return;
        }
        if (activeTab === 'sites') {
            if (pag) pag.style.display = 'none';
            renderSites();
            return;
        }
        if (pag) pag.style.display = 'flex';
        if (activeTab === 'anime') renderAnime();
        else renderManga();
    }

    // ─────────────────────────────────────────────
    // PAGINATION HELPER
    // ─────────────────────────────────────────────
    function updatePagination(current, total) {
        if (activeTab === 'anime') animeTotalPages = total;
        else mangaTotalPages = total;

        const info  = document.getElementById('amt-page-info');
        const first = document.getElementById('amt-first-btn');
        const prev  = document.getElementById('amt-prev-btn');
        const next  = document.getElementById('amt-next-btn');
        const last  = document.getElementById('amt-last-btn');
        if (!info) return;

        info.textContent = `Page ${current} / ${total}`;
        const atStart = current === 1;
        const atEnd   = current === total;

        [first, prev].forEach((b) => { b.disabled = atStart; b.style.opacity = atStart ? '0.3' : '1'; });
        [next, last].forEach((b)  => { b.disabled = atEnd;   b.style.opacity = atEnd   ? '0.3' : '1'; });
    }

    // ─────────────────────────────────────────────
    // LABEL HELPERS
    // ─────────────────────────────────────────────
    function makeLabelPill(label) {
        if (!label || !LABELS[label]) return null;
        const cfg  = LABELS[label];
        const pill = document.createElement('span');
        pill.className = 'amt-label-pill';
        pill.textContent = cfg.text;
        pill.style.cssText = `background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};`;
        return pill;
    }

    function makeLabelSelect(currentLabel, onChange) {
        const sel = document.createElement('select');
        sel.className = 'amt-label-select';
        [
            ['', 'No label'],
            ['watching', 'Watching'],
            ['on-hold',  'On Hold'],
            ['finished', 'Finished'],
            ['dropped',  'Dropped'],
        ].forEach(([val, text]) => {
            const opt = document.createElement('option');
            opt.value = val; opt.textContent = text;
            if (val === (currentLabel || '')) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => onChange(sel.value || undefined));
        return sel;
    }

    // ─────────────────────────────────────────────
    // NOTE HELPERS
    // ─────────────────────────────────────────────

    // Title-level note widget (appears below the title row, above badges)
    function makeTitleNoteWidget(initialNote, onSave) {
        const wrap = document.createElement('div');
        wrap.className = 'amt-note-wrap';

        const hasNote = !!(initialNote && initialNote.trim());
        if (!isEditMode && !hasNote) return wrap; // nothing to show

        const toggle = document.createElement('button');
        toggle.className = 'amt-note-toggle' + (hasNote ? ' has-note' : '');
        toggle.textContent = 'Note';

        let areaEl    = null;
        let saveTimer = null;

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (areaEl) {
                areaEl.remove(); areaEl = null;
                return;
            }
            if (isEditMode) {
                const ta = document.createElement('textarea');
                ta.className     = 'amt-note-textarea';
                ta.value         = initialNote || '';
                ta.placeholder   = 'Add a note about this title...';
                ta.addEventListener('input', () => {
                    clearTimeout(saveTimer);
                    saveTimer = setTimeout(() => {
                        const val = ta.value.trim();
                        onSave(val || undefined);
                        initialNote = val;
                        toggle.classList.toggle('has-note', !!val);
                        toggle.textContent = 'Note';
                    }, 500);
                });
                areaEl = ta;
                setTimeout(() => ta.focus(), 30);
            } else {
                areaEl = document.createElement('div');
                areaEl.className = 'amt-note-area';
                areaEl.textContent = initialNote || '';
            }
            wrap.appendChild(areaEl);
        });

        wrap.appendChild(toggle);
        return wrap;
    }

    // Episode / chapter-level note toggle (inline inside a badge)
    function makeInlineNoteToggle(initialNote, onSave) {
        const hasNote = !!(initialNote && initialNote.trim());

        const toggle = document.createElement('button');
        toggle.className = 'amt-ep-note-toggle' + (hasNote ? ' has-note' : '');
        toggle.textContent = 'Note';

        let areaEl    = null;
        let saveTimer = null;

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (areaEl) {
                areaEl.remove(); areaEl = null;
                return;
            }
            if (isEditMode) {
                const ta = document.createElement('textarea');
                ta.className   = 'amt-ep-note-textarea';
                ta.value       = initialNote || '';
                ta.placeholder = 'Note...';
                ta.addEventListener('input', () => {
                    clearTimeout(saveTimer);
                    saveTimer = setTimeout(() => {
                        const val = ta.value.trim();
                        onSave(val || undefined);
                        initialNote = val;
                        toggle.classList.toggle('has-note', !!val);
                    }, 500);
                });
                areaEl = ta;
                setTimeout(() => ta.focus(), 30);
            } else {
                areaEl = document.createElement('div');
                areaEl.className   = 'amt-ep-note-area';
                areaEl.textContent = initialNote || '';
            }
            toggle.after(areaEl);
        });

        return toggle;
    }

    // ─────────────────────────────────────────────
    // ANIME TAB
    // ─────────────────────────────────────────────
    async function renderAnime() {
        const content = document.getElementById('amt-content');
        if (!content) return;

        const history = await Storage.getAnimeHistory();
        let keys = Object.keys(history);

        if (animeSearch) keys = keys.filter((k) => history[k].title.toLowerCase().includes(animeSearch));
        if (animeFilter !== 'all') keys = keys.filter((k) => (history[k].label || '') === animeFilter);

        // Sort: group 0 by lastAccessed desc, group 1 (finished) by lastAccessed desc, group 2 (dropped) last
        keys.sort((a, b) => {
            const ga = labelGroup(history[a].label);
            const gb = labelGroup(history[b].label);
            if (ga !== gb) return ga - gb;
            const ta = history[a].lastAccessed || 0;
            const tb = history[b].lastAccessed || 0;
            return tb - ta;
        });

        const totalPages = Math.max(1, Math.ceil(keys.length / ANIME_PER_PAGE));
        if (animePage > totalPages) animePage = totalPages;
        updatePagination(animePage, totalPages);

        const paged = keys.slice((animePage - 1) * ANIME_PER_PAGE, animePage * ANIME_PER_PAGE);
        content.innerHTML = '';

        if (!paged.length) {
            content.innerHTML = '<div class="amt-empty">No anime history found.</div>';
            return;
        }

        let prevGroup = -1;

        paged.forEach((slug) => {
            const data = history[slug];
            const grp  = labelGroup(data.label);

            // Section divider between active and finished/dropped groups
            if (animeFilter === 'all' && grp !== prevGroup && grp > 0) {
                const divider = document.createElement('div');
                divider.className   = 'amt-section-divider';
                divider.textContent = grp === 1 ? 'Finished' : 'Dropped';
                content.appendChild(divider);
            }
            prevGroup = grp;

            const row = document.createElement('div');
            row.className = 'amt-row';

            const cb = makeCheckbox(selectedSlugs.has(slug), (checked) => {
                if (checked) selectedSlugs.add(slug); else selectedSlugs.delete(slug);
                updateDeleteBtn();
            });

            const body = document.createElement('div');
            body.className = 'amt-item-body';

            // Title row
            const titleRow = document.createElement('div');
            titleRow.className = 'amt-item-title-row';

            const titleEl = document.createElement('span');
            titleEl.className   = 'amt-item-title';
            titleEl.textContent = data.title;
            titleRow.appendChild(titleEl);

            const pill = makeLabelPill(data.label);
            if (pill) titleRow.appendChild(pill);

            if (isEditMode) {
                const sel = makeLabelSelect(data.label, async (newLabel) => {
                    const h = await Storage.getAnimeHistory();
                    if (!h[slug]) return;
                    if (newLabel) h[slug].label = newLabel;
                    else delete h[slug].label;
                    await Storage.setAnimeHistory(h);
                    renderAnime();
                });
                titleRow.appendChild(sel);
            }

            body.appendChild(titleRow);

            // Title-level note
            const titleNote = makeTitleNoteWidget(data.note, async (val) => {
                const h = await Storage.getAnimeHistory();
                if (!h[slug]) return;
                if (val) h[slug].note = val;
                else delete h[slug].note;
                await Storage.setAnimeHistory(h);
            });
            body.appendChild(titleNote);

            // Episode badges
            const badges = document.createElement('div');
            badges.className = 'amt-badge-list';

            Object.keys(data.episodes)
                .sort((a, b) => parseFloat(a) - parseFloat(b))
                .forEach((ep) => {
                    const epData = data.episodes[ep];
                    const badge  = document.createElement('div');
                    badge.className = 'amt-ep-badge';

                    // Episode label: link if URL is available, plain span otherwise
                    if (epData.url) {
                        const link = document.createElement('a');
                        link.href        = epData.url;
                        link.textContent = `Ep ${ep}`;
                        badge.appendChild(link);
                    } else {
                        const label = document.createElement('span');
                        label.textContent = `Ep ${ep}`;
                        badge.appendChild(label);
                    }

                    // Progress
                    if (epData.duration > 0) {
                        const prog = document.createElement('span');
                        prog.className   = 'amt-ep-progress';
                        prog.textContent = `${formatTime(epData.currentTime)} / ${formatTime(epData.duration)}`;
                        badge.appendChild(prog);
                    }

                    // Episode-level note
                    const epNote = (data.episodeNotes || {})[ep];
                    const epNoteToggle = makeInlineNoteToggle(epNote, async (val) => {
                        const h = await Storage.getAnimeHistory();
                        if (!h[slug]) return;
                        if (!h[slug].episodeNotes) h[slug].episodeNotes = {};
                        if (val) h[slug].episodeNotes[ep] = val;
                        else {
                            delete h[slug].episodeNotes[ep];
                            if (!Object.keys(h[slug].episodeNotes).length) delete h[slug].episodeNotes;
                        }
                        await Storage.setAnimeHistory(h);
                    });
                    badge.appendChild(epNoteToggle);

                    // Per-episode delete
                    const del = makeDelX(`Remove Episode ${ep}`, async () => {
                        const h = await Storage.getAnimeHistory();
                        if (h[slug]?.episodes[ep]) {
                            delete h[slug].episodes[ep];
                            if (h[slug].episodeNotes) {
                                delete h[slug].episodeNotes[ep];
                                if (!Object.keys(h[slug].episodeNotes).length) delete h[slug].episodeNotes;
                            }
                            if (!Object.keys(h[slug].episodes).length) delete h[slug];
                            await Storage.setAnimeHistory(h);
                            renderAnime();
                        }
                    });
                    badge.appendChild(del);
                    badges.appendChild(badge);
                });

            body.appendChild(badges);
            row.appendChild(cb); row.appendChild(body);
            content.appendChild(row);
        });
    }

    // ─────────────────────────────────────────────
    // MANGA TAB
    // ─────────────────────────────────────────────
    async function renderManga() {
        const content = document.getElementById('amt-content');
        if (!content) return;

        let history     = await Storage.getMangaHistory();
        const mangaMeta = await Storage.getMangaMeta();

        if (mangaSearch) {
            history = history.filter((item) =>
                (item.mangaTitle || '').toLowerCase().includes(mangaSearch) ||
                (item.chapterStr || '').toLowerCase().includes(mangaSearch)
            );
        }

        // Group by manga title
        const groups = {};
        history.forEach((item) => {
            const key = item.mangaTitle || 'Unknown';
            if (!groups[key]) groups[key] = { mangaTitle: key, latestTime: 0, items: [] };
            groups[key].items.push(item);
            if (item.timestamp > groups[key].latestTime) groups[key].latestTime = item.timestamp;
        });

        let sortedGroups = Object.values(groups);

        // Filter by label
        if (mangaFilter !== 'all') {
            sortedGroups = sortedGroups.filter((g) =>
                (mangaMeta[g.mangaTitle]?.label || '') === mangaFilter
            );
        }

        // Sort: active groups by latest time desc, finished by latest time desc, dropped last
        sortedGroups.sort((a, b) => {
            const ga = labelGroup(mangaMeta[a.mangaTitle]?.label);
            const gb = labelGroup(mangaMeta[b.mangaTitle]?.label);
            if (ga !== gb) return ga - gb;
            return b.latestTime - a.latestTime;
        });

        const totalPages = Math.max(1, Math.ceil(sortedGroups.length / MANGA_PER_PAGE));
        if (mangaPage > totalPages) mangaPage = totalPages;
        updatePagination(mangaPage, totalPages);

        const paged = sortedGroups.slice((mangaPage - 1) * MANGA_PER_PAGE, mangaPage * MANGA_PER_PAGE);
        content.innerHTML = '';

        if (!paged.length) {
            content.innerHTML = '<div class="amt-empty">No manga history found.</div>';
            return;
        }

        let prevGroup = -1;

        paged.forEach((group) => {
            const titleMeta = mangaMeta[group.mangaTitle] || {};
            const grp       = labelGroup(titleMeta.label);
            const allIds    = group.items.map((i) => i.chapterId);
            const allSelected = allIds.length > 0 && allIds.every((id) => selectedChapterIds.has(id));

            // Section divider
            if (mangaFilter === 'all' && grp !== prevGroup && grp > 0) {
                const divider = document.createElement('div');
                divider.className   = 'amt-section-divider';
                divider.textContent = grp === 1 ? 'Finished' : 'Dropped';
                content.appendChild(divider);
            }
            prevGroup = grp;

            const row = document.createElement('div');
            row.className = 'amt-row';

            const cb = makeCheckbox(allSelected, (checked) => {
                allIds.forEach((id) => {
                    if (checked) selectedChapterIds.add(id); else selectedChapterIds.delete(id);
                });
                updateDeleteBtn(); renderManga();
            });

            const body = document.createElement('div');
            body.className = 'amt-item-body';

            // Title row
            const titleRow = document.createElement('div');
            titleRow.className = 'amt-item-title-row';

            const titleEl = document.createElement('span');
            titleEl.className   = 'amt-item-title';
            titleEl.textContent = group.mangaTitle;
            titleRow.appendChild(titleEl);

            const pill = makeLabelPill(titleMeta.label);
            if (pill) titleRow.appendChild(pill);

            if (isEditMode) {
                const sel = makeLabelSelect(titleMeta.label, async (newLabel) => {
                    const m = await Storage.getMangaMeta();
                    if (!m[group.mangaTitle]) m[group.mangaTitle] = {};
                    if (newLabel) m[group.mangaTitle].label = newLabel;
                    else delete m[group.mangaTitle].label;
                    if (!Object.keys(m[group.mangaTitle]).length) delete m[group.mangaTitle];
                    await Storage.setMangaMeta(m);
                    renderManga();
                });
                titleRow.appendChild(sel);
            }

            body.appendChild(titleRow);

            // Title-level note
            const titleNote = makeTitleNoteWidget(titleMeta.note, async (val) => {
                const m = await Storage.getMangaMeta();
                if (!m[group.mangaTitle]) m[group.mangaTitle] = {};
                if (val) m[group.mangaTitle].note = val;
                else delete m[group.mangaTitle].note;
                if (!Object.keys(m[group.mangaTitle]).length) delete m[group.mangaTitle];
                await Storage.setMangaMeta(m);
            });
            body.appendChild(titleNote);

            // Chapter badges
            const badges = document.createElement('div');
            badges.className = 'amt-badge-list';

            group.items.sort((a, b) => b.timestamp - a.timestamp).forEach((item) => {
                const badge = document.createElement('div');
                badge.className = 'amt-ch-badge';
                if (selectedChapterIds.has(item.chapterId)) badge.style.borderColor = '#ff4a4a';

                const link = document.createElement('a');
                link.href        = item.url;
                link.textContent = item.chapterStr || `Chapter ${item.chapterId.slice(0, 8)}`;
                link.title       = escapeHtml(item.chapterStr);

                const timeEl = document.createElement('div');
                timeEl.className   = 'amt-ch-time';
                timeEl.textContent = formatDate(item.timestamp);

                // Chapter-level note
                const chapterNote = (titleMeta.chapterNotes || {})[item.chapterId];
                const chNoteToggle = makeInlineNoteToggle(chapterNote, async (val) => {
                    const m = await Storage.getMangaMeta();
                    if (!m[group.mangaTitle]) m[group.mangaTitle] = {};
                    if (!m[group.mangaTitle].chapterNotes) m[group.mangaTitle].chapterNotes = {};
                    if (val) m[group.mangaTitle].chapterNotes[item.chapterId] = val;
                    else {
                        delete m[group.mangaTitle].chapterNotes[item.chapterId];
                        if (!Object.keys(m[group.mangaTitle].chapterNotes).length)
                            delete m[group.mangaTitle].chapterNotes;
                    }
                    if (!Object.keys(m[group.mangaTitle]).length) delete m[group.mangaTitle];
                    await Storage.setMangaMeta(m);
                });

                // Per-chapter delete
                const del = makeDelX('Remove this chapter', async () => {
                    let h = await Storage.getMangaHistory();
                    h = h.filter((i) => i.chapterId !== item.chapterId);
                    await Storage.setMangaHistory(h);
                    selectedChapterIds.delete(item.chapterId);
                    updateDeleteBtn(); renderManga();
                });

                badge.appendChild(link);
                badge.appendChild(timeEl);
                badge.appendChild(chNoteToggle);
                badge.appendChild(del);
                badges.appendChild(badge);
            });

            body.appendChild(badges);
            row.appendChild(cb); row.appendChild(body);
            content.appendChild(row);
        });
    }

    // ─────────────────────────────────────────────
    // CUSTOM SITES TAB
    // Manages tweaks_customAnimeSites / tweaks_customMangaSites
    // in chrome.storage.local. Shape of each entry:
    //   Anime: { hostname, pattern (regex string), formatSlug? (fn body string) }
    //   Manga: { hostname, parsePath? (fn body string) }
    // ─────────────────────────────────────────────

    // ── Presets ─────────────────────────────────────────────────
    // Each preset auto-fills the fields when selected.
    // Users can still edit any field after applying a preset.
    const ANIME_PRESETS = {
        '': null,
        'Oploverz-style  (e.g. oploverz.*)': {
            hostname:   'oploverz',
            pattern:    '/^\\/series\\/([^/]+)\\/episode\\/(\\d+)/',
            formatSlug: '',
        },
        'Samehadaku-style  (slug-episode-N)': {
            hostname:   '',
            pattern:    '/^\\/([^/]+?)-episode-(\\d+)/',
            formatSlug: '',
        },
        'Anoboy-style  (slug-episode-N)': {
            hostname:   'anoboy',
            pattern:    '/^\\/([^/]+?)-episode-(\\d+)/',
            formatSlug: '',
        },
        'Generic  /watch/slug/ep/N': {
            hostname:   '',
            pattern:    '/^\\/watch\\/([^/]+)\\/ep\\/(\\d+)/',
            formatSlug: '',
        },
    };

    const MANGA_PRESETS = {
        '': null,
        'Komiku / Komikindo-style  (slug-chapter-N)': {
            hostname:   '',
            parsePath:  '',   // empty = use the built-in parseChapterUrl
        },
		'MangaDex-style  (/chapter/uuid, title from page)': {
			hostname:  '',
			parsePath: "const m=pathname.match(/\\/chapter\\/([a-f0-9-]+)/i); if(!m) return null; const clean=document.title.replace(/\\s*-\\s*MangaDex$/i,''); const parts=clean.split(' - '); const mangaTitle=parts.length>1?parts.slice(1).join(' - ').trim():'Unknown Title'; const chStr=parts[0].replace(/^\\d+\\s*\\|\\s*/,'').trim(); const cn=chStr.replace(/^(ch\\.?|chapter\\s*)/i,'').trim()||m[1].slice(0,8); return {titleSlug:m[1],chapterNum:cn,mangaTitle};",
		},
        'Generic  /read/slug/N': {
            hostname:   '',
            parsePath:  "const m=pathname.match(/^\\/read\\/([^/]+)\\/(\\d+)/); return m?{titleSlug:m[1],chapterNum:m[2],mangaTitle:m[1].replace(/-/g,' ')}:null;",
        },
        'Generic  /manga/slug/chapter/N': {
            hostname:   '',
            parsePath:  "const m=pathname.match(/^\\/manga\\/([^/]+)\\/chapter\\/(\\d+)/); return m?{titleSlug:m[1],chapterNum:m[2],mangaTitle:m[1].replace(/-/g,' ')}:null;",
        },
    };

    async function renderSites() {
        const content = document.getElementById('amt-content');
        if (!content) return;

        const r = await chrome.storage.local.get(['tweaks_customAnimeSites', 'tweaks_customMangaSites']);
        const animeSites = r.tweaks_customAnimeSites || [];
        const mangaSites = r.tweaks_customMangaSites || [];

        content.innerHTML = '';

        // ── GitHub Sites Sync bar ───────────────────────────────
        const ghBar = document.createElement('div');
        ghBar.className = 'amt-gh-sync-bar';
        ghBar.style.cssText += 'margin:14px 0 0 0;';
        ghBar.innerHTML = `
            <span class="amt-gh-sync-label">☁ GitHub Sync</span>
            <button class="amt-gh-sync-btn amt-gh-push-btn" id="amt-gh-sites-push">⬆ Push Sites</button>
            <button class="amt-gh-sync-btn amt-gh-pull-btn" id="amt-gh-sites-pull">⬇ Import from Cloud</button>
            <button class="amt-sites-iobtn" id="amt-sites-export">📤 Export File</button>
            <button class="amt-sites-iobtn" id="amt-sites-import">📥 Import File</button>
            <input type="file" id="amt-sites-import-input" accept=".json" style="display:none">
            <span class="amt-gh-status" id="amt-gh-sites-status"></span>
        `;
        content.appendChild(ghBar);

        // Wire GitHub buttons
        const ghSitesStatus = document.getElementById('amt-gh-sites-status');
        document.getElementById('amt-gh-sites-push').addEventListener('click', async (e) => {
            e.target.disabled = true;
            await ghPushSites(ghSitesStatus);
            e.target.disabled = false;
        });
        document.getElementById('amt-gh-sites-pull').addEventListener('click', async (e) => {
            e.target.disabled = true;
            await ghPullSites(ghSitesStatus);
            e.target.disabled = false;
        });

        // File Export
        document.getElementById('amt-sites-export').addEventListener('click', async () => {
            const rs = await chrome.storage.local.get(['tweaks_customAnimeSites', 'tweaks_customMangaSites']);
            const payload = { animeSites: rs.tweaks_customAnimeSites || [], mangaSites: rs.tweaks_customMangaSites || [] };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a_el = document.createElement('a');
            a_el.href = url; a_el.download = `animanga-sites-${new Date().toISOString().slice(0,10)}.json`;
            a_el.click(); URL.revokeObjectURL(url);
        });

        // File Import
        document.getElementById('amt-sites-import').addEventListener('click', () => {
            document.getElementById('amt-sites-import-input').click();
        });
        document.getElementById('amt-sites-import-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    if (Array.isArray(parsed.animeSites)) await chrome.storage.local.set({ tweaks_customAnimeSites: parsed.animeSites });
                    if (Array.isArray(parsed.mangaSites)) await chrome.storage.local.set({ tweaks_customMangaSites: parsed.mangaSites });
                    ghSitesStatus.className = 'amt-gh-status ok';
                    ghSitesStatus.textContent = 'Imported ✓ — reload to see changes';
                    setTimeout(() => renderSites(), 1200);
                } catch (err) {
                    ghSitesStatus.className = 'amt-gh-status err';
                    ghSitesStatus.textContent = 'Import failed: ' + err.message;
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });

        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:20px;';

        // ── Section builder ─────────────────────────────────────
        function makeSection(label, color, sites, mediaType, fieldDefs, presets) {
            const sec = document.createElement('div');

            const hdr = document.createElement('div');
            hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
            hdr.innerHTML = `<span style="font-size:0.8rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.06em;">${label}</span>`;

            const addBtn = document.createElement('button');
            addBtn.textContent = '+ Add Site';
            addBtn.style.cssText = 'background:#1a2a1a;color:#4ade80;border:1px solid #2a4a2a;border-radius:5px;padding:3px 10px;font-size:0.75rem;font-weight:700;cursor:pointer;';
            addBtn.addEventListener('mouseover', () => { addBtn.style.background = '#243a24'; });
            addBtn.addEventListener('mouseout',  () => { addBtn.style.background = '#1a2a1a'; });
            addBtn.addEventListener('click', () => appendEntryCard(list, {}, fieldDefs, presets));
            hdr.appendChild(addBtn);
            sec.appendChild(hdr);

            const list = document.createElement('div');
            list.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

            if (sites.length === 0) {
                list.appendChild(makePlaceholder());
            } else {
                sites.forEach((site) => appendEntryCard(list, site, fieldDefs, presets));
            }
            sec.appendChild(list);

            // Save button
            const saveRow = document.createElement('div');
            saveRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:8px;';
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save ' + label;
            saveBtn.style.cssText = 'background:#3ea6ff;color:#000;border:none;border-radius:5px;padding:5px 16px;font-size:0.8rem;font-weight:700;cursor:pointer;';
            saveBtn.addEventListener('mouseover', () => { saveBtn.style.background = '#61b8ff'; });
            saveBtn.addEventListener('mouseout',  () => { saveBtn.style.background = '#3ea6ff'; });
            saveBtn.addEventListener('click', async () => {
                const collected = collectEntries(list, fieldDefs);
                const key = mediaType === 'anime' ? 'tweaks_customAnimeSites' : 'tweaks_customMangaSites';
                await chrome.storage.local.set({ [key]: collected });
                saveBtn.textContent = 'Saved ✓';
                saveBtn.style.background = '#4ade80';
                setTimeout(() => { saveBtn.textContent = 'Save ' + label; saveBtn.style.background = '#3ea6ff'; }, 1800);
            });
            saveRow.appendChild(saveBtn);
            sec.appendChild(saveRow);
            return sec;
        }

        function makePlaceholder() {
            const p = document.createElement('p');
            p.className = 'amt-sites-empty';
            p.style.cssText = 'color:#444;font-size:0.8rem;text-align:center;padding:10px 0;';
            p.textContent = 'No custom sites yet. Click "+ Add Site" to add one.';
            return p;
        }

        // ── Entry card ──────────────────────────────────────────
        function appendEntryCard(list, data, fieldDefs, presets) {
            const empty = list.querySelector('.amt-sites-empty');
            if (empty) empty.remove();

            const card = document.createElement('div');
            card.style.cssText = 'background:#141414;border:1px solid #2a2a2a;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;';

            // ── Preset row ───────────────────────────────────────
            const presetRow = document.createElement('div');
            presetRow.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

            const presetLbl = document.createElement('label');
            presetLbl.style.cssText = 'font-size:0.7rem;color:#666;';
            presetLbl.textContent = 'Preset (optional — auto-fills fields below)';

            const presetSel = document.createElement('select');
            presetSel.style.cssText = 'background:#0f0f0f;border:1px solid #2e2e2e;border-radius:4px;padding:5px 8px;color:#e8e8e8;font-size:0.8rem;outline:none;cursor:pointer;';
            Object.keys(presets).forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name === '' ? '— select a preset —' : name;
                presetSel.appendChild(opt);
            });

            presetRow.appendChild(presetLbl);
            presetRow.appendChild(presetSel);
            card.appendChild(presetRow);

            // ── Divider ──────────────────────────────────────────
            const divider = document.createElement('div');
            divider.style.cssText = 'border-top:1px solid #222;margin:2px 0;';
            card.appendChild(divider);

            // ── Fields ───────────────────────────────────────────
            const inputMap = {};  // key → input element, for preset filling

            fieldDefs.forEach((fd) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

                const lbl = document.createElement('label');
                lbl.style.cssText = 'font-size:0.7rem;color:#666;';
                lbl.textContent = fd.label + (fd.required ? ' *' : '');

                const inp = document.createElement('input');
                inp.type          = 'text';
                inp.dataset.key   = fd.key;
                inp.value         = data[fd.key] || '';
                inp.placeholder   = fd.placeholder || '';
                inp.style.cssText = 'background:#0f0f0f;border:1px solid #2e2e2e;border-radius:4px;padding:5px 8px;color:#e8e8e8;font-size:0.8rem;outline:none;width:100%;box-sizing:border-box;';
                inp.addEventListener('focus', () => { inp.style.borderColor = '#3ea6ff'; });
                inp.addEventListener('blur',  () => { inp.style.borderColor = '#2e2e2e'; });

                inputMap[fd.key] = inp;
                row.appendChild(lbl);
                row.appendChild(inp);
                card.appendChild(row);
            });

            // ── Preset wiring ─────────────────────────────────────
            // Try to detect which preset is currently active (so the dropdown reflects saved data)
            const currentHostname = data.hostname || '';
            for (const [name, vals] of Object.entries(presets)) {
                if (!vals) continue;
                if (vals.hostname !== undefined && vals.hostname === currentHostname) {
                    presetSel.value = name;
                    break;
                }
            }

            presetSel.addEventListener('change', () => {
                const preset = presets[presetSel.value];
                if (!preset) return;
                // Fill each field — but only if the field is currently empty OR the previous
                // preset's value is still there (so manual edits are never silently overwritten
                // unless the user explicitly picks a new preset)
                Object.entries(preset).forEach(([key, val]) => {
                    const inp = inputMap[key];
                    if (inp) inp.value = val;
                });
                // Flash the fields briefly to signal the fill happened
                Object.values(inputMap).forEach((inp) => {
                    inp.style.borderColor = '#4ade80';
                    setTimeout(() => { inp.style.borderColor = '#2e2e2e'; }, 600);
                });
            });

            // ── Remove button ─────────────────────────────────────
            const delBtn = document.createElement('button');
            delBtn.textContent = '✕ Remove';
            delBtn.style.cssText = 'background:none;border:1px solid #3a1a1a;border-radius:4px;color:#884444;padding:3px 10px;font-size:0.75rem;cursor:pointer;align-self:flex-end;margin-top:2px;';
            delBtn.addEventListener('mouseover', () => { delBtn.style.color = '#ff4a4a'; delBtn.style.borderColor = '#5a2a2a'; });
            delBtn.addEventListener('mouseout',  () => { delBtn.style.color = '#884444'; delBtn.style.borderColor = '#3a1a1a'; });
            delBtn.addEventListener('click', () => {
                card.remove();
                if (!list.querySelector('.custom-site-card')) list.appendChild(makePlaceholder());
            });
            card.classList.add('custom-site-card');
            card.appendChild(delBtn);
            list.appendChild(card);
        }

        // ── Collect entries from DOM ─────────────────────────────
        function collectEntries(list, fieldDefs) {
            const results = [];
            list.querySelectorAll('.custom-site-card').forEach((card) => {
                const entry = {};
                fieldDefs.forEach((fd) => {
                    const inp = card.querySelector(`[data-key="${fd.key}"]`);
                    if (inp) {
                        const val = inp.value.trim();
                        // Fall back to placeholder if field was left blank
                        entry[fd.key] = val !== '' ? val : (inp.placeholder || '');
                    }
                });
				entry.titleFromPage = ['yes','y','true','1'].includes((entry.titleFromPage || '').toString().toLowerCase());
                if (entry.hostname) results.push(entry);
            });
            return results;
        }

        // ── Field definitions ───────────────────────────────────
        const animeFields = [
            { key: 'hostname',   label: 'Hostname (substring match)',     required: true,  placeholder: 'e.g. mysite.com' },
            { key: 'pattern',    label: 'Episode URL regex',              required: true,  placeholder: '/^\\/([^/]+?)-episode-(\\d+)/' },
            { key: 'formatSlug', label: 'Format slug — fn body (advanced, optional)', required: false, placeholder: "return slug.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');" },
        ];
        const mangaFields = [
			{ key: 'hostname',     label: 'Hostname (substring match)',                    required: true,  placeholder: 'e.g. nhentai.net' },
			{ key: 'urlPattern',   label: 'URL regex — 2 groups: (1) id/slug (2) number', required: false, placeholder: '(g|n)\\/(\\d+)\\/(\\d+)' },
			{ key: 'titleFromPage',label: 'Title from page title? (type: yes)',            required: false, placeholder: '' },
			{ key: 'titlePattern', label: 'Title regex (optional, group 1 = title)',       required: false, placeholder: '^(.+?)\\s*-\\s*Page' },
			{ key: 'slugPrefix',   label: 'Slug prefix (optional, e.g. nhentai-)',         required: false, placeholder: '' },
		];

        wrap.appendChild(makeSection('Anime Sites', '#3ea6ff', animeSites, 'anime', animeFields, ANIME_PRESETS));

        const sep = document.createElement('div');
        sep.style.cssText = 'border-top:1px solid #1e1e1e;';
        wrap.appendChild(sep);

        wrap.appendChild(makeSection('Manga Sites', '#ff6740', mangaSites, 'manga', mangaFields, MANGA_PRESETS));

        const hint = document.createElement('p');
        hint.style.cssText = 'font-size:0.7rem;color:#444;line-height:1.6;border-top:1px solid #1e1e1e;padding-top:10px;';
        hint.innerHTML =
            '<strong style="color:#555">Anime pattern:</strong> regex string — 2 capture groups: (1) slug, (2) episode number.<br>' +
            '<strong style="color:#555">Manga parsePath:</strong> fn body receiving <code style="color:#666">(pathname)</code>, return <code style="color:#666">{ titleSlug, chapterNum, mangaTitle }</code> or null. Leave blank to use the standard <em>slug-chapter-N</em> parser.<br>' +
            'Changes take effect after refreshing the target site.';
        wrap.appendChild(hint);

        content.appendChild(wrap);
    }

    // ─────────────────────────────────────────────
    // JSON EDITOR TAB
    // ─────────────────────────────────────────────
    async function renderJsonEditor() {
        const content = document.getElementById('amt-content');
        if (!content) return;

        const animeRaw = await Storage.getAnimeHistory();
        const mangaRaw = await Storage.getMangaHistory();
        const metaRaw  = await Storage.getMangaMeta();

        content.innerHTML = '';
        const wrapper = document.createElement('div');

        // ── GitHub Cloud Sync bar ───────────────────────────────
        const ghBar = document.createElement('div');
        ghBar.className = 'amt-gh-sync-bar';
        ghBar.innerHTML = `
            <span class="amt-gh-sync-label">☁ GitHub Sync</span>
            <button class="amt-gh-sync-btn amt-gh-push-btn" id="amt-gh-push">⬆ Push to Cloud</button>
            <button class="amt-gh-sync-btn amt-gh-pull-btn" id="amt-gh-pull">⬇ Import from Cloud</button>
            <span class="amt-gh-status" id="amt-gh-status"></span>
        `;
        content.appendChild(ghBar);

        wrapper.innerHTML = `
            <p class="amt-json-note">
                <strong>Direct JSON Editor</strong><br>
                Edit raw storage data below and click <strong>Save</strong> to apply.<br>
                Invalid JSON will be rejected. Only edit if you know what you are doing.<br><br>
                <strong>Incognito:</strong> Data persists across incognito sessions only if
                <code>Allow in Incognito</code> is enabled in <code>chrome://extensions</code>.
            </p>

            <div class="amt-json-section">
                <div class="amt-json-label">
                    Anime History / anime_history key
                    <span id="amt-anime-count"></span>
                </div>
                <textarea class="amt-json-textarea" id="amt-anime-json" spellcheck="false"></textarea>
            </div>

            <div class="amt-json-section">
                <div class="amt-json-label">
                    Manga History / md_history_data key
                    <span id="amt-manga-count"></span>
                </div>
                <textarea class="amt-json-textarea" id="amt-manga-json" spellcheck="false"></textarea>
            </div>

            <div class="amt-json-section">
                <div class="amt-json-label">
                    Manga Meta (labels + notes) / manga_meta key
                    <span id="amt-meta-count"></span>
                </div>
                <textarea class="amt-json-textarea" id="amt-meta-json" spellcheck="false"></textarea>
            </div>

            <div class="amt-json-actions">
                <button class="amt-json-save-btn" id="amt-json-save">&#x1F4BE; Save</button>
                <button class="amt-json-reset-btn" id="amt-json-reload">&#x21BA; Reload</button>
                <span class="amt-json-status" id="amt-json-status"></span>
                <button class="amt-json-import-btn" id="amt-json-import">&#x1F4E5; Import</button>
                <input type="file" id="amt-json-import-input" accept=".json" style="display:none">
                <button class="amt-json-export-btn" id="amt-json-export">&#x1F4E4; Export</button>
            </div>
        `;
        content.appendChild(wrapper);

        // ── GitHub button handlers ──────────────────────────────
        const ghStatus = document.getElementById('amt-gh-status');
        document.getElementById('amt-gh-push').addEventListener('click', async (e) => {
            e.target.disabled = true;
            await ghPushHistory(ghStatus);
            e.target.disabled = false;
        });
        document.getElementById('amt-gh-pull').addEventListener('click', async (e) => {
            e.target.disabled = true;
            await ghPullHistory(ghStatus);
            e.target.disabled = false;
            // Refresh textareas after pull
            const a  = await Storage.getAnimeHistory();
            const m  = await Storage.getMangaHistory();
            const me = await Storage.getMangaMeta();
            populate(a, m, me);
        });

        const animeTA = document.getElementById('amt-anime-json');
        const mangaTA = document.getElementById('amt-manga-json');
        const metaTA  = document.getElementById('amt-meta-json');

        function populate(aData, mData, metaData) {
            animeTA.value = JSON.stringify(aData, null, 2);
            mangaTA.value = JSON.stringify(mData, null, 2);
            metaTA.value  = JSON.stringify(metaData, null, 2);
            document.getElementById('amt-anime-count').textContent = `${Object.keys(aData).length} series`;
            document.getElementById('amt-manga-count').textContent = `${mData.length} chapters`;
            document.getElementById('amt-meta-count').textContent  = `${Object.keys(metaData).length} titles`;
        }
        populate(animeRaw, mangaRaw, metaRaw);

        [animeTA, mangaTA, metaTA].forEach((ta) =>
            ta.addEventListener('input', () => ta.classList.remove('error'))
        );

        document.getElementById('amt-json-save').addEventListener('click', async () => {
            const status = document.getElementById('amt-json-status');
            status.className = 'amt-json-status'; status.textContent = '';

            let parsedAnime, parsedManga, parsedMeta, hasError = false;

            try {
                parsedAnime = JSON.parse(animeTA.value);
                if (typeof parsedAnime !== 'object' || Array.isArray(parsedAnime))
                    throw new Error('Must be a JSON object {}');
            } catch (e) {
                animeTA.classList.add('error');
                status.className = 'amt-json-status err';
                status.textContent = `Anime: ${e.message}`;
                hasError = true;
            }

            if (!hasError) {
                try {
                    parsedManga = JSON.parse(mangaTA.value);
                    if (!Array.isArray(parsedManga)) throw new Error('Must be a JSON array []');
                } catch (e) {
                    mangaTA.classList.add('error');
                    status.className = 'amt-json-status err';
                    status.textContent = `Manga: ${e.message}`;
                    hasError = true;
                }
            }

            if (!hasError) {
                try {
                    parsedMeta = JSON.parse(metaTA.value);
                    if (typeof parsedMeta !== 'object' || Array.isArray(parsedMeta))
                        throw new Error('Must be a JSON object {}');
                } catch (e) {
                    metaTA.classList.add('error');
                    status.className = 'amt-json-status err';
                    status.textContent = `Meta: ${e.message}`;
                    hasError = true;
                }
            }

            if (!hasError) {
                await Storage.setAnimeHistory(parsedAnime);
                await Storage.setMangaHistory(parsedManga);
                await Storage.setMangaMeta(parsedMeta);
                status.className = 'amt-json-status ok';
                status.textContent = 'Saved!';
                setTimeout(() => { status.className = 'amt-json-status'; status.textContent = ''; }, 2500);
                document.getElementById('amt-anime-count').textContent = `${Object.keys(parsedAnime).length} series`;
                document.getElementById('amt-manga-count').textContent = `${parsedManga.length} chapters`;
                document.getElementById('amt-meta-count').textContent  = `${Object.keys(parsedMeta).length} titles`;
            }
        });

        document.getElementById('amt-json-reload').addEventListener('click', async () => {
            const a  = await Storage.getAnimeHistory();
            const m  = await Storage.getMangaHistory();
            const me = await Storage.getMangaMeta();
            populate(a, m, me);
            [animeTA, mangaTA, metaTA].forEach((ta) => ta.classList.remove('error'));
            const status = document.getElementById('amt-json-status');
            status.className = 'amt-json-status ok';
            status.textContent = 'Reloaded';
            setTimeout(() => { status.className = 'amt-json-status'; status.textContent = ''; }, 1500);
        });

        // ── Export ──────────────────────────────────────────────
        document.getElementById('amt-json-export').addEventListener('click', async () => {
            const a  = await Storage.getAnimeHistory();
            const m  = await Storage.getMangaHistory();
            const me = await Storage.getMangaMeta();
            const payload = { anime_history: a, md_history_data: m, manga_meta: me };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const ts   = new Date().toISOString().slice(0, 10);
            const a_el = document.createElement('a');
            a_el.href     = url;
            a_el.download = `animanga-history-backup-${ts}.json`;
            a_el.click();
            URL.revokeObjectURL(url);
        });

        // ── Import ──────────────────────────────────────────────
        document.getElementById('amt-json-import').addEventListener('click', () => {
            document.getElementById('amt-json-import-input').click();
        });

        document.getElementById('amt-json-import-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const status = document.getElementById('amt-json-status');
                try {
                    const parsed = JSON.parse(ev.target.result);
                    const importedAnime = parsed.anime_history;
                    const importedManga = parsed.md_history_data;
                    const importedMeta  = parsed.manga_meta;

                    if (typeof importedAnime !== 'object' || Array.isArray(importedAnime))
                        throw new Error('anime_history must be a {} object');
                    if (!Array.isArray(importedManga))
                        throw new Error('md_history_data must be a [] array');
                    if (typeof importedMeta !== 'object' || Array.isArray(importedMeta))
                        throw new Error('manga_meta must be a {} object');

                    populate(importedAnime, importedManga, importedMeta);
                    [animeTA, mangaTA, metaTA].forEach((ta) => ta.classList.remove('error'));
                    status.className = 'amt-json-status ok';
                    status.textContent = 'Imported, click Save';
                    setTimeout(() => { status.className = 'amt-json-status'; status.textContent = ''; }, 4000);
                } catch (err) {
                    status.className = 'amt-json-status err';
                    status.textContent = `Import failed: ${err.message}`;
                    setTimeout(() => { status.className = 'amt-json-status'; status.textContent = ''; }, 4000);
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });
    }

    // ─────────────────────────────────────────────
    // DOM HELPERS
    // ─────────────────────────────────────────────
    function makeCheckbox(checked, onChange) {
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'amt-item-checkbox'; cb.checked = checked;
        cb.addEventListener('change', () => onChange(cb.checked));
        return cb;
    }

    function makeDelX(title, onClick) {
        const btn = document.createElement('button');
        btn.className   = 'amt-del-x';
        btn.textContent = '\u00d7'; // ×
        btn.title       = title;
        btn.addEventListener('click', onClick);
        return btn;
    }

    // ─────────────────────────────────────────────
    // OPEN / CLOSE
    // ─────────────────────────────────────────────
    function openModal() {
        if (!document.getElementById('amt-modal')) buildModal();

        isOpen = true;
        const modal = document.getElementById('amt-modal');
        modal.style.display = 'flex';
        modal.dataset.tab   = activeTab;
        modal.querySelectorAll('.amt-tab').forEach((t) =>
            t.classList.toggle('active', t.dataset.tab === activeTab)
        );

        const currentFilter = activeTab === 'anime' ? animeFilter : mangaFilter;
        syncFilterButtons(currentFilter);

        const searchEl = document.getElementById('amt-search');
        if (searchEl) {
            searchEl.value = activeTab === 'manga' ? mangaSearch : animeSearch;
            if (activeTab !== 'json') searchEl.focus();
        }

        document.getElementById('amt-backdrop').style.display = 'block';
        renderContent();
    }

    function closeModal() {
        isOpen = false;
        const modal = document.getElementById('amt-modal');
        if (modal) modal.style.display = 'none';
        const bd = document.getElementById('amt-backdrop');
        if (bd) bd.style.display = 'none';
        if (isEditMode) resetEditMode();
        if (addPanelOpen) closeAddPanel();
    }

    function toggleModal() { isOpen ? closeModal() : openModal(); }

    // ─────────────────────────────────────────────
    // Alt+H SHORTCUT
    // ─────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'h') { e.preventDefault(); toggleModal(); }
    });

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────
    window.__AMT = {
        toggleModal, openModal, closeModal,
        notifyHistoryUpdate() { if (isOpen) renderContent(); },
        setDefaultTab(tab) { activeTab = tab; },
    };
})();