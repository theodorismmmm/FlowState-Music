// app.js — Main application logic

import { initAuth, login, logout, getToken } from './auth.js';
import { MusicPlayer, LoopMode } from './player.js';

const MANIFEST_URL = '/music/manifest.json';

// ─── State ──────────────────────────────────────────────────────────────────

let player;
let library = [];
let filteredLibrary = [];
let currentUser = null;
let dragSrcIndex = null;

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function show(el) {
  if (typeof el === 'string') el = $(el);
  if (el) el.classList.remove('hidden');
}

function hide(el) {
  if (typeof el === 'string') el = $(el);
  if (el) el.classList.add('hidden');
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createCoverFallback(title) {
  const colors = ['#7c3aed', '#2563eb', '#db2777', '#0891b2', '#059669'];
  const color = colors[(title || '').charCodeAt(0) % colors.length];
  const letter = (title || '?')[0].toUpperCase();
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="200" height="200" fill="${color}" rx="8"/>
      <text x="100" y="125" font-size="80" text-anchor="middle" fill="white" font-family="system-ui">${letter}</text>
    </svg>
  `)}`;
}

// ─── Initialization ──────────────────────────────────────────────────────────

async function init() {
  // Check auth
  currentUser = await initAuth();

  if (!currentUser) {
    showLoginScreen();
    return;
  }

  showPlayerScreen(currentUser);
  await loadLibrary();
}

// ─── Auth UI ─────────────────────────────────────────────────────────────────

function showLoginScreen() {
  show('#login-screen');
  hide('#player-screen');
  $('#login-form')?.addEventListener('submit', handleLogin, { once: true });
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const errorEl = $('#login-error');
  const btn = $('#login-btn');

  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const result = await login(email, password);

  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (!result.success) {
    errorEl.textContent = result.error;
    // Re-attach listener since we used { once: true }
    $('#login-form').addEventListener('submit', handleLogin, { once: true });
    return;
  }

  currentUser = result.user;
  hide('#login-screen');
  showPlayerScreen(currentUser);
  await loadLibrary();
}

function showPlayerScreen(user) {
  show('#player-screen');
  hide('#login-screen');

  // Display user info
  const displayName = user.username || user.email || 'User';
  const userNameEl = $('#user-name');
  if (userNameEl) userNameEl.textContent = displayName;

  const userEmailEl = $('#user-email');
  if (userEmailEl) userEmailEl.textContent = user.email || '';

  // Logout button
  $('#logout-btn')?.addEventListener('click', () => {
    logout();
  });

  // Initialize player
  initPlayer();
  setupSidebar();
  setupKeyboardShortcuts();
}

// ─── Library ─────────────────────────────────────────────────────────────────

async function loadLibrary() {
  showLibrarySkeleton();
  try {
    const resp = await fetch(MANIFEST_URL);
    if (!resp.ok) throw new Error('Manifest not found');
    library = await resp.json();
  } catch {
    library = [];
  }
  filteredLibrary = [...library];
  renderLibrary();
}

function showLibrarySkeleton() {
  const list = $('#library-list');
  if (!list) return;
  list.innerHTML = Array(5).fill(0).map(() => `
    <li class="track-item skeleton">
      <div class="skeleton-cover"></div>
      <div class="skeleton-info">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </li>
  `).join('');
}

function renderLibrary() {
  const list = $('#library-list');
  if (!list) return;

  if (filteredLibrary.length === 0) {
    list.innerHTML = `<li class="empty-state"><span>No tracks found</span></li>`;
    return;
  }

  list.innerHTML = filteredLibrary.map((track, i) => `
    <li class="track-item" data-index="${i}" data-id="${track.id}" tabindex="0" role="listitem" aria-label="${track.title} by ${track.artist}">
      <img class="track-cover" src="${track.cover || createCoverFallback(track.title)}"
           alt="${track.title} cover"
           onerror="this.src='${createCoverFallback(track.title)}'">
      <div class="track-info">
        <span class="track-title">${track.title}</span>
        <span class="track-artist">${track.artist}</span>
      </div>
      <button class="track-menu-btn" data-index="${i}" aria-label="Track options" title="Options">⋮</button>
    </li>
  `).join('');

  // Click to play
  list.querySelectorAll('.track-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('track-menu-btn')) return;
      const idx = parseInt(item.dataset.index, 10);
      const track = filteredLibrary[idx];
      player.playTrack(track);
      renderQueue();
      highlightActiveTrack();
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });

  // 3-dot menu
  list.querySelectorAll('.track-menu-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showContextMenu(e, parseInt(btn.dataset.index, 10));
    });
  });

  // Right-click context menu
  list.querySelectorAll('.track-item').forEach((item) => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, parseInt(item.dataset.index, 10));
    });
  });

  highlightActiveTrack();
}

