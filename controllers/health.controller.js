const path = require('path');
const { HTTP_STATUS, ENV } = require(path.join(__dirname, '../constants'));
const { asyncHandler } = require(path.join(__dirname, '../utils/response.helper'));

const healthCheck = asyncHandler(async (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'OK',
    message: 'BooyahX Backend is running',
    environment: process.env.NODE_ENV || ENV.DEVELOPMENT,
    timestamp: new Date().toISOString()
  });
});

module.exports = { healthCheck };

