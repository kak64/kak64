// BuildCheck AI — shared constants: states, mandatory pre-checks, button ids.

/**
 * Strict sequential inspection states (Section 5.3).
 * PRE_CHECK_GATE -> LASER_CALIBRATION -> STATION_INSPECTION -> SLOPE_CHECK -> APPROVAL
 * Terminal additions: APPROVED (room signed off), HALTED (a mandatory pre-check failed).
 */
export const STATES = Object.freeze({
  PRE_CHECK_GATE: 'PRE_CHECK_GATE',
  LASER_CALIBRATION: 'LASER_CALIBRATION',
  STATION_INSPECTION: 'STATION_INSPECTION',
  SLOPE_CHECK: 'SLOPE_CHECK',
  APPROVAL: 'APPROVAL',
  APPROVED: 'APPROVED',
  HALTED: 'HALTED',
});

/**
 * The 5 mandatory pre-conditions (תנאי סף) from Section 1.
 * ALL must be answered "yes" before an inspection may start.
 */
export const PRE_CHECKS = Object.freeze([
  Object.freeze({
    id: 'risers_pressure',
    title: 'רייזרים ולחץ מים',
    question: 'האם הרייזרים מחוברים למשאבה זמנית ונמצאים בלחץ מים רציף?',
  }),
  Object.freeze({
    id: 'subcontractors_done',
    title: 'סיום קבלני משנה',
    question: 'האם קבלני חשמל, מיזוג ושאר קבלני המשנה סיימו את עבודתם ופינו את הקומה?',
  }),
  Object.freeze({
    id: 'clean_floor',
    title: 'קומה נקייה',
    question: 'האם הקומה כולה נקייה ומטואטאת במטאטא?',
  }),
  Object.freeze({
    id: 'pipes_plugged',
    title: 'מניעת חצץ ואבנים',
    question: 'האם וידאת שכל פתחי וקצוות הצינורות פקוקים ואטומים למניעת חדירת חצץ/אבנים למערכת?',
  }),
  Object.freeze({
    id: 'updated_plans',
    title: 'תוכניות שינויים מעודכנות',
    question: 'האם הודפסה ונמסרה לקבלן תוכנית שינויי דיירים מעודכנת (גג יום אחד לפני הביצוע)?',
  }),
]);

/** Kinds of station checks the engine knows how to evaluate. */
export const CHECK_KINDS = Object.freeze({
  /** Offset measured from the RAW wall; plaster+ceramic allowance is added. */
  WALL_OFFSET: 'wall_offset',
  /** Offset whose target already includes plaster (finished dimension). */
  FINISHED_OFFSET: 'finished_offset',
  /** Height from the finished floor; verified via the 1m laser datum line. */
  HEIGHT: 'height',
  /** X/Y center coordinates (e.g. shower drain 42x45). */
  POSITION: 'position',
  /** Verified visually against the PDF plan (no fixed numeric target). */
  PLAN_CHECK: 'plan_check',
});

/** Action-button ids rendered by the interactive UI (Section 5.4). */
export const BUTTONS = Object.freeze({
  SUBMIT_PRECHECKS: 'submit_prechecks',
  RESTART: 'restart',
  LASER_READY: 'laser_ready',
  STATION_OK: 'station_ok',
  STATION_REPORT: 'station_report',
  SLOPES_OK: 'slopes_ok',
  SLOPES_SUBMIT: 'slopes_submit',
  APPROVE: 'approve',
  APPROVE_OVERRIDE: 'approve_override',
});
