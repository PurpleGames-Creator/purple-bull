class BullGame {
  constructor({ fieldEl, scoreEl, nickname }) {
    this.GRID_COLS = 12;
    this.GRID_ROWS = 20;
    this.TICK  = 300;
    this.fieldEl  = fieldEl;
    this.scoreEl  = scoreEl;
    this.nickname = nickname;

    this.cells    = [];   // cells[row][col] = HTMLElement
    this.snake    = [];   // [{row, col}, ...] head は index 0
    this.dir      = { dr: 0, dc: 1 };
    this.nextDir  = { dr: 0, dc: 1 };
    this.moveDirHistory = [{ dr: 0, dc: 1 }];  // 移動方向の履歴（セグメント別のタイムラグ用）
    this.meat     = null; // {row, col}
    this.score    = 0;
    this.running  = false;
    this.timerId  = null;
    this.headEl   = null;
    this._bodyPool = [];
    this._firstRender = true;
    this.bgm = null;
    this.keyQueue = [];
    this.soundPool = {};
    this._lastMeatPos = null;
    this._lastHeadRotate = 0;
    this._lastBodyRotates = []; // 各セグメントの前フレーム回転角度
    this.audioContext = null;
    this.skipPopCount = 0; // 特別な肉で snake を成長させるカウント
  }

  start() {
    this._buildGrid();
    this._placeSnake();
    this._placeMeat();
    this._render();
    this.running = true;
    this.timerId = setInterval(() => this._tick(), this.TICK);

    this._preloadSounds();
    this._initBGM();
  }

  _initBGM() {
    // iOS の AudioContext を resume（suspended 状態を解除）
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.warn('AudioContext resume failed:', err));
    }

    if (!this.bgm) {
      this.bgm = new Audio('./newbgm.mp3');
      this.bgm.loop = false; // 手動ループで制御
      this.bgm.volume = 0.5;
      this.bgm.preload = 'none'; // iOS での事前読み込み問題を回避
      this.bgm.crossOrigin = 'anonymous';

      // 手動ループ処理：曲の終了時に自動リセット
      this.bgm.addEventListener('ended', () => {
        this.bgm.currentTime = 0;
        this.bgm.play().catch(err => console.warn('BGM loop play failed:', err.message));
      });

      // iOS での再生開始
      this.bgm.addEventListener('loadstart', () => {
        console.log('BGM loading started');
      });
    }

    this.bgm.currentTime = 0;
    const playPromise = this.bgm.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('BGM play succeeded');
        })
        .catch(err => {
          console.warn('BGM play failed:', err.name, '-', err.message);
          // 再生失敗時は Web Audio API でのフォールバックを試行
          this._tryBGMFallback();
        });
    }
  }

  _tryBGMFallback() {
    // Web Audio API でのフォールバック再生
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not available');
        return;
      }
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        console.log('AudioContext resumed for fallback BGM');
      });
    }

    // オシレーターでの簡易的な代替音を生成する代わりに、
    // 別のフォーマット（M4A）でのロードを試行
    console.log('BGM fallback attempted with Web Audio API');
  }

  _preloadSounds() {
    const sounds = ['bashi.mp3', 'dosu.mp3', 'paku.mp3', 'kabe.mp3', 'ushi.mp3'];
    sounds.forEach(filename => {
      const key = filename.replace('.mp3', '');
      if (!this.soundPool[key]) {
        const audio = new Audio('./' + filename);
        audio.volume = filename === 'ushi.mp3' ? 0.25 : 0.5;
        this.soundPool[key] = audio;
      }
    });
  }

  destroy() {
    clearInterval(this.timerId);
    this.running = false;

    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }
  }

  setDirection(dr, dc) {
    // 逆方向転換を無視（即死防止）
    if (dr === -this.nextDir.dr && dc === -this.nextDir.dc) return;

    // 次のマスに差し掛かったら方向転換可能：3マス先が体と衝突するかをチェック
    const head = this.snake[0];
    const second = this.snake[1];
    if (second) {
      const nextHeadRow = head.row + this.nextDir.dr * 2 + dr;
      const nextHeadCol = head.col + this.nextDir.dc * 2 + dc;
      if (nextHeadRow === second.row && nextHeadCol === second.col) {
        return;
      }
    }

    // 方向転換時に音声を再生（nextDir と異なる場合のみ）
    // if (dr !== this.nextDir.dr || dc !== this.nextDir.dc) {
    //   this._playSound('bashi.mp3');
    // }

    this.dir = { dr, dc };      // 頭の向きを即座に更新
    this.nextDir = { dr, dc };  // 移動方向も更新
  }

  // ---- private ----

  _buildGrid() {
    this.fieldEl.innerHTML = '';
    this.cells = [];
    this._firstRender = true;
    const frag = document.createDocumentFragment();
    for (let r = 0; r < this.GRID_ROWS; r++) {
      this.cells[r] = [];
      for (let c = 0; c < this.GRID_COLS; c++) {
        const el = document.createElement('div');
        el.className = 'cell ' + ((r + c) % 2 === 0 ? 'cell--grass' : 'cell--grass-b');
        this.cells[r][c] = el;
        frag.appendChild(el);
      }
    }
    this.fieldEl.appendChild(frag);

    this._bodyPool = [];

    this.headEl = document.createElement('div');
    this.headEl.className = 'snake-head';
    this.fieldEl.appendChild(this.headEl);
  }

  _placeSnake() {
    const midRow = Math.floor(this.GRID_ROWS / 2);
    const midCol = Math.floor(this.GRID_COLS / 2);
    this.snake   = [{ row: midRow, col: midCol }];
    this.dir     = { dr: 0, dc: 1 };
    this.nextDir = { dr: 0, dc: 1 };
    this.moveDirHistory = [{ dr: 0, dc: 1 }];
    this.score   = 1;
  }

  _placeMeat() {
    const snakeSet = new Set(this.snake.map(s => s.row * this.GRID_COLS + s.col));
    const totalCells = this.GRID_ROWS * this.GRID_COLS;
    const snakeCells = this.snake.length;

    // Snake がフィールドのほぼ全て（95%以上）を占めたら肉は配置不可
    if (snakeCells > totalCells * 0.95) {
      this.meat = null;
      return;
    }

    // 特別な肉の出現確率：スコアに応じて変更
    let isSpecial = false;
    if (this.score <= 20) {
      isSpecial = Math.random() < 0.25; // 1/4 の確率
    } else if (this.score <= 50) {
      isSpecial = Math.random() < 0.2;  // 1/5 の確率
    }

    // ランダム試行で高速化（100回に増やして成功率UP）
    for (let attempts = 0; attempts < 100; attempts++) {
      const r = Math.floor(Math.random() * this.GRID_ROWS);
      const c = Math.floor(Math.random() * this.GRID_COLS);
      if (!snakeSet.has(r * this.GRID_COLS + c)) {
        this.meat = { row: r, col: c, isSpecial };
        return;
      }
    }

    // フォールバック: フィールド全体をスキャン
    const empty = [];
    for (let r = 0; r < this.GRID_ROWS; r++) {
      for (let c = 0; c < this.GRID_COLS; c++) {
        if (!snakeSet.has(r * this.GRID_COLS + c)) empty.push({ row: r, col: c });
      }
    }
    if (empty.length > 0) {
      const pos = empty[Math.floor(Math.random() * empty.length)];
      this.meat = { row: pos.row, col: pos.col, isSpecial };
    } else {
      this.meat = null;
    }
  }

  _render() {
    // 差分レンダリング：前フレームの肉を消す、新しい肉を追加
    if (this._lastMeatPos) {
      const el = this.cells[this._lastMeatPos.row][this._lastMeatPos.col];
      el.className = 'cell ' + (
        (this._lastMeatPos.row + this._lastMeatPos.col) % 2 === 0
          ? 'cell--grass'
          : 'cell--grass-b'
      );
    }
    if (this.meat && this.cells[this.meat.row] && this.cells[this.meat.row][this.meat.col]) {
      const meatClass = this.meat.isSpecial ? 'cell--meat-special' : 'cell--meat';
      this.cells[this.meat.row][this.meat.col].classList.add(meatClass);
      this._lastMeatPos = { row: this.meat.row, col: this.meat.col, isSpecial: this.meat.isSpecial };
    } else {
      this._lastMeatPos = null;
      this.meat = null;
    }

    // 頭と体を絶対配置要素で描画
    this._moveHead();
    this._renderBody();
  }

  _renderBody() {
    for (let i = 1; i < this.snake.length; i++) {
      const { row, col } = this.snake[i];
      const cellEl = this.cells[row][col];
      const poolIdx = i - 1;
      const isNew = poolIdx >= this._bodyPool.length;

      if (isNew) {
        const el = document.createElement('div');
        el.className = 'snake-body';
        this.fieldEl.insertBefore(el, this.headEl);
        this._bodyPool.push(el);
        this._lastBodyRotates[poolIdx] = 0;
      }

      const el = this._bodyPool[poolIdx];
      const needsInit = !el.dataset.placed;
      let bodyRotate = this._segmentRotateDeg(i);

      // 前フレームからの最短経路回転を計算
      if (!needsInit) {
        const lastRotate = this._lastBodyRotates[poolIdx] || 0;
        const diff = bodyRotate - lastRotate;
        if (diff > 180) {
          bodyRotate -= 360;
        } else if (diff < -180) {
          bodyRotate += 360;
        }
      }
      this._lastBodyRotates[poolIdx] = bodyRotate;

      if (needsInit) {
        el.style.transition = 'none';
        el.style.width  = cellEl.offsetWidth  + 'px';
        el.style.height = cellEl.offsetHeight + 'px';
        el.dataset.placed = '1';
      }

      el.style.display = '';
      const x = cellEl.offsetLeft;
      const y = cellEl.offsetTop;
      el.style.transform = `translate(${x}px, ${y}px) rotate(${bodyRotate}deg)`;

      if (needsInit) {
        el.getBoundingClientRect(); // force reflow
        el.style.removeProperty('transition');
      }
    }

    for (let i = this.snake.length - 1; i < this._bodyPool.length; i++) {
      this._bodyPool[i].style.display = 'none';
    }
  }

  _segmentRotateDeg(i) {
    // セグメント i は iフレーム前の移動方向で描画
    const targetMoveDir = this.moveDirHistory[i - 1];
    if (!targetMoveDir) return 0;

    const { dr, dc } = targetMoveDir;
    if (dc === 1)  return 90;
    if (dc === -1) return 270;
    if (dr === 1)  return 180;
    return 0;
  }

  _moveHead() {
    const { row, col } = this.snake[0];
    const cellEl = this.cells[row][col];
    const h = this.headEl;
    let headRotate = this._headRotateDeg();

    // 前フレームからの最短経路回転を計算
    if (!this._firstRender) {
      const diff = headRotate - this._lastHeadRotate;
      if (diff > 180) {
        headRotate -= 360;
      } else if (diff < -180) {
        headRotate += 360;
      }
    }
    this._lastHeadRotate = headRotate;

    const x = cellEl.offsetLeft;
    const y = cellEl.offsetTop;

    if (this._firstRender) {
      h.style.transition = 'none';
      h.style.width  = cellEl.offsetWidth  + 'px';
      h.style.height = cellEl.offsetHeight + 'px';
      h.style.transform = `translate(${x}px, ${y}px) rotate(${headRotate}deg)`;
      h.getBoundingClientRect(); // force reflow
      h.style.removeProperty('transition');
      this._firstRender = false;
    } else {
      h.style.transform = `translate(${x}px, ${y}px) rotate(${headRotate}deg)`;
    }
  }

  _headRotateDeg() {
    const { dr, dc } = this.dir;
    if (dc === 1)  return 90;    // right
    if (dc === -1) return 270;   // left
    if (dr === 1)  return 180;   // down
    return 0;                    // up
  }

  _startGameOverWithSound(soundFile) {
    clearInterval(this.timerId);
    this.timerId = null;
    this.running = false;

    // 衝突音を再生
    this._playSound(soundFile);

    // 0.4秒後に ushi.mp3 を鳴らす
    setTimeout(() => {
      this._playSound('ushi.mp3');
    }, 400);

    // 頭を壁/自分の方向へ半セル分めり込ませる（transform を使用）
    const cellEl = this.cells[this.snake[0].row][this.snake[0].col];
    const cellW = cellEl.offsetWidth;
    const cellH = cellEl.offsetHeight;
    const h = this.headEl;
    const x = cellEl.offsetLeft + this.dir.dc * cellW * 0.5;
    const y = cellEl.offsetTop + this.dir.dr * cellH * 0.5;
    const headRotate = this._headRotateDeg();
    h.style.transition = 'transform 0.12s ease-out';
    h.style.transform = `translate(${x}px, ${y}px) rotate(${headRotate}deg)`;
    h.classList.add('snake-head--crash');

    setTimeout(() => this._gameOver(), 2000);
  }

  _tick() {
    if (this.keyQueue.length > 0) {
      const direction = this.keyQueue.shift();
      this.setDirection(direction.dr, direction.dc);
    }

    const moveDir = this.nextDir;
    const head = this.snake[0];
    const next = { row: head.row + moveDir.dr, col: head.col + moveDir.dc };

    // 壁衝突
    if (next.row < 0 || next.row >= this.GRID_ROWS || next.col < 0 || next.col >= this.GRID_COLS) {
      this._startGameOverWithSound('kabe.mp3'); return;
    }

    // 自己衝突（テールは今フレームで抜けるので除外）
    const lastIdx = this.snake.length - 1;
    if (this.snake.some((s, i) => i !== lastIdx && s.row === next.row && s.col === next.col)) {
      this._startGameOverWithSound('dosu.mp3'); return;
    }

    const ate = this.meat && next.row === this.meat.row && next.col === this.meat.col;
    const ateSpecial = ate && this.meat.isSpecial;
    this.snake.unshift(next);
    if (ate) {
      // 特別な肉の場合は3回、通常の肉は1回効果音を鳴らす
      if (ateSpecial) {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => this._playMeatSound(), i * 100);
        }
        this.score += 3;
        this.skipPopCount = 3;
      } else {
        this._playMeatSound();
        this.score++;
      }
      if (this.scoreEl) this.scoreEl.textContent = this.score;

      // 速度上げの処理を次のフレームで実行（メインスレッドのブロッキング回避）
      if (this.TICK > 120) {
        requestAnimationFrame(() => {
          this.TICK -= 3;
          clearInterval(this.timerId);
          this.timerId = setInterval(() => this._tick(), this.TICK);
        });
      }

      this._placeMeat();
    } else {
      if (this.skipPopCount > 0) {
        this.skipPopCount--;
      } else {
        this.snake.pop();
      }
    }

    this._render();

    // 移動方向の履歴に追加
    this.moveDirHistory.unshift(this.nextDir);
    if (this.moveDirHistory.length > this.GRID_ROWS * this.GRID_COLS) {
      this.moveDirHistory.pop();
    }
  }

  _gameOver() {
    this.destroy();
    if (typeof window.handleBullGameOver === 'function') {
      window.handleBullGameOver({ nickname: this.nickname, score: this.score });
    }
  }

  _playMeatSound() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('AudioContext not supported');
        return;
      }
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.12;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(950, now + duration);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  _playSound(filename) {
    const key = filename.replace('.mp3', '');
    const audio = this.soundPool[key];
    if (!audio) {
      console.warn(`Sound ${filename} not preloaded`);
      return;
    }
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => console.warn(`Failed to play sound ${filename}:`, err.message));
    }
  }

}

window.BullGame = BullGame;