function highlightActiveTrack() {
  const current = player?.getCurrentTrack();
  $$('.track-item').forEach(item => {
    item.classList.toggle('active', current && item.dataset.id === current.id);
  });
  $$('.queue-item').forEach(item => {
    item.classList.toggle('active', current && parseInt(item.dataset.index, 10) === player?.currentIndex);
  });
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

let contextMenuEl = null;

function showContextMenu(e, trackIndex) {
  removeContextMenu();

  const track = filteredLibrary[trackIndex];
  if (!track) return;

  contextMenuEl = document.createElement('ul');
  contextMenuEl.className = 'context-menu';
  contextMenuEl.innerHTML = `
    <li data-action="play">▶ Play</li>
    <li data-action="queue">+ Add to Queue</li>
    <li data-action="next">⏭ Play Next</li>
  `;
  document.body.appendChild(contextMenuEl);

  // Position
  const x = Math.min(e.clientX, window.innerWidth - 160);
  const y = Math.min(e.clientY, window.innerHeight - 120);
  contextMenuEl.style.left = `${x}px`;
  contextMenuEl.style.top = `${y}px`;

  contextMenuEl.addEventListener('click', (ev) => {
    const action = ev.target.dataset.action;
    if (action === 'play') {
      player.playTrack(track);
      renderQueue();
      highlightActiveTrack();
    } else if (action === 'queue') {
      player.addToQueue(track);
      renderQueue();
    } else if (action === 'next') {
      player.playNext(track);
      renderQueue();
    }
    removeContextMenu();
  });

  setTimeout(() => {
    document.addEventListener('click', removeContextMenu, { once: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') removeContextMenu();
    }, { once: true });
  }, 0);
}

function removeContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

// ─── Queue Panel ──────────────────────────────────────────────────────────────

function renderQueue() {
  const list = $('#queue-list');
  if (!list) return;

  if (player.queue.length === 0) {
    list.innerHTML = `<li class="empty-state"><span>Queue is empty</span></li>`;
    return;
  }

  list.innerHTML = player.queue.map((track, i) => `
    <li class="queue-item ${i === player.currentIndex ? 'active' : ''}"
        data-index="${i}" draggable="true" aria-label="${track.title}">
      <span class="queue-drag-handle" aria-hidden="true">⠿</span>
      <img class="queue-cover" src="${track.cover || createCoverFallback(track.title)}"
           alt="" onerror="this.src='${createCoverFallback(track.title)}'">
      <div class="queue-info">
        <span class="queue-title">${track.title}</span>
        <span class="queue-artist">${track.artist}</span>
      </div>
      <button class="queue-remove-btn" data-index="${i}" aria-label="Remove from queue" title="Remove">✕</button>
    </li>
  `).join('');

  // Click to play
  list.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('queue-remove-btn')) return;
      if (e.target.classList.contains('queue-drag-handle')) return;
      player.playTrackAt(parseInt(item.dataset.index, 10));
      renderQueue();
      highlightActiveTrack();
    });
  });

  // Remove buttons
  list.querySelectorAll('.queue-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      player.removeFromQueue(parseInt(btn.dataset.index, 10));
      renderQueue();
      highlightActiveTrack();
    });
  });

  // Drag-and-drop
  list.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcIndex = parseInt(item.dataset.index, 10);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const toIndex = parseInt(item.dataset.index, 10);
      if (dragSrcIndex !== null && dragSrcIndex !== toIndex) {
        player.reorderQueue(dragSrcIndex, toIndex);
        renderQueue();
        highlightActiveTrack();
      }
      dragSrcIndex = null;
    });
  });
}

