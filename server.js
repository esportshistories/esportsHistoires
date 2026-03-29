const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require(path.join(__dirname, 'config/swagger'));
const { HTTP_STATUS, SERVER, ENV, MESSAGES } = require(path.join(__dirname, 'constants'));
const connectMongoDB = require(path.join(__dirname, 'config/mongodb'));
const { attachResponseHelpers } = require(path.join(__dirname, 'utils/response.helper'));
const Logger = require(path.join(__dirname, 'utils/logger'));
const { generalRateLimiter, strictRateLimiter } = require(path.join(__dirname, 'middleware/rateLimit.middleware'));
const { generateCSRFToken, verifyCSRF } = require(path.join(__dirname, 'middleware/csrf.middleware'));

// Load .env file only in local development (when NODE_ENV is not set or is development)
// In production (Render), environment variables are set directly
const nodeEnv = process.env.NODE_ENV || ENV.DEVELOPMENT;
if (nodeEnv === ENV.DEVELOPMENT) {
  require('dotenv').config({ path: path.join(__dirname, `.env.${nodeEnv}`) });
}

/**
 * Validate JWT secrets on startup
 * Ensures JWT_SECRET is set and meets security requirements
 */
const validateJWTSecrets = () => {
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  const MIN_SECRET_LENGTH = 32;

  // Check if JWT_SECRET is set
  if (!JWT_SECRET || JWT_SECRET.trim() === '') {
    Logger.error('JWT_SECRET is not set. Please set JWT_SECRET environment variable.');
    process.exit(1);
  }

  // Check minimum length requirement
  if (JWT_SECRET.length < MIN_SECRET_LENGTH) {
    Logger.error(`JWT_SECRET is too short. Minimum length is ${MIN_SECRET_LENGTH} characters. Current length: ${JWT_SECRET.length}`);
    process.exit(1);
  }

  // If JWT_REFRESH_SECRET is explicitly set and different from JWT_SECRET, validate it too
  if (JWT_REFRESH_SECRET && JWT_REFRESH_SECRET !== JWT_SECRET) {
    if (JWT_REFRESH_SECRET.trim() === '') {
      Logger.error('JWT_REFRESH_SECRET is set but empty. Please set a valid JWT_REFRESH_SECRET or remove it to use JWT_SECRET.');
      process.exit(1);
    }
    if (JWT_REFRESH_SECRET.length < MIN_SECRET_LENGTH) {
      Logger.error(`JWT_REFRESH_SECRET is too short. Minimum length is ${MIN_SECRET_LENGTH} characters. Current length: ${JWT_REFRESH_SECRET.length}`);
      process.exit(1);
    }
  }

  Logger.info('JWT secrets validated successfully');
};

// Validate JWT secrets before proceeding
validateJWTSecrets();

const app = express();
const PORT = process.env.PORT || SERVER.DEFAULT_PORT;

// Trust proxy - Required when running behind a reverse proxy (like Render, Heroku, etc.)
// This allows Express to correctly identify client IPs from X-Forwarded-For header
// Important for rate limiting and security features
app.set('trust proxy', true);

// Security headers with Helmet
// Configure Helmet with appropriate settings for API and Swagger UI
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Swagger UI requires inline styles
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Swagger UI requires inline scripts and eval
      imgSrc: ["'self'", "data:", "https:"], // Allow images from data URIs and HTTPS
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resources for API
}));

