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
  const errorBanner   = document.getElementById('error-banner');

  const BEST_KEY = 'purpleBullBest';

  // スコアを等幅表示用にパディング（3文字、位置が動かない）
  const formatScore = (score) => String(score).padStart(3, '0');

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

  homeButton?.addEventListener('click', () => {
    hideGameover();
    if (currentGame) { currentGame.destroy(); currentGame = null; }
    screenGame.classList.remove('screen--active');
    screenHome.classList.add('screen--active');
    updateBestDisplay();
    loadRankingAfterConnection('today');
  });

  quitButton?.addEventListener('click', () => {
    if (currentGame) { currentGame.destroy(); currentGame = null; }
    screenGame.classList.remove('screen--active');
    screenHome.classList.add('screen--active');
    updateBestDisplay();
    loadRankingAfterConnection('today');
  });

  // キーボード操作
  document.addEventListener('keydown', (e) => {
    if (currentGame) {
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
    if (!currentGame) return;
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
