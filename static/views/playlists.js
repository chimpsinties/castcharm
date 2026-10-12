"use strict";

// ============================================================
// Playlists view
// ============================================================

async function renderPlaylists() {
  const el = document.getElementById("content");
  el.innerHTML = `
    <div class="page">
      <div class="view-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:var(--text-1)">Playlists</h1>
        <button class="btn btn-primary btn-sm" id="btn-new-playlist">+ New Playlist</button>
      </div>
      <div id="playlist-list" class="playlist-grid"></div>
    </div>`;

  document.getElementById("btn-new-playlist").addEventListener("click", _showCreateDialog);
  await _loadPlaylists();
}

async function _loadPlaylists() {
  const container = document.getElementById("playlist-list");
  if (!container) return;
  try {
    const playlists = await API.getPlaylists();
    if (!playlists.length) {
      container.innerHTML = `<p class="empty-msg" style="color:var(--text-3);font-size:14px;margin-top:8px">No playlists yet. Create one to get started.</p>`;
      return;
    }
    container.innerHTML = playlists.map(_playlistCard).join("");
    container.querySelectorAll("[data-action='play-playlist']").forEach((btn) => {
      btn.addEventListener("click", () => _playPlaylist(Number(btn.dataset.id)));
    });
    container.querySelectorAll("[data-action='delete-playlist']").forEach((btn) => {
      btn.addEventListener("click", () => _deletePlaylist(Number(btn.dataset.id), btn.dataset.name));
    });
    container.querySelectorAll("[data-action='edit-filters']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pl = playlists.find((p) => p.id === Number(btn.dataset.id));
        if (pl) await _showEditDialog(pl, _loadPlaylists);
      });
    });
  } catch (e) {
    container.innerHTML = `<p style="color:var(--error)">${escHTML(e.message)}</p>`;
  }
}

function _playlistCard(pl) {
  const count = pl.episode_count;
  const typeLabel = _playlistTypeLabel(pl);
  const countLabel = `${count} episode${count !== 1 ? "s" : ""}`;
  const smartCriteria = pl.type === "smart" ? _smartCriteriaHTML(pl.smart_config, { compact: true }) : "";
  const smartFilterButton = pl.type === "smart"
    ? `<button class="btn btn-ghost btn-sm" data-action="edit-filters" data-id="${pl.id}">Filters</button>`
    : "";
  return `
    <div class="playlist-card">
      <div class="playlist-card-icon">
        ${_playlistIconSvg(pl, 22)}
      </div>
      <div class="playlist-card-info">
        <div class="playlist-card-name" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>${escHTML(pl.name)}</span>
          ${_playlistBadgeHTML(pl)}
        </div>
        ${pl.description ? `<div class="playlist-card-desc">${escHTML(pl.description)}</div>` : ""}
        <div class="playlist-card-meta">${typeLabel} · ${countLabel}</div>
        ${smartCriteria}
      </div>
      <div class="playlist-card-actions">
        <button class="btn btn-primary btn-sm" data-action="play-playlist" data-id="${pl.id}" title="Play">
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Play
        </button>
        ${smartFilterButton}
        <a class="btn btn-ghost btn-sm" href="#/playlists/${pl.id}">View</a>
        <button class="btn btn-ghost btn-sm" style="color:var(--error)" data-action="delete-playlist"
                data-id="${pl.id}" data-name="${escHTML(pl.name)}">Delete</button>
      </div>
    </div>`;
}

function _playlistTypeLabel(pl) {
  if (pl.type === "feed") return `Feed · ${pl.filter === "unplayed" ? "Unplayed only" : "All episodes"}`;
  if (pl.type === "smart") return "Smart list";
  return "Custom playlist";
}

