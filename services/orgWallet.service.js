/**
 * Org Wallet Service
 * NOTE: We do NOT maintain any separate numeric balance on Organization.
 * Org "wallet" is just another regular wallet in the existing Wallet system.
 * All movements go through wallet.service helpers only.
 */

const Organization = require('../models/Organization.model');
const walletService = require('./wallet.service');

/**
 * Resolve which user account acts as the org wallet.
 * For now we treat the org owner as the org wallet owner.
 */
const getOrgWalletUserId = async (orgId) => {
  const organization = await Organization.findById(orgId);
  if (!organization || !organization.isActive) {
    throw new Error('Organization not found');
  }
  if (!organization.ownerUserId) {
    throw new Error('Organization owner not configured');
  }
  return organization.ownerUserId.toString();
};

/**
 * Deposit from any user wallet into the org's wallet user.
 * Uses existing wallet service for both debit and credit.
 */
const depositToOrgFromUser = async (orgId, fromUserId, amount) => {
  if (!amount || amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  const orgWalletUserId = await getOrgWalletUserId(orgId);

  // If org owner himself is depositing, we don't need to move between accounts;
  // the GC is already in the org wallet account.
  if (fromUserId.toString() === orgWalletUserId) {
    return walletService.getWalletBalance(orgWalletUserId);
  }

  // 1) Deduct from depositor
  await walletService.deductBalance(
    fromUserId,
    amount,
    `Deposit to organization wallet`
  );

  // 2) Credit to org wallet user
  await walletService.addBalance(
    orgWalletUserId,
    amount,
    `Received deposit for organization wallet`,
    'success',
    'organization'
  );

  return walletService.getWalletBalance(orgWalletUserId);
};

/**
 * Check that org wallet has enough balance for a prize pool.
 * Does NOT change any balances; prize money is conceptually locked at this point.
 */
const lockOrgFundsForTournament = async (orgId, amount) => {
  if (!amount || amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  const orgWalletUserId = await getOrgWalletUserId(orgId);
  const wallet = await walletService.getWalletBalance(orgWalletUserId);
  if ((wallet.balanceINR || 0) < amount) {
    throw new Error('Insufficient organization wallet balance to fund prize pool');
  }
  return wallet;
};

/**
 * Spend org funds when prizes are distributed.
 * We burn GC from the org wallet user by deducting balance;
 * winners are still credited via walletService.addReward as usual.
 */
const spendLockedOrgFunds = async (orgId, amount) => {
  if (!amount || amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  const orgWalletUserId = await getOrgWalletUserId(orgId);
  const wallet = await walletService.getWalletBalance(orgWalletUserId);
  if ((wallet.balanceINR || 0) < amount) {
    throw new Error('Insufficient organization wallet balance while paying rewards');
  }

  // Deduct from org wallet user; history will show as "join"/deduct entry type.
  await walletService.deductBalance(
    orgWalletUserId,
    amount,
    'Organization prize pool payout'
  );

  return walletService.getWalletBalance(orgWalletUserId);
};

/**
 * Pay host from org wallet (optional helper).
 */
const payHostFromOrg = async (orgId, hostUserId, amount, description) => {
  if (!amount || amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  const orgWalletUserId = await getOrgWalletUserId(orgId);
  const wallet = await walletService.getWalletBalance(orgWalletUserId);
  if ((wallet.balanceINR || 0) < amount) {
    throw new Error('Insufficient organization wallet balance to pay host');
  }

  // Move GC from org wallet user to host wallet.
  await walletService.deductBalance(
    orgWalletUserId,
    amount,
    description || 'Host payment from organization'
  );

  await walletService.addBalance(
    hostUserId,
    amount,
    description || 'Host payment from organization',
    'success',
    'organization'
  );
};

module.exports = {
  depositToOrgFromUser,
  lockOrgFundsForTournament,
  spendLockedOrgFunds,
  payHostFromOrg
};


