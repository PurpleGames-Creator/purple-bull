document.addEventListener('DOMContentLoaded', () => {
  const screenHome    = document.getElementById('screen-home');
  const screenGame    = document.getElementById('screen-game');
  const nicknameInput = document.getElementById('nickname');
  const startButton   = document.getElementById('start-button');
  const tabButtons    = document.querySelectorAll('.tab');
  const gameoverOverlay     = document.getElementById('gameover-overlay');
  const gameoverScoreValue  = document.getElementById('gameover-score-value');
  const gameoverBadge       = document.getElementById('gameover-badge');
  const retryButton   = document.getElementById('gameover-retry');
  const homeButton    = document.getElementById('gameover-home');
  const scoreEl       = document.getElementById('score-value');
  const bestEl        = document.getElementById('best-value');
  const swipeHint     = document.getElementById('swipe-hint');
  const quitButton    = document.getElementById('quit-button');
  const pauseButton   = document.getElementById('pause-button');
  const errorBanner   = document.getElementById('error-banner');
  const gameCanvas    = document.getElementById('game-field');

  const BEST_KEY = 'purpleBullBest';

  // スコアをそのまま表示（千の位の0を削除）
  const formatScore = (score) => String(score);

  // ホーム画面 bull キャラクター物理演算
  class HomeBull {
    constructor(x, y, radius, bullImage) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 4;
      this.vy = -8;
      this.radius = radius;
      this.bullImage = bullImage;
      this.rotation = Math.random() * Math.PI * 2;
    }

    update(gravity, groundY, canvasWidth) {
      this.vy += gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.rotation += (this.vx * 0.02);

      if (this.y + this.radius >= groundY) {
        this.y = groundY - this.radius;
        this.vy *= -0.75;
        if (Math.abs(this.vy) < 0.3) this.vy = 0;
      }

      if (this.x - this.radius < 0) {
        this.x = this.radius;
        this.vx *= -0.7;
      } else if (this.x + this.radius > canvasWidth) {
        this.x = canvasWidth - this.radius;
        this.vx *= -0.7;
      }

      return this.y > canvasHeight + 50;
    }

    collidesWith(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < this.radius + other.radius;
    }

    resolveCollision(other) {
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist;
      const ny = dy / dist;

      const overlap = (this.radius + other.radius - dist) / 2;
      this.x -= nx * overlap;
      this.y -= ny * overlap;
      other.x += nx * overlap;
      other.y += ny * overlap;

      const dvx = other.vx - this.vx;
      const dvy = other.vy - this.vy;
      const dot = dvx * nx + dvy * ny;

      if (dot > 0) return;

      this.vx += nx * dot * 0.8;
      this.vy += ny * dot * 0.8;
      other.vx -= nx * dot * 0.8;
      other.vy -= ny * dot * 0.8;
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.drawImage(this.bullImage, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
      ctx.restore();
    }
  }

  let currentGame = null;
  let lastNickname = null;
  let gameoverAnimId = null;

  // エラー表示
  window.showGameError = (msg) => {
    if (!errorBanner) { console.error(msg); return; }
    errorBanner.textContent = String(msg);
    errorBanner.style.display = 'block';
    setTimeout(() => { if (errorBanner.textContent === msg) errorBanner.style.display = 'none'; }, 5000);
  };

  // ダブルタップズーム防止
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // ベストスコア表示更新
  const updateBestDisplay = () => {
    const best = Number(localStorage.getItem(BEST_KEY) || '0');
    if (bestEl) bestEl.textContent = formatScore(best);
  };
  updateBestDisplay();

  // タブ切り替え
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabButtons.forEach((b) => {
        b.classList.toggle('tab--active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      document.querySelectorAll('.ranking-list').forEach((p) => {
        p.classList.toggle('ranking-list--active', p.dataset.panel === target);
      });
      loadRankingAfterConnection(target);
    });
  });

  // ゲーム開始
  const startGame = (nickname) => {
    if (currentGame) { currentGame.destroy(); currentGame = null; }

    lastNickname = nickname;
    scoreEl.textContent = formatScore(1);
    updateBestDisplay();

    if (swipeHint) swipeHint.style.opacity = '1';

    currentGame = new BullGame({
      fieldEl:  document.getElementById('game-field'),
      scoreEl,
      nickname,
    });
    currentGame.start();
  };

  startButton.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) { alert('ニックネームを入力してください。'); nicknameInput.focus(); return; }

    screenHome.classList.remove('screen--active');
    screenGame.classList.add('screen--active');
    startGame(nickname);
  });

  // ゲームオーバー処理
  window.handleBullGameOver = async ({ nickname, score }) => {
    // スコア表示カウントアップ
    if (gameoverScoreValue) {
      if (gameoverAnimId != null) { cancelAnimationFrame(gameoverAnimId); gameoverAnimId = null; }
      const duration = 700;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        gameoverScoreValue.textContent = Math.floor(score * eased);
        if (t < 1) {
          gameoverAnimId = requestAnimationFrame(tick);
        } else {
          gameoverAnimId = null;
          gameoverScoreValue.textContent = score;
        }
      };
      gameoverScoreValue.textContent = '0';
      gameoverAnimId = requestAnimationFrame(tick);
    }

    // ベストスコア判定
    const prev = Number(localStorage.getItem(BEST_KEY) || '0');
    const isNew = score > prev;
    if (isNew) localStorage.setItem(BEST_KEY, String(score));

    if (gameoverBadge) {
      gameoverBadge.textContent = 'New Record!';
      gameoverBadge.classList.toggle('gameover-badge--hidden', !isNew);
    }

    if (gameoverOverlay) {
      gameoverOverlay.classList.add('gameover-overlay--visible');
      gameoverOverlay.setAttribute('aria-hidden', 'false');
    }

    // Supabase スコア投稿
    if (typeof submitScore === 'function') {
      const { error } = await submitScore({ nickname, score });
      if (error) console.error('スコア投稿エラー:', error);
    }
  };

  const hideGameover = () => {
    if (gameoverOverlay) {
      gameoverOverlay.classList.remove('gameover-overlay--visible');
      gameoverOverlay.setAttribute('aria-hidden', 'true');
    }
  };

  retryButton?.addEventListener('click', () => {
    hideGameover();
    startGame(lastNickname || nicknameInput.value.trim());
  });

  homeButton?.addEventListener('click', function homeButtonHandler() {
    hideGameover();
    if (currentGame) { currentGame.destroy(); currentGame = null; }
    homeBulls = [];
    if (homeAnimationId) { cancelAnimationFrame(homeAnimationId); homeAnimationId = null; }
    screenGame.classList.remove('screen--active');
    screenHome.classList.add('screen--active');
    updateBestDisplay();
    loadRankingAfterConnection('today');
  });

  quitButton?.addEventListener('click', function quitButtonHandler() {
    if (currentGame) { currentGame.destroy(); currentGame = null; }
    homeBulls = [];
    if (homeAnimationId) { cancelAnimationFrame(homeAnimationId); homeAnimationId = null; }
    screenGame.classList.remove('screen--active');
    screenHome.classList.add('screen--active');
    updateBestDisplay();
    loadRankingAfterConnection('today');
  });

  pauseButton?.addEventListener('click', () => {
    if (!currentGame) return;

    currentGame.togglePause();

    // UI 状態を切り替え
    if (currentGame.isPaused) {
      pauseButton.classList.add('paused');
    } else {
      pauseButton.classList.remove('paused');
    }

    // 効果音再生
    if (currentGame.audioContext && currentGame.audioContext.state === 'running') {
      const now = currentGame.audioContext.currentTime;
      const osc = currentGame.audioContext.createOscillator();
      const gain = currentGame.audioContext.createGain();

      osc.connect(gain);
      gain.connect(currentGame.audioContext.destination);

      osc.frequency.value = 1000;
      osc.type = 'sine';

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

      osc.start(now);
      osc.stop(now + 0.1);
    }
  });

  // キーボード操作
  document.addEventListener('keydown', (e) => {
    if (currentGame && !currentGame.isPaused) {
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); currentGame.keyQueue.push({dr: -1, dc: 0}); break;
        case 'ArrowDown':  e.preventDefault(); currentGame.keyQueue.push({dr: 1, dc: 0});  break;
        case 'ArrowLeft':  e.preventDefault(); currentGame.keyQueue.push({dr: 0, dc: -1}); break;
        case 'ArrowRight': e.preventDefault(); currentGame.keyQueue.push({dr: 0, dc: 1});  break;
      }
    }
    if (e.key === 'Enter') {
      if (screenHome.classList.contains('screen--active')) {
        startButton.click();
      } else if (gameoverOverlay.classList.contains('gameover-overlay--visible')) {
        retryButton.click();
      }
    }
  });

  // スワイプ操作
  const SWIPE_MIN = 10;
  let touchStartX = 0, touchStartY = 0;

  document.getElementById('screen-game')?.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.getElementById('screen-game')?.addEventListener('touchend', (e) => {
    if (!currentGame || currentGame.isPaused) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      currentGame.keyQueue.push({dr: 0, dc: dx > 0 ? 1 : -1});
    } else {
      currentGame.keyQueue.push({dr: dy > 0 ? 1 : -1, dc: 0});
    }

    if (swipeHint) swipeHint.style.opacity = '0';
  }, { passive: true });

  // ホーム画面 bull キャラクター物理演算管理
  const heroCanvas = document.getElementById('hero-canvas');
  const formSection = document.querySelector('.form-section');
  let homeBulls = [];
  let homeBullImage = null;
  let homeAnimationId = null;
  const GRAVITY = 0.3;
  let canvasHeight = 200;

  const initHeroCanvas = () => {
    if (!heroCanvas) return;
    const rect = document.querySelector('.hero').getBoundingClientRect();
    heroCanvas.width = Math.min(window.innerWidth - 40, 500);
    heroCanvas.height = canvasHeight;
    heroCanvas.style.width = heroCanvas.width + 'px';
    heroCanvas.style.height = heroCanvas.height + 'px';
  };

  const loadBullImage = () => {
    if (homeBullImage) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        homeBullImage = img;
        resolve();
      };
      img.src = './bull.png';
    });
  };

  const getGroundY = () => {
    if (!formSection) return heroCanvas.height;
    const rect = formSection.getBoundingClientRect();
    const heroRect = heroCanvas.getBoundingClientRect();
    return Math.min(rect.top - heroRect.top, heroCanvas.height);
  };

  const startHomeAnimation = () => {
    const ctx = heroCanvas.getContext('2d');
    const animate = () => {
      ctx.clearRect(0, 0, heroCanvas.width, heroCanvas.height);

      const groundY = getGroundY();
      homeBulls = homeBulls.filter(bull => !bull.update(GRAVITY, groundY, heroCanvas.width));

      for (let i = 0; i < homeBulls.length; i++) {
        for (let j = i + 1; j < homeBulls.length; j++) {
          if (homeBulls[i].collidesWith(homeBulls[j])) {
            homeBulls[i].resolveCollision(homeBulls[j]);
          }
        }
      }

      homeBulls.forEach(bull => bull.draw(ctx));

      if (screenHome.classList.contains('screen--active')) {
        homeAnimationId = requestAnimationFrame(animate);
      }
    };
    animate();
  };

  const playCharacterSound = () => {
    // Note: soundPool は currentGame が初期化されて _preloadSounds() が実行された後に利用可能
    if (currentGame && currentGame.soundPool && currentGame.soundPool['poyoyon']) {
      const audio = currentGame.soundPool['poyoyon'];
      audio.currentTime = 0;
      audio.play().catch(err => console.warn('Character sound play failed:', err));
    } else {
      // fallback: soundPool が未初期化の場合
      try {
        const audio = new Audio('./poyoyon.mp3');
        audio.volume = 0.5;
        audio.play().catch(err => console.warn('Character sound play failed:', err));
      } catch (e) {
        console.warn('Sound not available:', e);
      }
    }
  };

  const createHomeBull = (x, y) => {
    if (!homeBullImage) return;
    const bull = new HomeBull(x, y, 25, homeBullImage);
    homeBulls.push(bull);
    playCharacterSound();
  };

  let touchDetected = false;

  heroCanvas.addEventListener('touchstart', (e) => {
    if (!screenHome.classList.contains('screen--active')) return;
    touchDetected = true;
    const rect = heroCanvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    createHomeBull(x, y);
  });

  heroCanvas.addEventListener('click', (e) => {
    if (!screenHome.classList.contains('screen--active') || touchDetected) {
      touchDetected = false;
      return;
    }
    const rect = heroCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    createHomeBull(x, y);
  });

  const observeScreenChange = () => {
    const observer = new MutationObserver(() => {
      if (screenHome.classList.contains('screen--active') && !homeAnimationId) {
        loadBullImage().then(() => {
          initHeroCanvas();
          startHomeAnimation();
        });
      }
    });
    observer.observe(screenHome, { attributes: true, attributeFilter: ['class'] });
  };

  initHeroCanvas();
  loadBullImage().then(() => startHomeAnimation());
  observeScreenChange();
  window.addEventListener('resize', () => {
    initHeroCanvas();
  });

  // 初期ランキング読み込み
  (async () => { await loadRankingAfterConnection('today'); })();
});