function _playlistIconSvg(pl, size = 22) {
  if (pl.type === "smart") {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="${size}" height="${size}">
      <path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>
      <path d="M6 5l5 7v5l2 1v-6l5-7"/>
      ${pl.smart_key === "new_releases" ? `<path d="M18 3v4"/><path d="M16 5h4"/>` : ""}
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="${size}" height="${size}">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="3.5" cy="6" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="3.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="3.5" cy="18" r="1.5" fill="currentColor" stroke="none"/>
  </svg>`;
}

function _playlistBadgeHTML(pl) {
  if (pl.type !== "smart") return "";
  const label = "Smart";
  return `<span title="Smart list" style="display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:999px;padding:2px 7px;font-size:11px;font-weight:700;color:var(--text-2);background:var(--surface-2)">
    ${_playlistIconSvg(pl, 13)} ${label}
  </span>`;
}

function _smartSummary(config) {
  const cfg = config || {};
  const sort = cfg.sort === "asc" ? "oldest first" : "newest first";
  const days = cfg.release_days == null ? "any date" : `last ${cfg.release_days} days`;
  const dl = cfg.download_status === "any" ? "any download state" : cfg.download_status || "downloaded";
  const ep = cfg.episode_status === "all" || !cfg.episode_status ? "all episodes" : cfg.episode_status.replace("_", " ");
  return `${days}, ${sort}, ${ep}, ${dl}`;
}

function _smartCriteria(config) {
  const cfg = config || {};
  const feedCount = Array.isArray(cfg.feed_ids) ? cfg.feed_ids.length : 0;
  return [
    ["Podcasts", feedCount ? `${feedCount} selected` : "All podcasts"],
    ["Release date", cfg.release_days == null ? "Any date" : `Last ${cfg.release_days} days`],
    ["Order", cfg.sort === "asc" ? "Oldest first" : "Newest first"],
    ["Episode status", cfg.episode_status === "all" || !cfg.episode_status ? "All" : cfg.episode_status.replace("_", " ")],
    ["Download status", cfg.download_status === "any" || !cfg.download_status ? "Any" : cfg.download_status],
  ];
}

function _smartCriteriaHTML(config, opts = {}) {
  const compact = opts.compact === true;
  const chips = _smartCriteria(config).map(([label, value]) => `
    <span style="display:inline-flex;gap:4px;align-items:center;border:1px solid var(--border);border-radius:999px;padding:${compact ? "2px 7px" : "4px 9px"};font-size:${compact ? "11px" : "12px"};color:var(--text-2);background:var(--surface-1)">
      <span style="color:var(--text-3);font-weight:600">${escHTML(label)}:</span>
      <span>${escHTML(value)}</span>
    </span>`).join("");
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:${compact ? "8px" : "10px"}">${chips}</div>`;
}

async function _playPlaylist(id) {
  try {
    const playlists = await API.getPlaylists();
    const pl = playlists.find((p) => p.id === id);
    if (!pl) { Toast.error("Playlist not found"); return; }

    const contextType = pl.type === "feed" ? "feed" : "playlist";
    const contextId   = pl.type === "feed" ? pl.feed_id : id;

    if (!contextId) { Toast.info("This playlist has no feed associated with it"); return; }

    const state = await API.playerPlay({
      context_type: contextType,
      context_id: contextId,
      context_filter: pl.filter || "unplayed",
    });
    if (state?.current_episode) {
      window.playEpisode(state.current_episode.id, false, { contextSet: true });
      Toast.success(`Playing: ${escHTML(state.current_episode.title || "episode")}`);
    } else {
      Toast.info("No downloaded episodes to play in this playlist");
    }
  } catch (e) {
    Toast.error(e.message || "Could not start playback");
  }
}

// viewPlaylistDetail — full-page route handler for /playlists/:id
async function viewPlaylistDetail(playlistId) {
  const id = routeId(playlistId);
  if (id === null) {
    Router.navigate("/playlists");
    return;
  }
  const el = document.getElementById("content");
  el.innerHTML = `<div class="page pl-detail-page"><p style="color:var(--text-3);font-size:13px">Loading...</p></div>`;

  let pl, episodes;
  try {
    [pl, episodes] = await Promise.all([
      API.get(`/api/playlists/${id}`),
      API.getPlaylistEpisodes(id),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="page pl-detail-page"><p style="color:var(--error)">${escHTML(e.message)}</p></div>`;
    return;
  }

  // Set up _epState so updateEpisodeRow and playlist membership tracking work.
  // Deliberately a different shape from the feed-detail one (no feed, no
  // offset/batch) — both views mount an element with id="episode-list" and share
  // episodeRow(), so the model helpers in feed-detail.js tolerate either. Keep
  // them in step if you change one.
  window._epState = {
    feed: null,
    playlistId: id,
    playlistMembers: new Set(episodes.map((ep) => ep.id)),
    rowOpts: { draggable: pl.type === "custom", hideSeqNumber: true },
  };
  _epSetAll(episodes);

  const typeLabel = pl.type === "feed"
    ? `Feed playlist · ${pl.filter === "unplayed" ? "Unplayed only" : "All episodes"}`
    : pl.type === "smart" ? `Smart list · ${_smartSummary(pl.smart_config)}` : "Custom playlist";
  const countLabel = `${episodes.length} episode${episodes.length !== 1 ? "s" : ""}`;

  const listIconSvg = _playlistIconSvg(pl, 36);
  const playSvg = `<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const smartCriteriaPanel = pl.type === "smart" ? `
    <div style="margin:14px 0 6px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="font-size:13px;font-weight:700;color:var(--text-1)">${_playlistBadgeHTML(pl)} Filter criteria</div>
        <button class="btn btn-ghost btn-sm" id="pl-edit-filters-btn">Edit filters</button>
      </div>
      ${_smartCriteriaHTML(pl.smart_config)}
    </div>` : "";

  el.innerHTML = `
    <div class="page pl-detail-page">
      <a class="back-btn" href="#/playlists">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Playlists
      </a>
      <div class="pl-detail-header">
        <div class="pl-detail-art">${listIconSvg}</div>
        <div class="pl-detail-info">
          <div class="pl-detail-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${escHTML(pl.name)} ${_playlistBadgeHTML(pl)}</div>
          ${pl.description ? `<div class="pl-detail-desc">${escHTML(pl.description)}</div>` : ""}
          <div class="pl-detail-meta-line" id="pl-count-line">${typeLabel} · ${countLabel}</div>
          ${smartCriteriaPanel}
          <div class="pl-detail-actions">
            <button class="btn btn-primary btn-sm" id="pl-play-btn">${playSvg} Play</button>
            <button class="btn btn-ghost btn-sm" id="pl-edit-btn">Edit</button>
          </div>
        </div>
      </div>
      <div class="episode-list" id="episode-list"></div>
    </div>`;

  // Rows come from the model; only those near the viewport are ever built.
  _epRender();

  // All shown episodes are in this playlist — initialize their "+" buttons as primary
  _applyPlaylistMemberStates(window._epState.playlistMembers);

  document.getElementById("pl-play-btn").addEventListener("click", () => _playPlaylist(pl.id));
  document.getElementById("pl-edit-btn").addEventListener("click", () => {
    _showEditDialog(pl, () => Router.navigate(`/playlists/${pl.id}`));
  });
  document.getElementById("pl-edit-filters-btn")?.addEventListener("click", () => {
    _showEditDialog(pl, () => Router.navigate(`/playlists/${pl.id}`));
  });

  // Drag-to-reorder (custom playlists only)
  if (pl.type === "custom") {
    const list = document.getElementById("episode-list");
    // A key, not a node. The dragged row can be discarded and rebuilt while the
    // user scrolls toward the drop point, so holding the element would leave us
    // pointing at something detached from the page.
    let dragKey = null;
    const _epIdOf = (row) => (row ? Number(row.id.replace("ep-", "")) : null);
    const _clearMarkers = () => list.querySelectorAll(".drag-over-top, .drag-over-bottom")
      .forEach((r) => r.classList.remove("drag-over-top", "drag-over-bottom"));

    list.addEventListener("dragstart", (e) => {
      const row = e.target.closest(".episode-item");
      if (!row) return;
      dragKey = _epIdOf(row);
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
      window._epState?.vlist?.pin(dragKey);
    });

    list.addEventListener("dragend", () => {
      if (dragKey != null) {
        window._epState?.vlist?.unpin(dragKey);
        window._epState?.vlist?.node(dragKey)?.classList.remove("dragging");
      }
      _clearMarkers();
      _stopEdgeScroll();
      dragKey = null;
    });

    // Without this, dragging to a position outside the current window is
    // impossible — the list no longer scrolls itself when the pointer reaches
    // the edge, because the rows beyond it do not exist to drag onto.
    let _edgeTimer = null;
    function _stopEdgeScroll() {
      if (_edgeTimer) { cancelAnimationFrame(_edgeTimer); _edgeTimer = null; }
    }
    function _edgeScroll(clientY) {
      const scroller = document.getElementById("content");
      if (!scroller) return;
      const { top, bottom } = scroller.getBoundingClientRect();
      const zone = 60;
      let dy = 0;
      if (clientY < top + zone) dy = -Math.ceil((top + zone - clientY) / 4);
      else if (clientY > bottom - zone) dy = Math.ceil((clientY - (bottom - zone)) / 4);
      _stopEdgeScroll();
      if (!dy) return;
      const step = () => { scroller.scrollTop += dy; _edgeTimer = requestAnimationFrame(step); };
      _edgeTimer = requestAnimationFrame(step);
    }

    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const target = e.target.closest(".episode-item");
      _clearMarkers();
      if (target && _epIdOf(target) !== dragKey) {
        const { top, height } = target.getBoundingClientRect();
        target.classList.add(e.clientY < top + height / 2 ? "drag-over-top" : "drag-over-bottom");
      }
      _edgeScroll(e.clientY);
    });

    list.addEventListener("drop", async (e) => {
      e.preventDefault();
      _stopEdgeScroll();
      const target = e.target.closest(".episode-item");
      const targetKey = _epIdOf(target);
      if (targetKey == null || dragKey == null || targetKey === dragKey) return;

      // Reorder the model by index rather than reading the resulting DOM. The
      // rendered rows are only a window onto the list, so deriving the order
      // from them would post a partial array — and the server assigns positions
      // only for the ids it receives, leaving everything off-screen at its old
      // position and colliding with the new ones. That scrambles the ordering
      // the user just arranged.
      const eps = window._epState.eps;
      const from = eps.findIndex((ep) => ep.id === dragKey);
      let to = eps.findIndex((ep) => ep.id === targetKey);
      if (from === -1 || to === -1) return;
      const { top, height } = target.getBoundingClientRect();
      if (e.clientY >= top + height / 2) to += 1;

      const next = eps.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, moved);

      // Belt and braces: a short array here can only be a bug, and sending one
      // corrupts data on the server. Fail loudly instead.
      if (next.length !== eps.length) {
        Toast.error("Order not saved — please reload");
        return;
      }

      _epSetAll(next);
      window._epState.rowOpts = { draggable: true, hideSeqNumber: true };
      _epRender();

      try {
        await API.reorderPlaylist(pl.id, next.map((ep) => ep.id));
      } catch (_) {
        Toast.error("Could not save order");
      }
    });
  }
}


async function _deletePlaylist(id, name) {
  if (!confirm(`Delete playlist "${name}"?`)) return;
  try {
    await API.deletePlaylist(id);
    Toast.success("Playlist deleted");
    await _loadPlaylists();
  } catch (e) { Toast.error(e.message); }
}

function _playlistFormHTML(pl = {}, feeds = []) {
  const name = pl.name || "";
  const desc = pl.description || "";
  const type = pl.type || "custom";
  const config = pl.smart_config || { feed_ids: [], release_days: 90, sort: "desc", episode_status: "all", download_status: "any" };
  const feedIds = new Set(config.feed_ids || []);
  return `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="form-group">
        <label class="form-label">Name</label>
        <input id="pl-name" class="form-control" placeholder="My Playlist" value="${escHTML(name)}"
               maxlength="500" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Description <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
        <textarea id="pl-desc" class="form-control" rows="3" placeholder="What's in this playlist?"
                  maxlength="5000" style="resize:vertical">${escHTML(desc)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="pl-type" class="form-control" ${pl.id ? "disabled" : ""}>
          <option value="custom" ${type === "custom" ? "selected" : ""}>Custom playlist</option>
          <option value="smart" ${type === "smart" ? "selected" : ""}>Smart list</option>
        </select>
      </div>
      <div id="pl-smart-fields" style="display:${type === "smart" ? "flex" : "none"};flex-direction:column;gap:16px">
        <div class="form-group">
          <label class="form-label">Podcasts</label>
          <select id="pl-smart-feeds" class="form-control" multiple size="${Math.min(Math.max(feeds.length, 3), 8)}">
            ${feeds.map((feed) => `<option value="${feed.id}" ${feedIds.has(feed.id) ? "selected" : ""}>${escHTML(feed.title || feed.url)}</option>`).join("")}
          </select>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px">Leave empty to include all podcasts.</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
          <div class="form-group">
            <label class="form-label">Release window</label>
            <input id="pl-smart-days" class="form-control" type="number" min="0" max="36500" value="${config.release_days ?? ""}" placeholder="Any date">
          </div>
          <div class="form-group">
            <label class="form-label">Sort</label>
            <select id="pl-smart-sort" class="form-control">
              <option value="desc" ${config.sort !== "asc" ? "selected" : ""}>Newest first</option>
              <option value="asc" ${config.sort === "asc" ? "selected" : ""}>Oldest first</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Episode status</label>
            <select id="pl-smart-episode-status" class="form-control">
              <option value="all" ${config.episode_status === "all" ? "selected" : ""}>All</option>
              <option value="unplayed" ${config.episode_status === "unplayed" ? "selected" : ""}>Unplayed</option>
              <option value="played" ${config.episode_status === "played" ? "selected" : ""}>Played</option>
              <option value="in_progress" ${config.episode_status === "in_progress" ? "selected" : ""}>In progress</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Download status</label>
            <select id="pl-smart-download-status" class="form-control">
              ${["downloaded", "any", "pending", "queued", "downloading", "failed", "skipped"].map((status) => `<option value="${status}" ${config.download_status === status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:20px">
      <button class="btn btn-ghost" id="pl-cancel">Cancel</button>
      <button class="btn btn-primary" id="pl-save">Save</button>
    </div>`;
}

function _smartConfigFromForm() {
  return {
    feed_ids: [...document.getElementById("pl-smart-feeds").selectedOptions].map((opt) => Number(opt.value)),
    release_days: document.getElementById("pl-smart-days").value === "" ? null : Number(document.getElementById("pl-smart-days").value),
    sort: document.getElementById("pl-smart-sort").value,
    episode_status: document.getElementById("pl-smart-episode-status").value,
    download_status: document.getElementById("pl-smart-download-status").value,
  };
}

async function _showCreateDialog(addEpisodeId = null) {
  const feeds = await API.getFeeds().catch(() => []);
  Modal.open("New Playlist", _playlistFormHTML({}, feeds));
  document.getElementById("pl-type").addEventListener("change", (e) => {
    document.getElementById("pl-smart-fields").style.display = e.target.value === "smart" ? "flex" : "none";
  });
  document.getElementById("pl-cancel").addEventListener("click", Modal.close);
  document.getElementById("pl-save").addEventListener("click", async () => {
    const name = document.getElementById("pl-name").value.trim();
    const desc = document.getElementById("pl-desc").value.trim();
    const type = document.getElementById("pl-type").value;
    if (!name) { document.getElementById("pl-name").focus(); return; }
    try {
      const body = { name, description: desc || null, type };
      if (type === "smart") body.smart_config = _smartConfigFromForm();
      const pl = await API.createPlaylist(body);
      if (addEpisodeId != null && type === "custom") await API.addToPlaylist(pl.id, addEpisodeId);
      Modal.close();
      Toast.success(addEpisodeId != null ? `Playlist created and episode added` : "Playlist created");
      await _loadPlaylists();
    } catch (e) { Toast.error(e.message); }
  });
  document.getElementById("pl-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("pl-save").click();
  });
}

async function _showEditDialog(pl, onSuccess) {
  const feeds = await API.getFeeds().catch(() => []);
  Modal.open("Edit Playlist", _playlistFormHTML(pl, feeds));
  document.getElementById("pl-cancel").addEventListener("click", Modal.close);
  document.getElementById("pl-save").addEventListener("click", async () => {
    const newName = document.getElementById("pl-name").value.trim();
    const newDesc = document.getElementById("pl-desc").value.trim();
    if (!newName) { document.getElementById("pl-name").focus(); return; }
    try {
      const body = { name: newName, description: newDesc || null };
      if (pl.type === "smart") body.smart_config = _smartConfigFromForm();
      await API.updatePlaylist(pl.id, body);
      Modal.close();
      Toast.success("Playlist updated");
      if (typeof onSuccess === "function") {
        onSuccess();
      } else {
        await _loadPlaylists();
      }
    } catch (e) { Toast.error(e.message); }
  });
}


// ── Playlist button color helper ───────────────────────────────────────────
function _updatePlaylistBtn(episodeId, inPlaylist) {
  const btn = document.querySelector(`[data-action="add-to-playlist"][data-ep-id="${episodeId}"]`);
  if (btn) {
    btn.classList.toggle("btn-primary", inPlaylist);
    btn.classList.toggle("btn-ghost", !inPlaylist);
  }
  const members = window._epState?.playlistMembers;
  if (members) {
    if (inPlaylist) members.add(episodeId);
    else members.delete(episodeId);
  }
  // On the playlist detail page, animate out a row that was removed from this playlist
  if (!inPlaylist && window._epState?.playlistId) {
    const row = document.getElementById(`ep-${episodeId}`);
    if (row) {
      row.style.transition = "opacity 0.3s, max-height 0.3s, padding 0.3s";
      row.style.overflow = "hidden";
      row.style.maxHeight = row.offsetHeight + "px";
      requestAnimationFrame(() => {
        row.style.opacity = "0";
        row.style.maxHeight = "0";
        row.style.padding = "0";
      });
      setTimeout(() => row.remove(), 310);
    }
  }
}

// ── Global: "Add to playlist" picker ──────────────────────────────────────
// Called from episode card "+" buttons throughout the app
window.showAddToPlaylist = async function (episodeId, episodeTitle) {
  const plIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="3.5" cy="6" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="3.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="3.5" cy="18" r="1.5" fill="currentColor" stroke="none"/>
  </svg>`;

  try {
    const [allPlaylists, memberPlaylists] = await Promise.all([
      API.getPlaylists(),
      API.getEpisodePlaylists(episodeId),
    ]);
    const customPlaylists = allPlaylists.filter((p) => p.type === "custom");
    const memberIds = new Set(memberPlaylists.map((p) => p.id));
    const inAny = memberIds.size > 0;

    // Update triggering button color
    _updatePlaylistBtn(episodeId, inAny);

    const remainingPlaylists = customPlaylists.filter((p) => !memberIds.has(p.id));

    const memberSection = memberPlaylists.length ? `
      <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Already in</div>
      <div class="pl-picker" style="margin-bottom:14px">
        ${memberPlaylists.map((p) => `
          <button class="btn btn-primary pl-remove-btn" data-pl-id="${p.id}" data-pl-name="${escHTML(p.name)}">
            ${plIconSvg}
            <span style="flex:1">${escHTML(p.name)}</span>
            <span style="font-size:11px;opacity:0.8">Remove</span>
          </button>`).join("")}
      </div>` : "";

    const addSection = remainingPlaylists.length ? `
      ${memberPlaylists.length ? `<div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Add to</div>` : ""}
      <div class="pl-picker">
        ${remainingPlaylists.map((p) => `
          <button class="btn btn-ghost pl-pick-btn" data-pl-id="${p.id}" data-pl-name="${escHTML(p.name)}">
            ${plIconSvg}
            <span style="flex:1">${escHTML(p.name)}</span>
            <span style="color:var(--text-3);font-size:11px">${p.episode_count} ep${p.episode_count !== 1 ? "s" : ""}</span>
          </button>`).join("")}
      </div>` : (!memberPlaylists.length ? `<div style="color:var(--text-3);font-size:13px;margin-bottom:12px">No custom playlists yet.</div>` : "");

    Modal.open("Add to Playlist", `
      <div style="margin-bottom:14px">
        <div style="font-size:13px;color:var(--text-2);margin-bottom:4px">Episode</div>
        <div style="font-size:14px;font-weight:600;color:var(--text-1)">${escHTML(episodeTitle || "Untitled")}</div>
      </div>
      ${memberSection}
      ${addSection}
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-ghost" id="pl-add-cancel">Cancel</button>
        <button class="btn btn-ghost" id="pl-add-new">+ New Playlist</button>
      </div>`);

    document.getElementById("pl-add-cancel").addEventListener("click", Modal.close);
    document.getElementById("pl-add-new").addEventListener("click", () => {
      Modal.close();
      _showCreateDialog(episodeId);
    });

    // Remove buttons (episode already in these playlists)
    document.querySelectorAll(".pl-remove-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const plId = Number(btn.dataset.plId);
        try {
          await API.removeFromPlaylist(plId, episodeId);
          memberIds.delete(plId);
          Modal.close();
          Toast.success(`Removed from "${btn.dataset.plName}"`);
          _updatePlaylistBtn(episodeId, memberIds.size > 0);
        } catch (e) { Toast.error(e.message); }
      });
    });

    // Add buttons (episode not yet in these playlists)
    document.querySelectorAll(".pl-pick-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const plId = Number(btn.dataset.plId);
        try {
          await API.addToPlaylist(plId, episodeId);
          memberIds.add(plId);
          Modal.close();
          Toast.success(`Added to "${btn.dataset.plName}"`);
          _updatePlaylistBtn(episodeId, true);
        } catch (e) { Toast.error(e.message); }
      });
    });
  } catch (e) { Toast.error(e.message); }
};
