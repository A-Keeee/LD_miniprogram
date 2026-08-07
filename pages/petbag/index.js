import { isDemoEnabled } from '../../utils/services/demoService.js';
import { recordInteractionEvent } from '../../utils/services/eventService.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

Page({
  data: {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    dizzy: false,
    sensorReady: false,
    isDemo: false,
  },

  onLoad() {
    this.setData({ isDemo: isDemoEnabled() });
  },

  onShow() {
    this.startSensors();
  },

  onHide() { this.stopSensors(); },
  onUnload() { this.stopSensors(); },

  startSensors() {
    this._accelerometerHandler = ({ x = 0, y = 0, z = 0 }) => {
      if (!this.data.sensorReady) this.setData({ sensorReady: true });
      const nextX = clamp(this.data.x + x * 13, -170, 170);
      const nextY = clamp(this.data.y - y * 7, -45, 55);
      const magnitude = Math.abs(x) + Math.abs(y) + Math.abs(z);
      this.setData({
        x: nextX,
        y: nextY,
        rotation: clamp(-x * 10, -12, 12),
        scale: clamp(1 + y * 0.025, 0.94, 1.06),
      });
      if (magnitude > 3.1 && Date.now() - (this._lastShakeAt || 0) > 1200) {
        this._lastShakeAt = Date.now();
        this.simulateShake();
      }
      this.scheduleSettle();
    };
    wx.startAccelerometer({
      interval: 'game',
      fail: () => this.setData({ sensorReady: false }),
    });
    wx.onAccelerometerChange(this._accelerometerHandler);
  },

  stopSensors() {
    if (this._settleTimer) clearTimeout(this._settleTimer);
    if (this._dizzyTimer) clearTimeout(this._dizzyTimer);
    wx.stopAccelerometer();
    if (this._accelerometerHandler && wx.offAccelerometerChange) {
      wx.offAccelerometerChange(this._accelerometerHandler);
    }
    this._accelerometerHandler = null;
  },

  scheduleSettle() {
    if (this._settleTimer) clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => {
      this.setData({ x: this.data.x * 0.45, y: 0, rotation: 0, scale: 1 });
    }, 2000);
  },

  simulateShake() {
    wx.vibrateShort({ type: 'medium' });
    this.setData({ dizzy: true, rotation: this.data.rotation > 0 ? -10 : 10 });
    if (this._dizzyTimer) clearTimeout(this._dizzyTimer);
    this._dizzyTimer = setTimeout(() => this.setData({ dizzy: false, rotation: 0 }), 900);
  },

  handleTouchStart(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this._touchStartX = touch.clientX;
    this._petStartX = this.data.x;
  },

  handleTouchMove(e) {
    const touch = e.touches && e.touches[0];
    if (!touch || this._touchStartX === undefined) return;
    const delta = (touch.clientX - this._touchStartX) * 2;
    const x = clamp(this._petStartX + delta, -170, 170);
    this.setData({ x, rotation: clamp(delta / 12, -12, 12) });
    this.scheduleSettle();
  },

  releasePet() {
    recordInteractionEvent({
      type: 'pet_bag',
      title: '一起装进了猫包',
      thought: '刚刚被你带着晃了一圈，有点晕，但还挺有意思。',
      icon: '🎒',
    });
    wx.navigateBack();
  },
});

