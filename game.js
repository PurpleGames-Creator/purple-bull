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
    this.canvasWidth = 500;  // デフォルト値（_initializeCanvasSize で更新）
    this.canvasHeight = 833;
    this.cellSize = 41.67;

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

    // アニメーション関連プロパティ
    this._animationId = null;
    this._snakeVisuals = [];
    this._lastTickTime = Date.now();
    this._tickProgress = 0;

    // 一時停止フラグ
    this.isPaused = false;

    // 倍速フラグ
    this.isSpeedBoost = false;
  }

  start() {
    this._initializeCanvasSize();
    this._buildGrid();
    this._loadBullImage();
    this._placeSnake();
    this._placeMeat();
    this._initSnakeVisuals();
    this._render();
    this.running = true;
    this.timerId = setInterval(() => this._tick(), this.TICK);
    this._startAnimationLoop();

    this._preloadSounds();
    this._initBGM();

    // リサイズイベントでキャンバスを再初期化
    this._resizeHandler = () => {
      this._initializeCanvasSize();
      this._drawBackground();
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  _initializeCanvasSize() {
    // CSS により計算された Canvas の表示寸法を取得
    const rect = this.canvas.getBoundingClientRect();
    let displayWidth = Math.floor(rect.width);
    let displayHeight = Math.floor(rect.height);

    // cellSize を幅から計算
    let cellSize = Math.floor(displayWidth / this.GRID_COLS);

    // 高さから逆算した cellSize と比較（縦方向を優先）
    const cellSizeFromHeight = Math.floor(displayHeight / this.GRID_ROWS);
    if (cellSizeFromHeight < cellSize) {
      cellSize = cellSizeFromHeight;
    }

    // グリッドが正確に収まるようにキャンバスサイズを調整
    displayWidth = cellSize * this.GRID_COLS;
    displayHeight = cellSize * this.GRID_ROWS;

    // Canvas 内部解像度属性を更新
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;

    // プロパティを更新
    this.cellSize = cellSize;
    this.canvasWidth = displayWidth;
    this.canvasHeight = displayHeight;
  }

  _initSnakeVisuals() {
    this._snakeVisuals = this.snake.map(seg => ({
      row: seg.row,
      col: seg.col,
      targetRow: seg.row,
      targetCol: seg.col,
    }));
  }

  _startAnimationLoop() {
    const loop = () => {
      if (!this.isPaused) {
        const elapsed = Date.now() - this._lastTickTime;
        this._tickProgress = Math.min(1, elapsed / this.TICK);

        this._updateSnakeVisuals();
      }
      this._render();

      this._animationId = requestAnimationFrame(loop);
    };
    this._animationId = requestAnimationFrame(loop);
  }

  _updateSnakeVisuals() {
    const t = this._tickProgress;
    for (let i = 0; i < this._snakeVisuals.length; i++) {
      const visual = this._snakeVisuals[i];
      visual.row = visual.targetRow - (visual.targetRow - visual.row) * (1 - t);
      visual.col = visual.targetCol - (visual.targetCol - visual.col) * (1 - t);
    }
  }

  _updateSnakeVisualTargets() {
    for (let i = 0; i < this.snake.length; i++) {
      if (!this._snakeVisuals[i]) {
        this._snakeVisuals.push({
          row: this.snake[i].row,
          col: this.snake[i].col,
          targetRow: this.snake[i].row,
          targetCol: this.snake[i].col,
        });
      }
      this._snakeVisuals[i].targetRow = this.snake[i].row;
      this._snakeVisuals[i].targetCol = this.snake[i].col;
    }
    if (this._snakeVisuals.length > this.snake.length) {
      this._snakeVisuals.pop();
    }
  }

  _getRotationAngle(dir) {
    // bull.png は上向きの画像（上に進む時が基準）
    if (dir.dr === -1) return 0;           // 上：0度（回転なし）
    if (dir.dc === 1) return Math.PI / 2;  // 右：90度（時計回り）
    if (dir.dr === 1) return Math.PI;      // 下：180度
    if (dir.dc === -1) return -Math.PI / 2; // 左：-90度（反時計回り）
    return 0;
  }

  _loadBullImage() {
    this.bullImage = new Image();
    this.bullImage.src = './bull.png';
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
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }
    this.running = false;

    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }

    // リサイズイベントリスナーの削除
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
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

    // 市松模様の背景（明るい黄緑色）
    const lightGreen = '#90EE90';
    const darkGreen = '#7FD76F';

    for (let row = 0; row < this.GRID_ROWS; row++) {
      for (let col = 0; col < this.GRID_COLS; col++) {
        const isEven = (row + col) % 2 === 0;
        ctx.fillStyle = isEven ? lightGreen : darkGreen;
        ctx.fillRect(col * this.cellSize, row * this.cellSize, this.cellSize, this.cellSize);
      }
    }

    // グリッドライン（薄い）
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
      isSpecial = Math.random() < 0.4; // 40% の確率
    } else {
      isSpecial = Math.random() < 0.3; // 30% の確率（21以降）
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
    const x = this.meat.col * this.cellSize;
    const y = this.meat.row * this.cellSize;

    // 特別な肉の場合は背景を金色で塗る＋豪華なネオン効果
    if (this.meat.isSpecial) {
      const glowIntensity = Math.sin(Date.now() / 200) * 0.5 + 0.5; // 0-1 で脈動

      // 外側の大きなグロー（深い金色）
      ctx.shadowColor = `rgba(255, 165, 0, ${glowIntensity * 0.6})`;
      ctx.shadowBlur = 25 * glowIntensity;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#FFB300';
      ctx.fillRect(x, y, this.cellSize, this.cellSize);

      // 中層のグロー（明るい金色）
      ctx.shadowColor = `rgba(255, 200, 0, ${glowIntensity * 0.7})`;
      ctx.shadowBlur = 15 * glowIntensity;
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4);

      // 内側のグロー（最も明るい）
      ctx.shadowColor = `rgba(255, 255, 100, ${glowIntensity * 0.5})`;
      ctx.shadowBlur = 8 * glowIntensity;
      ctx.fillStyle = '#FFED4E';
      ctx.fillRect(x + 4, y + 4, this.cellSize - 8, this.cellSize - 8);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // 肉の絵文字を描画
    ctx.fillStyle = '#000';
    ctx.font = `${this.cellSize * 0.7}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🥩', x + this.cellSize / 2, y + this.cellSize / 2);
  }

  _drawSnake() {
    const ctx = this.ctx;
    const padding = 0.5;
    const size = this.cellSize - padding * 2;

    // 蛇の全セグメントを bull.png で描画（補間位置と回転適用）
    for (let i = 0; i < this._snakeVisuals.length; i++) {
      if (!this._snakeVisuals[i]) continue;

      const visual = this._snakeVisuals[i];
      const pixelRow = Math.round(visual.row * this.cellSize);
      const pixelCol = Math.round(visual.col * this.cellSize);
      const x = pixelCol + padding;
      const y = pixelRow + padding;

      // 向きを取得
      const dir = this.moveDirHistory[i] || this.nextDir;
      const rotation = this._getRotationAngle(dir);

      ctx.save();
      ctx.translate(x + size / 2, y + size / 2);
      ctx.rotate(rotation);

      if (this.bullImage && this.bullImage.complete) {
        ctx.drawImage(this.bullImage, -size / 2, -size / 2, size, size);
      } else {
        // フォールバック：画像読み込み中の場合は紫色で表示
        ctx.fillStyle = '#A855F7';
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }

      ctx.restore();
    }
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
    // 一時停止中は更新をスキップ
    if (this.isPaused) {
      return;
    }

    // 倍速時は TICK を 2/3 に調整
    const effectiveTick = this.isSpeedBoost ? Math.floor(this.TICK * 2 / 3) : this.TICK;

    if (this.keyQueue.length > 0) {
      const direction = this.keyQueue.shift();
      this.setDirection(direction.dr, direction.dc);
    }

    const moveDir = this.nextDir;
    const head = this.snake[0];
    const next = { row: head.row + moveDir.dr, col: head.col + moveDir.dc };

    // 壁衝突
    if (next.row < 0 || next.row >= this.GRID_ROWS || next.col < 0 || next.col >= this.GRID_COLS) {
      // 衝突位置に頭を移動させて半分めり込ませる
      this.snake.unshift(next);
      this._updateSnakeVisualTargets();
      this._render();
      this._startGameOverWithSound('kabe.mp3'); return;
    }

    // 自己衝突（テールは今フレームで抜けるので除外）
    const lastIdx = this.snake.length - 1;
    if (this.snake.some((s, i) => i !== lastIdx && s.row === next.row && s.col === next.col)) {
      // 衝突位置に頭を移動させて半分めり込ませる
      this.snake.unshift(next);
      this._updateSnakeVisualTargets();
      this._render();
      this._startGameOverWithSound('dosu.mp3'); return;
    }

    const ate = this.meat && next.row === this.meat.row && next.col === this.meat.col;
    const ateSpecial = ate && this.meat.isSpecial;
    this.snake.unshift(next);
    if (ate) {
      // 特別な肉は専用の音を1回、通常の肉は通常音を1回鳴らす
      if (ateSpecial) {
        this._playSpecialMeatSound();
        this.score += 3;  // unshift(1) + skipPopCount(2) = 3マス成長
        this.skipPopCount = 2;
      } else {
        this._playMeatSound();
        this.score++;  // unshift(1) + skipPopCount(0) = 1マス成長
        this.skipPopCount = 0;
      }
      if (this.scoreEl) this.scoreEl.textContent = String(this.score);

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

    // アニメーション用：視覚位置ターゲット更新
    this._updateSnakeVisualTargets();
    this._lastTickTime = Date.now();
    this._tickProgress = 0;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
  }

  setSpeedBoost(active) {
    this.isSpeedBoost = active;
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
    // 特別肉用の音：通常の肉の音を素早く3連続で鳴らす
    const delay1 = 0;
    const delay2 = 0.08;
    const delay3 = 0.16;

    this._playMeatSoundWithDelay(delay1);
    this._playMeatSoundWithDelay(delay2);
    this._playMeatSoundWithDelay(delay3);
  }

  _playMeatSoundWithDelay(delayTime) {
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

    setTimeout(() => {
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
    }, delayTime * 1000);
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
