// ============================================
// C++ Code Visualizer — Playback Controller
// ============================================

/**
 * Controls step-by-step playback of execution trace
 */
export class PlaybackController {
  constructor(options = {}) {
    this.steps = [];
    this.currentStep = 0;
    this.isPlaying = false;
    this.speed = 1; // 1x
    this.baseInterval = 5000; // ms per step at 1x (5 seconds for reading)
    this.playTimer = null;

    // Callbacks
    this.onStepChange = options.onStepChange || (() => {});
    this.onPlayStateChange = options.onPlayStateChange || (() => {});

    // DOM references
    this.els = {};
  }

  /**
   * Initialize DOM bindings
   */
  init(elements) {
    this.els = elements;

    // Buttons
    this.els.playBtn?.addEventListener('click', () => this.togglePlay());
    this.els.prevBtn?.addEventListener('click', () => this.stepBackward());
    this.els.nextBtn?.addEventListener('click', () => this.stepForward());
    this.els.startBtn?.addEventListener('click', () => this.goToStart());
    this.els.endBtn?.addEventListener('click', () => this.goToEnd());

    // Speed buttons
    this.els.speedBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        this.setSpeed(parseFloat(btn.dataset.speed));
        this.updateSpeedUI();
      });
    });

    // Timeline click/drag
    if (this.els.timeline) {
      this.els.timeline.addEventListener('click', (e) => this.handleTimelineClick(e));
      this.els.timeline.addEventListener('mousedown', (e) => this.handleTimelineDrag(e));
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    this.updateUI();
  }

  /**
   * Load new execution steps
   */
  loadSteps(steps) {
    this.stop();
    this.steps = steps;
    this.currentStep = 0;
    this.updateUI();
    this.emitStepChange();
  }

  /**
   * Get the current step data
   */
  getCurrentStep() {
    return this.steps[this.currentStep] || null;
  }

  /**
   * Get the previous step data (for diff detection)
   */
  getPreviousStep() {
    return this.currentStep > 0 ? this.steps[this.currentStep - 1] : null;
  }

  // ---- Navigation ----

  stepForward() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.updateUI();
      this.emitStepChange();
    } else {
      this.stop();
    }
  }

  stepBackward() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateUI();
      this.emitStepChange();
    }
  }

  goToStep(index) {
    if (index >= 0 && index < this.steps.length) {
      this.currentStep = index;
      this.updateUI();
      this.emitStepChange();
    }
  }

  goToStart() {
    this.stop();
    this.goToStep(0);
  }

  goToEnd() {
    this.stop();
    this.goToStep(this.steps.length - 1);
  }

  // ---- Playback Control ----

  togglePlay() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.play();
    }
  }

  play() {
    if (this.steps.length === 0) return;

    // If at end, restart
    if (this.currentStep >= this.steps.length - 1) {
      this.currentStep = 0;
      this.updateUI();
      this.emitStepChange();
    }

    this.isPlaying = true;
    this.onPlayStateChange(true);
    this.updatePlayButton();
    this.scheduleNextStep();
  }

  stop() {
    this.isPlaying = false;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    this.onPlayStateChange(false);
    this.updatePlayButton();
  }

  scheduleNextStep() {
    if (!this.isPlaying) return;

    const interval = this.baseInterval / this.speed;
    this.playTimer = setTimeout(() => {
      this.stepForward();
      if (this.isPlaying && this.currentStep < this.steps.length - 1) {
        this.scheduleNextStep();
      } else {
        this.stop();
      }
    }, interval);
  }

  setSpeed(speed) {
    this.speed = speed;

    // If playing, restart timer with new speed
    if (this.isPlaying) {
      clearTimeout(this.playTimer);
      this.scheduleNextStep();
    }
  }

  // ---- Timeline Interaction ----

  handleTimelineClick(e) {
    const rect = this.els.timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const stepIndex = Math.round(percent * (this.steps.length - 1));
    this.goToStep(Math.max(0, Math.min(stepIndex, this.steps.length - 1)));
  }

  handleTimelineDrag(e) {
    e.preventDefault();
    const timeline = this.els.timeline;

    const onMove = (moveEvent) => {
      const rect = timeline.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const stepIndex = Math.round(percent * (this.steps.length - 1));
      this.goToStep(stepIndex);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ---- Keyboard ----

  handleKeyboard(e) {
    // Don't handle when typing in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.cm-editor')) {
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.stepForward();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.stepBackward();
        break;
      case '[':
        e.preventDefault();
        this.decreaseSpeed();
        break;
      case ']':
        e.preventDefault();
        this.increaseSpeed();
        break;
      case 'Home':
        e.preventDefault();
        this.goToStart();
        break;
      case 'End':
        e.preventDefault();
        this.goToEnd();
        break;
    }
  }

  increaseSpeed() {
    const speeds = [0.5, 1, 2, 4];
    const idx = speeds.indexOf(this.speed);
    if (idx < speeds.length - 1) {
      this.setSpeed(speeds[idx + 1]);
      this.updateSpeedUI();
    }
  }

  decreaseSpeed() {
    const speeds = [0.5, 1, 2, 4];
    const idx = speeds.indexOf(this.speed);
    if (idx > 0) {
      this.setSpeed(speeds[idx - 1]);
      this.updateSpeedUI();
    }
  }

  // ---- UI Updates ----

  emitStepChange() {
    this.onStepChange(this.getCurrentStep(), this.getPreviousStep(), this.currentStep);
  }

  updateUI() {
    this.updateStepCounter();
    this.updateTimeline();
    this.updatePlayButton();
    this.updateNavButtons();
  }

  updateStepCounter() {
    if (this.els.stepDisplay) {
      if (this.steps.length === 0) {
        this.els.stepDisplay.innerHTML = '<span class="playback__step-current">0</span> / 0';
      } else {
        this.els.stepDisplay.innerHTML =
          `<span class="playback__step-current">${this.currentStep + 1}</span> / ${this.steps.length}`;
      }
    }
  }

  updateTimeline() {
    if (this.els.timelineProgress) {
      const percent = this.steps.length > 1
        ? (this.currentStep / (this.steps.length - 1)) * 100
        : 0;
      this.els.timelineProgress.style.width = `${percent}%`;
    }
  }

  updatePlayButton() {
    if (this.els.playBtn) {
      this.els.playBtn.innerHTML = this.isPlaying ?
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' :
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';

      if (this.isPlaying) {
        this.els.playBtn.classList.add('is-playing');
      } else {
        this.els.playBtn.classList.remove('is-playing');
      }
    }
  }

  updateNavButtons() {
    if (this.els.prevBtn) {
      this.els.prevBtn.disabled = this.currentStep <= 0;
    }
    if (this.els.nextBtn) {
      this.els.nextBtn.disabled = this.currentStep >= this.steps.length - 1;
    }
  }

  updateSpeedUI() {
    this.els.speedBtns?.forEach(btn => {
      const speed = parseFloat(btn.dataset.speed);
      btn.classList.toggle('is-active', speed === this.speed);
    });
  }

  /**
   * Reset the controller
   */
  reset() {
    this.stop();
    this.steps = [];
    this.currentStep = 0;
    this.updateUI();
  }
}
