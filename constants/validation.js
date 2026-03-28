/**
 * Validation, rate limits, OTP, payment and related config
 * Uses parseIntEnv for env-backed values; API_RATE_LIMITS STRICT/VERY_STRICT defaults fixed per plan
 */

const parseIntEnv = (envVar, defaultValue) => {
  const parsed = parseInt(envVar);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const GENDER_OPTIONS = ['male', 'female', 'other', 'prefer_not_to_say'];

const AGE = { MIN: 13, MAX: 120 };

/** Max saved addresses per user (delivery / map picker). */
const MAX_SAVED_ADDRESSES = parseIntEnv(process.env.MAX_SAVED_ADDRESSES, 5);

const PASSWORD_VALIDATION = {
  REGEX: /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/,
  MIN_LENGTH: 8,
  MESSAGE: 'Password must be at least 8 characters long with at least one capital letter, one number, and one special character'
};

const OTP_LIMITS = {
  MAX_REQUESTS_PER_EMAIL: parseIntEnv(process.env.OTP_MAX_REQUESTS_PER_EMAIL, 5),
  MAX_REQUESTS_PER_IP: parseIntEnv(process.env.OTP_MAX_REQUESTS_PER_IP, 20),
  RESEND_COOLDOWN_SECONDS: parseIntEnv(process.env.OTP_RESEND_COOLDOWN, 60),
  MAX_RESEND_ATTEMPTS: parseIntEnv(process.env.OTP_MAX_RESEND_ATTEMPTS, 3),
  MAX_VERIFICATION_ATTEMPTS: parseIntEnv(process.env.OTP_MAX_VERIFICATION_ATTEMPTS, 5),
  FAILED_ATTEMPTS_COOLDOWN_MS: 4 * 60 * 60 * 1000,
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000
};

const API_RATE_LIMITS = {
  GENERAL: {
    windowMs: 15 * 60 * 1000,
    max: parseIntEnv(process.env.API_RATE_LIMIT_GENERAL, 100),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  },
  // 20 per 15 min
  STRICT: {
    windowMs: 15 * 60 * 1000,
    max: parseIntEnv(process.env.API_RATE_LIMIT_STRICT, 20),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  },
  // 5 per 15 min
  VERY_STRICT: {
    windowMs: 15 * 60 * 1000,
    max: parseIntEnv(process.env.API_RATE_LIMIT_VERY_STRICT, 5),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  },
  /** Per-IP cap for GET /api/geocode/reverse (Nominatim abuse prevention; still respect global 1 req/s upstream). */
  GEOCODE: {
    windowMs: 60 * 1000,
    max: parseIntEnv(process.env.API_RATE_LIMIT_GEOCODE_PER_MIN, 45),
    message: 'Too many geocode requests. Try again in a minute.',
    standardHeaders: true,
    legacyHeaders: false
  }
};

const PAYMENT = {
  QR_CODE_EXPIRY_MS: 10 * 60 * 1000,
  MAX_AUTO_VERIFY_AMOUNT: parseFloat(process.env.MAX_AUTO_VERIFY_AMOUNT || '5'),
  MIN_AMOUNT_INR: 1,
  UTR: { MIN_LENGTH: 8, MAX_LENGTH: 20 },
  QR_CODE_RATE_LIMIT: parseInt(process.env.QR_CODE_RATE_LIMIT || '10'),
  EMAIL_PARSING_INTERVAL: parseInt(process.env.EMAIL_PARSING_INTERVAL || '2'),
  AUTO_VERIFY_ENABLED: process.env.AUTO_VERIFY_PAYMENTS === 'false' ? false : true,
  AMOUNT_TOLERANCE: parseFloat(process.env.AMOUNT_TOLERANCE || '0.01'),
  // UTR cron: only last UTR_CRON_WINDOW_MINUTES, current day, max UTR_CRON_CHECK_LIMIT checks per UTR; then admin manual
  UTR_CRON_CHECK_LIMIT: parseInt(process.env.UTR_CRON_CHECK_LIMIT || '5', 10),
  UTR_CRON_WINDOW_MINUTES: parseInt(process.env.UTR_CRON_WINDOW_MINUTES || '30', 10)
};

module.exports = {
  GENDER_OPTIONS,
  AGE,
  MAX_SAVED_ADDRESSES,
  PASSWORD_VALIDATION,
  OTP_LIMITS,
  API_RATE_LIMITS,
  PAYMENT
};
