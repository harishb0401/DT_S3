/**
 * Face Recognition Presence Tracking & Duplicate Prevention Service
 *
 * Implements:
 * 1. Per-student recognition lock during continuous camera appearance.
 * 2. Active in-frame tracking with configurable disappearance timeout.
 * 3. Lock release when student leaves camera frame.
 * 4. Configurable cooldown mechanism.
 * 5. Concurrent request deduplication (in-flight mutex).
 * 6. Database-level idempotency protection.
 * 7. Multi-student independence (Student A's presence does not block Student B).
 */

const TravelRecord = require('../models/TravelRecord');

class FaceLockService {
  constructor() {
    // Map of studentId (string) -> SessionData
    this.activeLocks = new Map();

    // In-flight processing lock to prevent race conditions from simultaneous requests
    this.inFlightScans = new Set();

    // Configurable timeouts (in milliseconds)
    // FACE_DISAPPEARANCE_TIMEOUT_MS: Time of absence before student is considered to have left the frame
    this.disappearanceTimeoutMs = parseInt(process.env.FACE_DISAPPEARANCE_TIMEOUT_MS || '7000', 10);

    // FACE_RECOGNITION_COOLDOWN_MS: Minimum safety cooldown between independent boardings for the same student
    this.cooldownMs = parseInt(process.env.FACE_COOLDOWN_MS || '15000', 10);

    // FACE_IDEMPOTENCY_WINDOW_MS: Window to check DB records for duplicates even after server restart
    this.idempotencyWindowMs = parseInt(process.env.FACE_IDEMPOTENCY_WINDOW_MS || '25000', 10);

    // Periodic cleanup of stale memory locks every 15 seconds
    this.cleanupTimer = setInterval(() => this.cleanupExpiredLocks(), 15000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Acquire mutex for a student during recognition processing
   */
  acquireInFlight(studentId) {
    const key = String(studentId);
    if (this.inFlightScans.has(key)) {
      return false; // Already processing
    }
    this.inFlightScans.add(key);
    return true;
  }

  /**
   * Release mutex for a student
   */
  releaseInFlight(studentId) {
    const key = String(studentId);
    this.inFlightScans.delete(key);
  }

  /**
   * Check whether this student has an active lock (continuous in-frame presence or cooldown)
   */
  async checkStudentPresenceLock(studentId, busId) {
    const key = String(studentId);
    const now = Date.now();

    // 1. Check in-memory active session
    const session = this.activeLocks.get(key);
    if (session) {
      const timeSinceLastSeen = now - session.lastSeenAt;
      const timeSinceRecorded = now - session.lastRecordedAt;

      // Condition 1: Student is still continuously visible in frame
      if (timeSinceLastSeen < this.disappearanceTimeoutMs) {
        // Refresh last seen timestamp
        session.lastSeenAt = now;
        return {
          isDuplicate: true,
          reason: 'continuous_presence',
          message: `Student is currently in camera frame (boarding already verified ${Math.round(timeSinceRecorded / 1000)}s ago).`,
          session,
        };
      }

      // Condition 2: Student disappeared, but within mandatory safety cooldown
      if (timeSinceRecorded < this.cooldownMs) {
        const remainingSec = Math.ceil((this.cooldownMs - timeSinceRecorded) / 1000);
        return {
          isDuplicate: true,
          reason: 'cooldown_active',
          message: `Student was recently recognized. Cooldown active (${remainingSec}s remaining).`,
          session,
        };
      }

      // Condition 3: Disappeared for > disappearanceTimeout AND cooldown elapsed -> lock released!
      this.activeLocks.delete(key);
    }

    // 2. Database-level idempotency protection
    // Check if a TravelRecord was recently created for this student on this bus
    try {
      const recentRecord = await TravelRecord.findOne({
        studentId,
        busId,
        timestamp: { $gte: new Date(now - this.idempotencyWindowMs) },
      }).sort({ timestamp: -1 });

      if (recentRecord) {
        const timeSinceRecent = now - new Date(recentRecord.timestamp).getTime();
        // Restore session lock in memory
        this.activeLocks.set(key, {
          studentId: key,
          busId: String(busId),
          firstSeenAt: new Date(recentRecord.timestamp).getTime(),
          lastSeenAt: now,
          lastRecordedAt: new Date(recentRecord.timestamp).getTime(),
          travelRecordId: recentRecord._id,
          feeStatus: recentRecord.feeStatusAtTime,
        });

        return {
          isDuplicate: true,
          reason: 'database_idempotent',
          message: `Boarding was already recorded in database ${Math.round(timeSinceRecent / 1000)}s ago.`,
          recentRecord,
        };
      }
    } catch (dbErr) {
      console.warn('DB idempotency check warning:', dbErr.message);
    }

    // Not a duplicate - clear to process!
    return {
      isDuplicate: false,
    };
  }

  /**
   * Record successful verification and establish active presence lock
   */
  recordStudentLock(studentId, busId, travelRecordId, feeStatus, cachedPayload = null) {
    const key = String(studentId);
    const now = Date.now();

    this.activeLocks.set(key, {
      studentId: key,
      busId: String(busId),
      firstSeenAt: now,
      lastSeenAt: now,
      lastRecordedAt: now,
      travelRecordId,
      feeStatus,
      cachedPayload,
    });
  }

  /**
   * Update presence for a student (e.g. heartbeat while in front of camera)
   */
  touchStudentPresence(studentId) {
    const key = String(studentId);
    const session = this.activeLocks.get(key);
    if (session) {
      session.lastSeenAt = Date.now();
    }
  }

  /**
   * Explicitly notify that camera frame has no faces or student has departed
   */
  handleFrameEmpty(busId) {
    // When no faces are present, the locks naturally expire when now - lastSeenAt > disappearanceTimeoutMs
  }

  /**
   * Release lock for a specific student manually if needed
   */
  releaseLock(studentId) {
    const key = String(studentId);
    this.activeLocks.delete(key);
  }

  /**
   * Clean up locks where student disappeared and cooldown has elapsed
   */
  cleanupExpiredLocks() {
    const now = Date.now();
    for (const [key, session] of this.activeLocks.entries()) {
      const departed = now - session.lastSeenAt >= this.disappearanceTimeoutMs;
      const cooldownElapsed = now - session.lastRecordedAt >= this.cooldownMs;
      if (departed && cooldownElapsed) {
        this.activeLocks.delete(key);
      }
    }
  }

  /**
   * Get active state summary (for monitoring / health check)
   */
  getStatus() {
    return {
      activeLocksCount: this.activeLocks.size,
      inFlightCount: this.inFlightScans.size,
      disappearanceTimeoutMs: this.disappearanceTimeoutMs,
      cooldownMs: this.cooldownMs,
    };
  }
}

const faceLockService = new FaceLockService();
module.exports = faceLockService;

