/**
 * Cloudinary — image upload + delivery URLs (profile avatars, etc.).
 *
 * Set CLOUDINARY_ENABLED=true and CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 * CLOUDINARY_API_SECRET. Optional: CLOUDINARY_UPLOAD_FOLDER (default booyahx/avatars).
 */

const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;

let appliedConfig = false;

const getConfig = () => {
  const enabled = process.env.CLOUDINARY_ENABLED === 'true';
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  const uploadFolder = (process.env.CLOUDINARY_UPLOAD_FOLDER || 'booyahx/avatars').replace(/^\/+|\/+$/g, '');
  return { enabled, cloudName, apiKey, apiSecret, uploadFolder };
};

const isConfigured = () => {
  const c = getConfig();
  return c.enabled && c.cloudName && c.apiKey && c.apiSecret;
};

const ensureSdkConfigured = () => {
  if (appliedConfig) return;
  const { cloudName, apiKey, apiSecret } = getConfig();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary cloud name / API key / secret missing');
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  appliedConfig = true;
};

/**
 * Upload a local file to Cloudinary.
 * @param {string} localPath - absolute path on disk
 * @param {{ folder?: string, publicId?: string }} [options]
 * @returns {Promise<object>} Cloudinary upload API result (secure_url, public_id, etc.)
 */
const uploadImageFromPath = async (localPath, options = {}) => {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_ENABLED=true and credentials.');
  }
  ensureSdkConfigured();
  const { uploadFolder } = getConfig();
  const folder = options.folder !== undefined ? options.folder : uploadFolder;
  const publicId = options.publicId;
  return cloudinary.uploader.upload(localPath, {
    resource_type: 'image',
    folder: folder || undefined,
    public_id: publicId || undefined,
    overwrite: true,
    ...(options.extra || {})
  });
};

/**
 * Upload an image from memory (no local disk path).
 * @param {Buffer} buffer
 * @param {{ folder?: string, publicId?: string, extra?: object }} [options]
 */
const uploadImageFromBuffer = async (buffer, options = {}) => {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_ENABLED=true and credentials.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid image buffer');
  }
  ensureSdkConfigured();
  const { uploadFolder } = getConfig();
  const folder = options.folder !== undefined ? options.folder : uploadFolder;
  const publicId = options.publicId;
  const uploadOptions = {
    resource_type: 'image',
    folder: folder || undefined,
    public_id: publicId || undefined,
    overwrite: true,
    ...(options.extra || {})
  };
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    Readable.from(buffer).pipe(stream);
  });
};

/** True if publicId is an avatar we issued for this user (folder/avatar-{userId}-timestamp). */
const isProfileAvatarPublicIdForUser = (publicId, userId) => {
  const { uploadFolder, enabled } = getConfig();
  if (!enabled) return false;
  const uid = String(userId || '').trim();
  const pid = String(publicId || '').trim();
  if (!uid || !pid || pid.includes('..')) return false;
  const prefix = `${uploadFolder}/avatar-${uid}-`;
  return pid.startsWith(prefix);
};

/**
 * Upload from a remote URL (e.g. migration or admin import).
 * @param {string} remoteUrl
 * @param {{ folder?: string, publicId?: string, extra?: object }} [options]
 */
const uploadImageFromUrl = async (remoteUrl, options = {}) => {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_ENABLED=true and credentials.');
  }
  ensureSdkConfigured();
  const { uploadFolder } = getConfig();
  const folder = options.folder !== undefined ? options.folder : uploadFolder;
  return cloudinary.uploader.upload(remoteUrl, {
    resource_type: 'image',
    folder: folder || undefined,
    public_id: options.publicId || undefined,
    overwrite: true,
    ...(options.extra || {})
  });
};

/**
 * Build a transformed delivery URL for an existing public_id (includes folder path).
 * Example: buildDeliveryUrl('booyahx/avatars/avatar-user123', { fetch_format: 'auto', quality: 'auto' })
 * @param {string} publicIdWithFolder
 * @param {Record<string, unknown>} [transformOptions]
 */
const buildDeliveryUrl = (publicIdWithFolder, transformOptions = {}) => {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured');
  }
  ensureSdkConfigured();
  return cloudinary.url(publicIdWithFolder, { secure: true, ...transformOptions });
};

module.exports = {
  getConfig,
  isConfigured,
  uploadImageFromPath,
  uploadImageFromBuffer,
  uploadImageFromUrl,
  buildDeliveryUrl,
  isProfileAvatarPublicIdForUser
};