// ─── Player UI ────────────────────────────────────────────────────────────────

function initPlayer() {
  player = new MusicPlayer();

  player.on('trackChanged', (track) => {
    updateNowPlaying(track || player.getCurrentTrack());
    renderQueue();
    highlightActiveTrack();
    updatePlayPauseBtn(true);
  });

  player.on('play', () => updatePlayPauseBtn(true));
  player.on('pause', () => updatePlayPauseBtn(false));

  player.on('timeupdate', () => {
    updateSeekBar();
    updateMiniPlayer();
  });

  player.on('metadataLoaded', () => {
    updateSeekBar();
  });

  player.on('volumechange', () => {
    updateVolumeUI();
  });

  player.on('queueChanged', () => {
    renderQueue();
    highlightActiveTrack();
  });

  player.on('loopChanged', () => {
    updateLoopBtn();
  });

  player.on('shuffleChanged', () => {
    updateShuffleBtn();
  });

  player.on('queueEnded', () => {
    updatePlayPauseBtn(false);
    updateNowPlaying(null);
  });

  // Controls
  $('#play-pause-btn')?.addEventListener('click', () => {
    player.togglePlay();
  });

  $('#next-btn')?.addEventListener('click', () => {
    player.next();
  });

  $('#prev-btn')?.addEventListener('click', () => {
    player.previous();
  });

  $('#shuffle-btn')?.addEventListener('click', () => {
    player.toggleShuffle();
  });

  $('#loop-btn')?.addEventListener('click', () => {
    player.cycleLoopMode();
  });

  // Seek bar
  const seekBar = $('#seek-bar');
  if (seekBar) {
    seekBar.addEventListener('input', () => {
      player.seek(parseFloat(seekBar.value));
    });
  }

  // Volume
  const volumeSlider = $('#volume-slider');
  if (volumeSlider) {
    volumeSlider.value = player.getVolume() * 100;
    volumeSlider.addEventListener('input', () => {
      player.setVolume(volumeSlider.value / 100);
    });
  }

  $('#mute-btn')?.addEventListener('click', () => {
    player.toggleMute();
    updateVolumeUI();
  });

  // Mini player controls
  $('#mini-play-pause')?.addEventListener('click', () => player.togglePlay());
  $('#mini-next')?.addEventListener('click', () => player.next());

  // Clear queue
  $('#clear-queue-btn')?.addEventListener('click', () => {
    player.clearQueue();
    renderQueue();
    updateNowPlaying(null);
  });

  updateVolumeUI();
  updateLoopBtn();
  updateShuffleBtn();
}

function updateNowPlaying(track) {
  if (!track) {
    $('#now-playing-title').textContent = 'No track playing';
    $('#now-playing-artist').textContent = '—';
    $('#now-playing-album').textContent = '';
    $('#now-playing-cover').src = createCoverFallback('?');
    $('#now-playing-cover').classList.remove('playing');
    document.title = 'FlowState Music';
    return;
  }

  $('#now-playing-title').textContent = track.title || 'Unknown Title';
  $('#now-playing-artist').textContent = track.artist || 'Unknown Artist';
  $('#now-playing-album').textContent = track.album || '';
  const coverEl = $('#now-playing-cover');
  coverEl.src = track.cover || createCoverFallback(track.title);
  coverEl.onerror = () => { coverEl.src = createCoverFallback(track.title); };
  coverEl.classList.add('playing');

  // Mini player
  const miniCover = $('#mini-cover');
  if (miniCover) {
    miniCover.src = track.cover || createCoverFallback(track.title);
    miniCover.onerror = () => { miniCover.src = createCoverFallback(track.title); };
  }
  const miniTitle = $('#mini-title');
  if (miniTitle) miniTitle.textContent = track.title || '';
  const miniArtist = $('#mini-artist');
  if (miniArtist) miniArtist.textContent = track.artist || '';

  document.title = `${track.title} — FlowState Music`;
}