// ランキング取得・表示
async function loadRankingAfterConnection(range) {
  const map = {
    today: document.getElementById('ranking-today'),
    week:  document.getElementById('ranking-week'),
    all:   document.getElementById('ranking-all'),
  };
  const listEl = map[range];
  if (!listEl) return;

  listEl.innerHTML = '<li class="ranking-item ranking-item--placeholder">読み込み中…</li>';

  if (typeof window.waitForSupabaseConnection === 'function') {
    const { connected } = await window.waitForSupabaseConnection(5000);
    if (!connected) {
      listEl.innerHTML = '<li class="ranking-item ranking-item--placeholder">オフラインのためランキングを表示できません。</li>';
      return;
    }
  }

  if (typeof fetchRanking !== 'function') {
    listEl.innerHTML = '<li class="ranking-item ranking-item--placeholder">Supabase未設定のため表示できません。</li>';
    return;
  }

  const { data, error, skipped } = await fetchRanking(range);
  if (skipped || error || !data || data.length === 0) {
    listEl.innerHTML = '<li class="ranking-item ranking-item--placeholder">' +
      (skipped ? 'オフラインのためランキングを表示できません。' : error ? 'ランキングの取得に失敗しました。' : 'まだスコアが登録されていません。') +
      '</li>';
    return;
  }

  listEl.innerHTML = '';
  data.forEach((row, idx) => {
    const rank = idx + 1;
    let extraClass = '', medal = '';
    if (rank === 1) { extraClass = ' ranking-item--gold';   medal = '🥇'; }
    else if (rank === 2) { extraClass = ' ranking-item--silver'; medal = '🥈'; }
    else if (rank === 3) { extraClass = ' ranking-item--bronze'; medal = '🥉'; }

    const li = document.createElement('li');
    li.className = 'ranking-item' + extraClass;
    li.innerHTML =
      `<span class="ranking-rank">${medal || rank}</span>` +
      `<span class="ranking-name">${escapeHtml(row.nickname ?? 'No Name')}</span>` +
      `<span class="ranking-score">${row.score ?? 0} 🥩</span>`;
    listEl.appendChild(li);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
