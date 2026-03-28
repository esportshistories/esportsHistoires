/**
 * Swagger Configuration
 * API Documentation for BooyahX Backend
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BooyahX Backend API',
      version: '1.0.0',
      description: 'Backend API documentation for BooyahX application with authentication, profile management, and health check endpoints.',
      contact: {
        name: 'BooyahX API Support',
      },
    },
    servers: [
      {
        url: 'https://api.gaminghuballday.buzz',
        description: 'Production server (API Base URL)',
      },
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
  },
  apis: ['./docs/swagger/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