function updatePlayPauseBtn(isPlaying) {
  const btn = $('#play-pause-btn');
  if (btn) btn.innerHTML = isPlaying ? '⏸' : '▶';
  const mini = $('#mini-play-pause');
  if (mini) mini.innerHTML = isPlaying ? '⏸' : '▶';

  const cover = $('#now-playing-cover');
  if (cover) cover.classList.toggle('playing', isPlaying);
}

function updateSeekBar() {
  const seekBar = $('#seek-bar');
  const currentTimeEl = $('#current-time');
  const durationEl = $('#duration');

  const currentTime = player.getCurrentTime();
  const duration = player.getDuration();

  if (seekBar && !isNaN(duration) && duration > 0) {
    seekBar.max = duration;
    seekBar.value = currentTime;
  }
  if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
  if (durationEl) durationEl.textContent = formatTime(duration);
}

function updateMiniPlayer() {
  const miniSeek = $('#mini-seek');
  if (!miniSeek) return;
  const duration = player.getDuration();
  if (!isNaN(duration) && duration > 0) {
    miniSeek.style.width = `${(player.getCurrentTime() / duration) * 100}%`;
  }
}

function updateVolumeUI() {
  const volumeSlider = $('#volume-slider');
  const muteBtn = $('#mute-btn');
  if (volumeSlider) volumeSlider.value = player.isMuted() ? 0 : player.getVolume() * 100;
  if (muteBtn) {
    muteBtn.innerHTML = player.isMuted() || player.getVolume() === 0 ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', player.isMuted() ? 'Unmute' : 'Mute');
  }
}

function updateLoopBtn() {
  const btn = $('#loop-btn');
  if (!btn) return;
  const icons = { [LoopMode.NONE]: '🔁', [LoopMode.ALL]: '🔁', [LoopMode.ONE]: '🔂' };
  btn.innerHTML = icons[player.loopMode];
  btn.classList.toggle('active', player.loopMode !== LoopMode.NONE);
  btn.title = `Loop: ${player.loopMode}`;
  btn.setAttribute('aria-label', `Loop mode: ${player.loopMode}`);
}

function updateShuffleBtn() {
  const btn = $('#shuffle-btn');
  if (!btn) return;
  btn.classList.toggle('active', player.shuffleEnabled);
  btn.setAttribute('aria-label', player.shuffleEnabled ? 'Shuffle on' : 'Shuffle off');
}

// ─── Sidebar Navigation ───────────────────────────────────────────────────────

function setupSidebar() {
  const navBtns = $$('.nav-btn');
  const panels = $$('.panel');

  function switchPanel(panelId) {
    panels.forEach(p => p.classList.remove('active'));
    navBtns.forEach(b => b.classList.remove('active'));
    const target = $(`#${panelId}`);
    if (target) target.classList.add('active');
    const navBtn = $(`.nav-btn[data-panel="${panelId}"]`);
    if (navBtn) navBtn.classList.add('active');
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchPanel(btn.dataset.panel);
      // Close sidebar on mobile
      if (window.innerWidth < 768) {
        $('#sidebar')?.classList.remove('open');
      }
    });
  });

  // Default panel
  switchPanel('library-panel');

  // Mobile sidebar toggle
  $('#sidebar-toggle')?.addEventListener('click', () => {
    $('#sidebar')?.classList.toggle('open');
  });

  // Close sidebar on overlay click (mobile)
  $('#sidebar-overlay')?.addEventListener('click', () => {
    $('#sidebar')?.classList.remove('open');
  });

  // Search
  const searchInput = $('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      filteredLibrary = library.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.artist?.toLowerCase().includes(q) ||
        t.album?.toLowerCase().includes(q)
      );
      renderLibrary();
    });
  }

  // Upload
  setupUpload();

  // YouTube import
  setupYouTube();
}

// ─── File Upload ──────────────────────────────────────────────────────────────