// CORS Configuration - Support web and mobile apps
const getCorsOrigin = (origin, callback) => {
  // Mobile apps (APK/iOS) typically don't send Origin header or send null
  // Allow requests without origin (mobile apps, same-origin requests, Postman, etc.)
  // Explicitly handle null, undefined, and empty string origins
  if (!origin || origin === 'null' || origin === 'undefined') {
    return callback(null, true);
  }

  // Normalize origin (remove trailing slash, convert to lowercase for comparison)
  const normalizedOrigin = origin.trim().toLowerCase().replace(/\/$/, '');

  // Helper function to normalize and compare origins
  const isOriginAllowed = (allowedOrigin) => {
    const normalizedAllowed = allowedOrigin.trim().toLowerCase().replace(/\/$/, '');
    return normalizedOrigin === normalizedAllowed;
  };

  // Always allow the API's own origin (same-origin requests)
  const apiBaseUrl = process.env.NODE_ENV === ENV.PRODUCTION 
    ? SERVER.PRODUCTION_BASE_URL.toLowerCase().replace(/\/$/, '')
    : SERVER.BASE_URL.toLowerCase().replace(/\/$/, '');
  if (normalizedOrigin === apiBaseUrl) {
    return callback(null, true);
  }

  // If CORS_ORIGIN is set, use it (can be comma-separated for multiple origins)
  if (process.env.CORS_ORIGIN) {
    const allowedOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
    if (allowedOrigins.some(isOriginAllowed)) {
      return callback(null, true);
    }
  }
  
  // Check if origin matches production origins (regardless of NODE_ENV)
  // This handles cases where NODE_ENV might not be set correctly
  if (SERVER.PRODUCTION_CORS_ORIGINS.some(isOriginAllowed)) {
    return callback(null, true);
  }
  
  // Determine if we're in production by checking BASE_URL or NODE_ENV
  const isProduction = process.env.NODE_ENV === ENV.PRODUCTION || 
                       (process.env.BASE_URL && process.env.BASE_URL.includes('gaminghuballday.buzz'));
  
  if (isProduction) {
    // Allow localhost in production if explicitly enabled (for development/testing)
    if (process.env.ALLOW_LOCALHOST_IN_PRODUCTION === 'true' && 
        (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:'))) {
      return callback(null, true);
    }
    
    // Log rejected origin in production for debugging
    Logger.warn('CORS rejected origin in production', { origin, normalizedOrigin, nodeEnv: process.env.NODE_ENV, baseUrl: process.env.BASE_URL, allowed: process.env.CORS_ORIGIN || SERVER.PRODUCTION_CORS_ORIGINS.join(', ') });
  } else {
    // Development: Allow localhost
    if (normalizedOrigin === SERVER.DEFAULT_CORS_ORIGIN.toLowerCase() || 
        normalizedOrigin.startsWith('http://localhost:') || 
        normalizedOrigin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Log rejected origin in development for debugging
    Logger.warn('CORS rejected origin in development', { origin, normalizedOrigin, nodeEnv: process.env.NODE_ENV, baseUrl: process.env.BASE_URL });
  }

  // Reject origin not in allowed list
  callback(new Error('Not allowed by CORS'));
};

// CORS configuration object - used for both regular requests and preflight OPTIONS requests
const corsOptions = {
  origin: getCorsOrigin,
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-CSRF-Token', 'XSRF-Token'],
  exposedHeaders: ['Authorization', 'X-CSRF-Token'], // Expose CSRF token header so frontend can read it
  optionsSuccessStatus: 200, // Some legacy browsers (IE11) choke on 204
  preflightContinue: false, // Let cors handle preflight, don't pass to next middleware
  // Explicitly handle null origin for credentials
  // When origin is null, credentials are still allowed (for mobile apps, Postman, etc.)
};

app.use(cors(corsOptions));

// Explicitly handle OPTIONS preflight requests to prevent redirects
app.options('*', cors(corsOptions));

// Parse cookies
app.use(cookieParser());

// Razorpay webhook signature verification requires raw JSON body.
// This must run BEFORE express.json() so req.body stays a Buffer on that route.
app.use((req, res, next) => {
  const url = req.originalUrl || req.url || '';
  if (req.method === 'POST' && url.includes('/api/payment/razorpay/webhook')) {
    return express.raw({ type: 'application/json' })(req, res, next);
  }
  return next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(attachResponseHelpers);

// Static uploads (e.g. profile images, statements)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// CSRF Protection
// Generate CSRF token on safe requests (GET, HEAD, OPTIONS) to provide token to clients
// Verify CSRF token on state-changing requests (POST, PUT, DELETE, PATCH)
// Can be disabled by setting DISABLE_CSRF=true in environment
// Additionally, CSRF is automatically disabled in local development to simplify Swagger/Postman usage.
// Note: Clients must make a GET request first to obtain CSRF token, then include it in X-CSRF-Token header for state-changing requests
// Google login is exempt from CSRF as OAuth redirects make it difficult to obtain token, and Google token verification provides security
const CSRF_ENABLED = process.env.DISABLE_CSRF !== 'true' && nodeEnv !== ENV.DEVELOPMENT;
if (CSRF_ENABLED) {
  // Verify CSRF token on state-changing requests
  app.use('/api', (req, res, next) => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    
    // Exempt Google login from CSRF (OAuth flow makes it difficult to get token first)
    const isGoogleLogin = req.path === '/auth/google-login' && req.method === 'POST';
    
    if (safeMethods.includes(req.method)) {
      // Generate token for safe methods
      return generateCSRFToken(req, res, next);
    }
    
    // Skip CSRF verification for Google login
    if (isGoogleLogin) {
      return next();
    }

    // Razorpay webhook (server-to-server, no CSRF token)
    const url = `${req.originalUrl || ''}${req.path || ''}`;
    if (req.method === 'POST' && url.includes('/payment/razorpay/webhook')) {
      return next();
    }
    
    // Verify token for state-changing methods
    return verifyCSRF(req, res, next);
  });
}

// Apply general rate limiting to all API routes (except health check)
app.use('/api', generalRateLimiter);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'BooyahX API Documentation',
}));

app.use('/health', require(path.join(__dirname, 'routes/health.routes')));

