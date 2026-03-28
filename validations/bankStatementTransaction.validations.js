/**
 * Bank Statement Transaction Model Validations
 * Contains all validation rules and messages for BankStatementTransaction model
 */

module.exports = {
  utr: {
    required: [true, 'UTR is required']
  },
  amount: {
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  date: {
    required: [true, 'Transaction date is required']
  },
  description: {
    default: ''
  },
  bankName: {
    default: 'Unknown'
  },
  processed: {
    default: false
  }
};
