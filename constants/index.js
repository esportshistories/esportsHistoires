/**
 * Application constants - re-exports from modules
 * require('../constants') or require('../constants').X resolve here
 */

const http = require('./http');
const messages = require('./messages');
const server = require('./server');
const game = require('./game');
const validation = require('./validation');

module.exports = {
  ...http,
  ...messages,
  ...server,
  ...game,
  ...validation
};