// Apply strict rate limiting to sensitive routes (auth, wallet, admin)
app.use('/api/auth', strictRateLimiter, require(path.join(__dirname, 'routes/auth.routes')));
app.use('/api/wallet', strictRateLimiter, require(path.join(__dirname, 'routes/wallet.routes')));
app.use('/api/admin', strictRateLimiter, require(path.join(__dirname, 'routes/admin.routes')));
// Apply strict rate limiting to sensitive routes (profile, tournament, host, payment)
app.use('/api/profile', strictRateLimiter, require(path.join(__dirname, 'routes/profile.routes')));
// OSM Nominatim reverse proxy (address map picker) — own per-IP limiter inside routes
app.use('/api/geocode', require(path.join(__dirname, 'routes/geocode.routes')));
app.use('/api/me', strictRateLimiter, require(path.join(__dirname, 'routes/me.routes')));
app.use('/api/tournament', strictRateLimiter, require(path.join(__dirname, 'routes/tournament.routes')));
// Unified lobby API (paid + sponsored)
app.use('/api/lobby', strictRateLimiter, require(path.join(__dirname, 'routes/lobby.routes')));
app.use('/api/host', strictRateLimiter, require(path.join(__dirname, 'routes/host.routes')));
app.use('/api', strictRateLimiter, require(path.join(__dirname, 'routes/org.routes')));
app.use('/api/payment', strictRateLimiter, require(path.join(__dirname, 'routes/payment.routes')));
// Special (sponsored) tournament routes — free-entry multi-round tournaments
app.use('/api/special-tournament', strictRateLimiter, require(path.join(__dirname, 'routes/specialTournament.routes')));
// Inquiry routes (public endpoint for submission, admin routes are in admin.routes.js)
app.use('/api/inquiry', require(path.join(__dirname, 'routes/inquiry.routes')));
// Support routes (FAQs and support tickets)
app.use('/api/support', require(path.join(__dirname, 'routes/support.routes')));
// Antihack proxy (Garena FF ban-check for frontend)
app.use('/api/antihack', require(path.join(__dirname, 'routes/antihack.routes')));

app.use((req, res, next) => {
  // Check if response helpers are attached
  if (res.notFound) {
    return res.notFound(MESSAGES.ERROR.ROUTE_NOT_FOUND);
  }
  // Fallback if helpers not attached
  return res.status(HTTP_STATUS.NOT_FOUND).json({
    status: HTTP_STATUS.NOT_FOUND,
    success: false,
    message: MESSAGES.ERROR.ROUTE_NOT_FOUND
  });
});

app.use((err, req, res, next) => {
  Logger.error('Unhandled error in Express middleware', err);
  
  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    const origin = req.headers.origin || 'No origin header';
    Logger.warn('CORS Error', {
      origin,
      path: req.path,
      method: req.method
    });
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      status: HTTP_STATUS.FORBIDDEN,
      success: false,
      message: `CORS: Origin not allowed. Origin: ${origin}. Please ensure your frontend origin is in the allowed list.`
    });
  }
  
  // Check if response helpers are attached
  if (res.error) {
    return res.error(err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message || MESSAGES.ERROR.INTERNAL_ERROR, null, err);
  }
  
  // Fallback if helpers not attached
  const statusCode = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const response = {
    status: statusCode,
    success: false,
    message: err.message || MESSAGES.ERROR.INTERNAL_ERROR
  };
  
  if (process.env.NODE_ENV === ENV.DEVELOPMENT && err) {
    response.error = err.message || err;
  }
  
  return res.status(statusCode).json(response);
});

// Only start server if not in test mode (tests will handle their own connections)
if (nodeEnv !== 'test') {
  (async () => {
    try {
      await connectMongoDB();
      Logger.info('MongoDB connected successfully');
      
      // Create HTTP server and initialize WebSocket
      const http = require('http');
      const server = http.createServer(app);
      const { initializeWebSocket } = require(path.join(__dirname, 'services/websocket.service'));
      initializeWebSocket(server);
      
      // Initialize scheduler (event-driven, no cron jobs)
      const { initializeScheduler } = require(path.join(__dirname, 'services/scheduler.service'));
      initializeScheduler();

      const wh = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
      if (wh.startsWith('http://') || wh.startsWith('https://')) {
        Logger.warn(
          'RAZORPAY_WEBHOOK_SECRET looks like a URL. Use the signing secret from Razorpay Dashboard → Webhooks (not your API base URL). Top-up verify will fail until fixed.'
        );
      }

      server.listen(PORT, () => {
        const environment = process.env.NODE_ENV || ENV.DEVELOPMENT;
        Logger.info('Server running', { port: PORT, environment });
        Logger.info('WebSocket server initialized for real-time tournament updates');
        Logger.info('Scheduler initialized (event-driven tournament status management)');
      });
    } catch (error) {
      Logger.error('Failed to start server', error);
      process.exit(1);
    }
  })();
}

process.on('SIGTERM', () => {
  Logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

module.exports = app;

