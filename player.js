// player.js — Audio engine, queue, loop, and shuffle logic

const VOLUME_KEY = 'flowstate_volume';
const MUTE_KEY = 'flowstate_muted';

const LoopMode = {
  NONE: 'none',
  ALL: 'all',
  ONE: 'one',
};

class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.queue = [];
    this.currentIndex = -1;
    this.loopMode = LoopMode.NONE;
    this.shuffleEnabled = false;
    this._shuffleOrder = [];
    this._shufflePos = -1;

    // Restore volume from localStorage
    const savedVolume = localStorage.getItem(VOLUME_KEY);
    this.audio.volume = savedVolume !== null ? parseFloat(savedVolume) : 0.8;
    const savedMute = localStorage.getItem(MUTE_KEY);
    this.audio.muted = savedMute === 'true';

    this._bindAudioEvents();
  }

  // ─── Event binding ────────────────────────────────────────────────────────

  _bindAudioEvents() {
    this.audio.addEventListener('ended', () => this._onEnded());
    this.audio.addEventListener('timeupdate', () => this._emit('timeupdate'));
    this.audio.addEventListener('loadedmetadata', () => this._emit('metadataLoaded'));
    this.audio.addEventListener('play', () => this._emit('play'));
    this.audio.addEventListener('pause', () => this._emit('pause'));
    this.audio.addEventListener('volumechange', () => {
      localStorage.setItem(VOLUME_KEY, this.audio.volume);
      localStorage.setItem(MUTE_KEY, this.audio.muted);
      this._emit('volumechange');
    });
    this.audio.addEventListener('error', () => this._emit('error'));
    this.audio.addEventListener('canplay', () => this._emit('canplay'));
    this.audio.addEventListener('waiting', () => this._emit('waiting'));
  }

  _listeners = {};

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  _emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => cb(data));
  }

  // ─── Queue management ──────────────────────────────────────────────────────

  setQueue(tracks, startIndex = 0) {
    this.queue = [...tracks];
    this.currentIndex = startIndex;
    this._buildShuffleOrder();
    this._playCurrentTrack();
  }

  addToQueue(track) {
    this.queue.push(track);
    this._buildShuffleOrder();
    this._emit('queueChanged');
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      // If removed current, play next (or stop)
      if (this.queue.length === 0) {
        this.currentIndex = -1;
        this.audio.pause();
        this.audio.src = '';
      } else {
        this.currentIndex = Math.min(this.currentIndex, this.queue.length - 1);
        this._playCurrentTrack();
      }
    }
    this._buildShuffleOrder();
    this._emit('queueChanged');
  }

  clearQueue() {
    this.queue = [];
    this.currentIndex = -1;
    this._shuffleOrder = [];
    this._shufflePos = -1;
    this.audio.pause();
    this.audio.src = '';
    this._emit('queueChanged');
    this._emit('trackChanged');
  }

  playNext(track) {
    if (this.currentIndex < 0) {
      this.queue.unshift(track);
      this.currentIndex = 0;
    } else {
      this.queue.splice(this.currentIndex + 1, 0, track);
    }
    this._buildShuffleOrder();
    this._emit('queueChanged');
  }

  reorderQueue(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [removed] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, removed);

    // Update currentIndex accordingly
    if (fromIndex === this.currentIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++;
    }

    this._buildShuffleOrder();
    this._emit('queueChanged');
  }

  // ─── Playback control ──────────────────────────────────────────────────────

  play() {
    if (this.audio.src) {
      this.audio.play().catch(() => {});
    }
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  isPlaying() {
    return !this.audio.paused && !this.audio.ended;
  }

  playTrackAt(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.currentIndex = index;
    this._playCurrentTrack();
  }

  playTrack(track) {
    // Check if already in queue
    const existingIndex = this.queue.findIndex(t => t.id === track.id);
    if (existingIndex !== -1) {
      this.playTrackAt(existingIndex);
    } else {
      this.queue.push(track);
      this.currentIndex = this.queue.length - 1;
      this._buildShuffleOrder();
      this._playCurrentTrack();
      this._emit('queueChanged');
    }
  }

  next() {
    if (this.queue.length === 0) return;

    if (this.shuffleEnabled) {
      this._nextShuffle();
    } else {
      if (this.currentIndex < this.queue.length - 1) {
        this.currentIndex++;
      } else if (this.loopMode === LoopMode.ALL) {
        this.currentIndex = 0;
      } else {
        return; // No more tracks
      }
      this._playCurrentTrack();
    }
  }

  previous() {
    if (this.queue.length === 0) return;

    // If more than 3 seconds in, restart current track
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    if (this.shuffleEnabled) {
      this._prevShuffle();
    } else {
      if (this.currentIndex > 0) {
        this.currentIndex--;
      } else if (this.loopMode === LoopMode.ALL) {
        this.currentIndex = this.queue.length - 1;
      } else {
        this.audio.currentTime = 0;
        return;
      }
      this._playCurrentTrack();
    }
  }

  seek(seconds) {
    if (isNaN(this.audio.duration)) return;
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
  }

  seekRelative(delta) {
    this.seek(this.audio.currentTime + delta);
  }

  // ─── Volume ────────────────────────────────────────────────────────────────

  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  getVolume() {
    return this.audio.volume;
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
  }

  isMuted() {
    return this.audio.muted;
  }

  // ─── Loop ──────────────────────────────────────────────────────────────────

  cycleLoopMode() {
    const modes = [LoopMode.NONE, LoopMode.ALL, LoopMode.ONE];
    const currentModeIndex = modes.indexOf(this.loopMode);
    this.loopMode = modes[(currentModeIndex + 1) % modes.length];
    this.audio.loop = this.loopMode === LoopMode.ONE;
    this._emit('loopChanged');
    return this.loopMode;
  }

  // ─── Shuffle ───────────────────────────────────────────────────────────────

  toggleShuffle() {
    this.shuffleEnabled = !this.shuffleEnabled;
    if (this.shuffleEnabled) {
      this._buildShuffleOrder();
    }
    this._emit('shuffleChanged');
    return this.shuffleEnabled;
  }

  _buildShuffleOrder() {
    if (!this.shuffleEnabled || this.queue.length === 0) {
      this._shuffleOrder = [];
      this._shufflePos = -1;
      return;
    }
    // Fisher-Yates shuffle, keeping current track at current position
    const indices = Array.from({ length: this.queue.length }, (_, i) => i);
    // Remove current track from shuffle, we'll place it first
    const currentPos = indices.indexOf(this.currentIndex);
    if (currentPos !== -1) indices.splice(currentPos, 1);

    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    this._shuffleOrder = this.currentIndex >= 0
      ? [this.currentIndex, ...indices]
      : indices;
    this._shufflePos = 0;
  }

  _nextShuffle() {
    if (this._shuffleOrder.length === 0) return;
    if (this._shufflePos < this._shuffleOrder.length - 1) {
      this._shufflePos++;
    } else if (this.loopMode === LoopMode.ALL) {
      this._buildShuffleOrder(); // Re-shuffle
      this._shufflePos = 0;
    } else {
      return;
    }
    this.currentIndex = this._shuffleOrder[this._shufflePos];
    this._playCurrentTrack();
  }

  _prevShuffle() {
    if (this._shuffleOrder.length === 0) return;
    if (this._shufflePos > 0) {
      this._shufflePos--;
      this.currentIndex = this._shuffleOrder[this._shufflePos];
      this._playCurrentTrack();
    } else {
      this.audio.currentTime = 0;
    }
  }

  // ─── Internal playback ─────────────────────────────────────────────────────

  _playCurrentTrack() {
    if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) return;
    const track = this.queue[this.currentIndex];
    this.audio.src = track.file;
    this.audio.load();
    this.audio.play().catch(() => {});
    this._updateMediaSession(track);
    this._emit('trackChanged', track);
  }

  _onEnded() {
    if (this.loopMode === LoopMode.ONE) return; // `audio.loop` handles this

    if (this.shuffleEnabled) {
      this._nextShuffle();
    } else if (this.currentIndex < this.queue.length - 1) {
      this.currentIndex++;
      this._playCurrentTrack();
    } else if (this.loopMode === LoopMode.ALL) {
      this.currentIndex = 0;
      this._playCurrentTrack();
    } else {
      this._emit('queueEnded');
    }
  }

  // ─── Media Session API ─────────────────────────────────────────────────────

  _updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    const artwork = [];
    if (track.cover) {
      artwork.push({ src: track.cover, sizes: '512x512', type: 'image/jpeg' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      album: track.album || '',
      artwork,
    });

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    navigator.mediaSession.setActionHandler('seekbackward', (d) => {
      this.seekRelative(-(d.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (d) => {
      this.seekRelative(d.seekOffset || 10);
    });
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  getCurrentTrack() {
    if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) return null;
    return this.queue[this.currentIndex];
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getDuration() {
    return this.audio.duration || 0;
  }
}

export { MusicPlayer, LoopMode };
