/**
 * Host Application Model Validations
 * Contains all validation rules and messages for HostApplication model
 */

module.exports = {
  tournamentId: {
    required: [true, 'Tournament ID is required']
  },
  hostId: {
    required: [true, 'Host ID is required']
  },
  status: {
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
};