function setupUpload() {
  const uploadInput = $('#upload-input');
  const uploadBtn = $('#upload-btn');
  const uploadProgress = $('#upload-progress');
  const uploadStatus = $('#upload-status');

  uploadBtn?.addEventListener('click', () => uploadInput?.click());

  const dropZone = $('#upload-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => isAudioFile(f));
      files.forEach(f => handleUploadedFile(f));
    });
    dropZone.addEventListener('click', () => uploadInput?.click());
  }

  uploadInput?.addEventListener('change', () => {
    const files = Array.from(uploadInput.files).filter(isAudioFile);
    files.forEach(f => handleUploadedFile(f));
    uploadInput.value = ''; // Reset for re-use
  });

  function isAudioFile(file) {
    return /\.(mp3|flac|ogg|wav|m4a)$/i.test(file.name) ||
           file.type.startsWith('audio/');
  }

  function handleUploadedFile(file) {
    if (uploadStatus) {
      uploadStatus.textContent = `Loading: ${file.name}`;
      uploadStatus.classList.add('visible');
    }
    if (uploadProgress) uploadProgress.classList.add('visible');

    const url = URL.createObjectURL(file);
    const title = file.name.replace(/\.[^.]+$/, '');

    // Simulate loading progress
    let progress = 0;
    const progressBar = $('#upload-progress-bar');
    const interval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 20, 90);
      if (progressBar) progressBar.style.width = `${progress}%`;
    }, 100);

    const tempAudio = new Audio(url);
    tempAudio.addEventListener('loadedmetadata', () => {
      clearInterval(interval);
      if (progressBar) progressBar.style.width = '100%';

      const track = {
        id: `upload-${Date.now()}-${Math.random()}`,
        title,
        artist: 'Uploaded',
        album: 'My Uploads',
        file: url,
        cover: null,
        duration: tempAudio.duration,
      };

      library.push(track);
      filteredLibrary = [...library];
      player.addToQueue(track);
      renderLibrary();
      renderQueue();

      if (uploadStatus) uploadStatus.textContent = `Added: ${title}`;

      setTimeout(() => {
        if (uploadProgress) uploadProgress.classList.remove('visible');
        if (uploadStatus) uploadStatus.classList.remove('visible');
        if (progressBar) progressBar.style.width = '0%';
      }, 2000);
    });

    tempAudio.addEventListener('error', () => {
      clearInterval(interval);
      if (uploadStatus) uploadStatus.textContent = `Error loading: ${file.name}`;
      if (progressBar) progressBar.style.width = '0%';
      setTimeout(() => {
        if (uploadProgress) uploadProgress.classList.remove('visible');
        if (uploadStatus) uploadStatus.classList.remove('visible');
      }, 2000);
    });
  }
}

// ─── YouTube Import ───────────────────────────────────────────────────────────

function setupYouTube() {
  const ytForm = $('#yt-form');
  const ytInput = $('#yt-url-input');
  const ytBtn = $('#yt-open-btn');

  ytBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const url = ytInput?.value.trim();
    if (!url) return;

    // Build yt1s URL
    let converterUrl = 'https://yt1s.com/';
    try {
      const encoded = encodeURIComponent(url);
      converterUrl = `https://yt1s.com/en/youtube-to-mp3?q=${encoded}`;
    } catch {
      converterUrl = 'https://yt1s.com/';
    }

    window.open(converterUrl, '_blank', 'noopener,noreferrer');
  });

  ytForm?.addEventListener('submit', (e) => e.preventDefault());
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't capture when typing in input fields
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        player?.togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        player?.seekRelative(-10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        player?.seekRelative(10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        player?.setVolume(player.getVolume() + 0.1);
        updateVolumeUI();
        break;
      case 'ArrowDown':
        e.preventDefault();
        player?.setVolume(player.getVolume() - 0.1);
        updateVolumeUI();
        break;
    }
  });
}

// ─── Auth logout event ────────────────────────────────────────────────────────

window.addEventListener('auth:logout', () => {
  player?.clearQueue();
  hide('#player-screen');
  show('#login-screen');
  currentUser = null;
  // Re-attach login handler
  const form = $('#login-form');
  if (form) {
    const clone = form.cloneNode(true);
    form.parentNode.replaceChild(clone, form);
    clone.addEventListener('submit', handleLogin, { once: true });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
