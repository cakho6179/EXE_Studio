/**
 * Stuđiô AI - Deep Work & Pomodoro Focus Timer Engine
 */
class FocusTimerEngine {
  constructor() {
    this.totalSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;
    this.isRunning = false;
    this.intervalId = null;
    this.distractionsCount = 0;
    this.currentTaskId = null;
    this.currentTaskTitle = 'Phiên tập trung sâu';
    this.startTime = null;
  }

  init(minutes = 25, taskId = null, taskTitle = null) {
    this.totalSeconds = minutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.currentTaskId = taskId;
    if (taskTitle) this.currentTaskTitle = taskTitle;
    this.distractionsCount = 0;
    this.renderDisplay();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = new Date();

    this.intervalId = setInterval(() => {
      this.remainingSeconds--;
      this.renderDisplay();

      if (this.remainingSeconds <= 0) {
        this.completeSession();
      }
    }, 1000);

    this.updateControlsUI();
    if (window.showCalmToast) window.showCalmToast('Đã bắt đầu phiên tập trung sâu. Chúc bạn học tốt!', 'success');
  }

  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.updateControlsUI();
    if (window.showCalmToast) window.showCalmToast('Đã tạm dừng phiên học.', 'info');
  }

  toggle() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  recordDistraction() {
    this.distractionsCount++;
    if (window.showCalmToast) {
      window.showCalmToast(`Ghi nhận xao nhãng (${this.distractionsCount}). Hít thở sâu và quay lại nhé!`, 'warning');
    }
    const countEl = document.getElementById('distraction-count');
    if (countEl) countEl.textContent = this.distractionsCount;
  }

  async completeSession() {
    this.pause();
    this.remainingSeconds = 0;
    this.renderDisplay();

    // Play subtle chime or sound notification
    if (window.calmAudio) {
      window.calmAudio.stopAll();
    }

    if (window.showCalmToast) {
      window.showCalmToast('🎉 Xuất sắc! Bạn đã hoàn thành phiên tập trung sâu.', 'success', 6000);
    }

    // Submit session to backend
    if (window.api && window.auth && window.auth.isLoggedIn()) {
      try {
        await window.api.post('/focus/session/complete', {
          task_id: this.currentTaskId,
          planned_minutes: Math.round(this.totalSeconds / 60),
          actual_minutes: Math.round((this.totalSeconds - this.remainingSeconds) / 60),
          distractions_count: this.distractionsCount,
          ambient_sound_used: 'Sóng Biển 432Hz',
          notes: document.getElementById('session-quick-notes')?.value || ''
        });
      } catch (err) {
        console.warn('Could not record focus session:', err);
      }
    }
  }

  formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  renderDisplay() {
    const formatted = this.formatTime(this.remainingSeconds);

    // Update text elements
    document.querySelectorAll('[data-timer-display], #timer-text-display').forEach(el => {
      el.textContent = formatted;
    });

    // Update document title with timer
    if (this.isRunning) {
      document.title = `(${formatted}) Stuđiô AI - Tập trung sâu`;
    }

    // Update circular SVG progress
    // Circumference for r=110 is ~691px
    const circle = document.querySelector('.timer-circle-progress, [data-timer-progress]');
    if (circle) {
      const circumference = 691;
      const progress = this.remainingSeconds / this.totalSeconds;
      const offset = circumference * (1 - progress);
      circle.style.strokeDashoffset = offset;
    }
  }

  updateControlsUI() {
    document.querySelectorAll('[data-action="toggle-timer"]').forEach(btn => {
      const text = btn.querySelector('.timer-btn-text');
      if (text) {
        text.textContent = this.isRunning ? 'Tạm dừng' : 'Bắt đầu';
      }
    });
  }
}

const focusTimer = new FocusTimerEngine();
window.focusTimer = focusTimer;
