class BullGame {
  constructor({ fieldEl, scoreEl, nickname }) {
    this.GRID_COLS = 12;
    this.GRID_ROWS = 20;
    this.TICK  = 300;
    this.fieldEl  = fieldEl;
    this.scoreEl  = scoreEl;
    this.nickname = nickname;

    // Canvas 初期化
    this.canvas = this.fieldEl;
    this.ctx = this.canvas.getContext('2d');
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    this.cellSize = this.canvasWidth / this.GRID_COLS;

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
    this._snakeSet = null; // snakeの占有マスをキャッシュ
    this._lastSnakeLength = 0; // キャッシュの有効性チェック用
    this._lastSnake = []; // 前フレームのsnake位置（差分レンダリング用）
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
      this.bgm.preload = 'auto'; // メタデータの事前読み込みを有効化
      // crossOrigin は削除（HTTPサーバーから提供される場合は自動処理）

      // 手動ループ処理：曲の終了時に自動リセット
      this.bgm.addEventListener('ended', () => {
        this.bgm.currentTime = 0;
        this.bgm.play().catch(err => console.warn('BGM loop play failed:', err.message));
      });

      // エラーハンドリング
      this.bgm.addEventListener('error', (e) => {
        console.warn('BGM load error:', e.target.error?.code, e.target.error?.message);
        this._tryBGMFallback();
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
    this._firstRender = true;
    this._drawBackground();
    this._bodyPool = [];
  }

  _drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= this.GRID_COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * this.cellSize, 0);
      ctx.lineTo(i * this.cellSize, this.canvasHeight);
      ctx.stroke();
    }
    for (let i = 0; i <= this.GRID_ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * this.cellSize);
      ctx.lineTo(this.canvasWidth, i * this.cellSize);
      ctx.stroke();
    }
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
    // snakeSetをキャッシュ：snake長が変わったときのみ再生成
    const snakeLength = this.snake.length;
    if (!this._snakeSet || this._lastSnakeLength !== snakeLength) {
      this._snakeSet = new Set();
      for (let i = 0; i < snakeLength; i++) {
        const s = this.snake[i];
        this._snakeSet.add(s.row * this.GRID_COLS + s.col);
      }
      this._lastSnakeLength = snakeLength;
    }
    const snakeSet = this._snakeSet;

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
      isSpecial = Math.random() < (1/3); // 1/3 の確率
    } else {
      isSpecial = Math.random() < 0.2;  // 1/5 の確率（21以降）
    }

    // ランダム試行で肉配置（見つからなければ肉なし状態のまま）
    for (let attempts = 0; attempts < 300; attempts++) {
      const r = Math.floor(Math.random() * this.GRID_ROWS);
      const c = Math.floor(Math.random() * this.GRID_COLS);
      if (!snakeSet.has(r * this.GRID_COLS + c)) {
        this.meat = { row: r, col: c, isSpecial };
        return;
      }
    }

    // フォールバック処理は削除：見つからなければ肉なし状態を許容
    this.meat = null;
  }

  _render() {
    this._drawBackground();
    this._drawMeat();
    this._drawSnake();
  }

  _drawMeat() {
    if (!this.meat) return;

    const ctx = this.ctx;
    const padding = 2;
    const size = this.cellSize - padding * 2;
    const x = this.meat.col * this.cellSize + padding;
    const y = this.meat.row * this.cellSize + padding;
    const radius = size / 2;

    // 肉の色
    if (this.meat.isSpecial) {
      ctx.fillStyle = '#FFD700';
    } else {
      ctx.fillStyle = '#FF4500';
    }

    ctx.beginPath();
    ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
    ctx.fill();

    // ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x + size * 0.3, y + size * 0.3, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawSnake() {
    const ctx = this.ctx;
    const padding = 2;
    const size = this.cellSize - padding * 2;

    // 体を描画
    for (let i = 1; i < this.snake.length; i++) {
      const seg = this.snake[i];
      const x = seg.col * this.cellSize + padding;
      const y = seg.row * this.cellSize + padding;

      ctx.fillStyle = '#4169E1';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, size, size);
    }

    // 頭を描画
    const head = this.snake[0];
    const hx = head.col * this.cellSize + padding;
    const hy = head.row * this.cellSize + padding;

    ctx.fillStyle = '#1E90FF';
    ctx.fillRect(hx, hy, size, size);

    // 目を描画
    ctx.fillStyle = 'white';
    const eyeSize = size * 0.2;
    const eyeOffset = size * 0.2;
    ctx.beginPath();
    ctx.arc(hx + eyeOffset + eyeSize / 2, hy + eyeOffset + eyeSize / 2, eyeSize / 2, 0, Math.PI * 2);
    ctx.fill();
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
      // 特別な肉は専用の音を1回、通常の肉は通常音を1回鳴らす
      if (ateSpecial) {
        this._playSpecialMeatSound();
        this.score += 3;
        this.skipPopCount = 3;
      } else {
        this._playMeatSound();
        this.score++;
      }
      if (this.scoreEl) this.scoreEl.textContent = String(this.score).padStart(4, '0');

      // スコア30未満：速度を上げる（難易度上昇）
      // スコア30以上：速度を下げる（処理負荷軽減でカクつき防止）
      if (this.score < 30) {
        // 従来のロジック：TICK削減で高速化
        if (this.TICK > 260) {
          const speedDecrease = ateSpecial ? 9 : 3;
          this.TICK -= speedDecrease;
          if (this.TICK < 260) {
            this.TICK = 260; // 下限260msで固定
          }
        }
      } else {
        // スコア30以上：TICK増加で低速化し処理負荷を軽減
        const speedIncrease = ateSpecial ? 9 : 3;
        this.TICK += speedIncrease;
        const maxTICK = 500; // 上限500ms
        if (this.TICK > maxTICK) {
          this.TICK = maxTICK;
        }
      }
      clearInterval(this.timerId);
      this.timerId = setInterval(() => this._tick(), this.TICK);

      // レンダリングと肉配置を次フレームに遅延（フレーム処理を大幅削減）
      requestAnimationFrame(() => {
        this._render();
        this._placeMeat();
      });
    } else {
      if (this.skipPopCount > 0) {
        this.skipPopCount--;
      } else {
        this.snake.pop();
      }
      // 肉を食べなかった時は通常通りレンダリング
      this._render();
    }

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

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
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

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  _playSpecialMeatSound() {
    // 特別肉用の音（「きゅるるーん」という上昇して下降する音）
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('AudioContext not supported');
        return;
      }
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.3;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // 周波数を上昇してから下降：「きゅるるーん」という音
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + duration * 0.6);
    osc.frequency.exponentialRampToValueAtTime(300, now + duration);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.02, now + duration);

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
