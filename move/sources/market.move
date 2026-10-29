/// Receipts: parimutuel prediction markets settled in SUI.
///
/// Every pick mints a Ticket owned by the picker. The Ticket is the receipt:
/// it records the outcome, the stake, the clock time it was placed (always
/// before the market closed) and the hash of the reasoning written to Walrus
/// Memory. Tickets are never destroyed; claiming only flips `claimed`.
///
/// Resolution is done by the holder of the ResolverCap, mirroring the public
/// source named in `source` (Polymarket, ESPN, Pyth). If nobody backed the
/// winning outcome, or the event is cancelled, the market is voided and every
/// stake is refundable.
module receipts::market;

use std::string::String;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;

// === Errors ===

const EClosed: u64 = 0;
const EBadOutcome: u64 = 1;
const ENotSettled: u64 = 2;
const EWrongMarket: u64 = 3;
const ENothingToClaim: u64 = 4;
const ENotOpen: u64 = 5;
const EStakeTooSmall: u64 = 6;
const ETooEarly: u64 = 7;
const EFeeTooHigh: u64 = 8;
const EAlreadyClaimed: u64 = 9;
const ETooFewOutcomes: u64 = 10;
const EStakeTooLarge: u64 = 11;

// === Constants ===

const STATUS_OPEN: u8 = 0;
const STATUS_RESOLVED: u8 = 1;
const STATUS_VOID: u8 = 2;

const MAX_FEE_BPS: u64 = 500;
const BPS: u64 = 10_000;

// === Objects ===

/// Lets the holder create, resolve and void markets, and change config.
public struct ResolverCap has key, store { id: UID }

public struct Config has key {
    id: UID,
    fee_bps: u64,
    treasury: address,
    /// Smallest stake in MIST.
    min_stake: u64,
    /// Largest single stake in MIST. Keeps a demo on mainnet small.
    max_stake: u64,
}

public struct Market has key {
    id: UID,
    /// External id, e.g. "pm:516710" or "espn:740912".
    key: String,
    question: String,
    category: String,
    /// Where the answer comes from, e.g. "polymarket", "espn", "pyth".
    source: String,
    outcomes: vector<String>,
    closes_at_ms: u64,
    /// Total MIST staked per outcome, same order as `outcomes`.
    pools: vector<u64>,
    vault: Balance<SUI>,
    status: u8,
    winner: u64,
    /// Pot after fee, fixed at resolution. Payouts are pro-rata of this.
    payout_pot: u64,
    tickets: u64,
}

public struct Ticket has key, store {
    id: UID,
    market_id: ID,
    outcome: u64,
    stake: u64,
    placed_at_ms: u64,
    /// sha256 of the reasoning text stored in Walrus Memory. Empty if none.
    note_hash: vector<u8>,
    claimed: bool,
}

// === Events ===

public struct MarketCreated has copy, drop {
    market_id: ID,
    key: String,
    question: String,
    category: String,
    source: String,
    outcomes: vector<String>,
    closes_at_ms: u64,
}

public struct Placed has copy, drop {
    market_id: ID,
    ticket_id: ID,
    picker: address,
    outcome: u64,
    stake: u64,
    placed_at_ms: u64,
    note_hash: vector<u8>,
}

public struct Resolved has copy, drop {
    market_id: ID,
    winner: u64,
    total: u64,
    fee: u64,
}

public struct Voided has copy, drop {
    market_id: ID,
    total: u64,
}

public struct Claimed has copy, drop {
    market_id: ID,
    ticket_id: ID,
    picker: address,
    amount: u64,
}

// === Init ===

fun init(ctx: &mut TxContext) {
    transfer::transfer(ResolverCap { id: object::new(ctx) }, ctx.sender());
    transfer::share_object(Config {
        id: object::new(ctx),
        fee_bps: 200,
        treasury: ctx.sender(),
        min_stake: 10_000_000, // 0.01 SUI
        max_stake: 5_000_000_000, // 5 SUI
    });
}

// === Admin ===

public fun set_config(
    _: &ResolverCap,
    config: &mut Config,
    fee_bps: u64,
    treasury: address,
    min_stake: u64,
    max_stake: u64,
) {
    assert!(fee_bps <= MAX_FEE_BPS, EFeeTooHigh);
    config.fee_bps = fee_bps;
    config.treasury = treasury;
    config.min_stake = min_stake;
    config.max_stake = max_stake;
}

public fun create_market(
    _: &ResolverCap,
    key: String,
    question: String,
    category: String,
    source: String,
    outcomes: vector<String>,
    closes_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let n = outcomes.length();
    assert!(n >= 2, ETooFewOutcomes);
    assert!(closes_at_ms > clock.timestamp_ms(), EClosed);

    let mut pools = vector[];
    n.do!(|_| pools.push_back(0));

    let market = Market {
        id: object::new(ctx),
        key,
        question,
        category,
        source,
        outcomes,
        closes_at_ms,
        pools,
        vault: balance::zero(),
        status: STATUS_OPEN,
        winner: 0,
        payout_pot: 0,
        tickets: 0,
    };
    event::emit(MarketCreated {
        market_id: object::id(&market),
        key: market.key,
        question: market.question,
        category: market.category,
        source: market.source,
        outcomes: market.outcomes,
        closes_at_ms,
    });
    transfer::share_object(market);
}

/// Settle the market on `winner`. Voids instead if nobody backed the winner.
public fun resolve(
    _: &ResolverCap,
    market: &mut Market,
    config: &Config,
    winner: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_OPEN, ENotOpen);
    assert!(clock.timestamp_ms() >= market.closes_at_ms, ETooEarly);
    assert!(winner < market.outcomes.length(), EBadOutcome);

    let total = market.vault.value();
    if (market.pools[winner] == 0) {
        market.status = STATUS_VOID;
        event::emit(Voided { market_id: object::id(market), total });
        return
    };

    let fee = (((total as u128) * (config.fee_bps as u128) / (BPS as u128)) as u64);
    if (fee > 0) {
        let fee_coin = coin::from_balance(market.vault.split(fee), ctx);
        transfer::public_transfer(fee_coin, config.treasury);
    };
    market.status = STATUS_RESOLVED;
    market.winner = winner;
    market.payout_pot = total - fee;
    event::emit(Resolved { market_id: object::id(market), winner, total, fee });
}

/// Cancel the market (event called off, source ambiguous). Every stake refunds.
public fun void(_: &ResolverCap, market: &mut Market) {
    assert!(market.status == STATUS_OPEN, ENotOpen);
    market.status = STATUS_VOID;
    event::emit(Voided { market_id: object::id(market), total: market.vault.value() });
}

// === Picking ===

/// Stake `payment` on `outcome`. Returns the Ticket; the caller keeps it.
public fun place(
    market: &mut Market,
    config: &Config,
    outcome: u64,
    payment: Coin<SUI>,
    note_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Ticket {
    let now = clock.timestamp_ms();
    assert!(market.status == STATUS_OPEN, ENotOpen);
    assert!(now < market.closes_at_ms, EClosed);
    assert!(outcome < market.outcomes.length(), EBadOutcome);
    let stake = payment.value();
    assert!(stake >= config.min_stake, EStakeTooSmall);
    assert!(stake <= config.max_stake, EStakeTooLarge);

    market.vault.join(payment.into_balance());
    *&mut market.pools[outcome] = market.pools[outcome] + stake;
    market.tickets = market.tickets + 1;

    let ticket = Ticket {
        id: object::new(ctx),
        market_id: object::id(market),
        outcome,
        stake,
        placed_at_ms: now,
        note_hash,
        claimed: false,
    };
    event::emit(Placed {
        market_id: ticket.market_id,
        ticket_id: object::id(&ticket),
        picker: ctx.sender(),
        outcome,
        stake,
        placed_at_ms: now,
        note_hash: ticket.note_hash,
    });
    ticket
}

/// Pay out a winning ticket, or refund any ticket on a void market.
/// The Ticket survives as the receipt.
public fun claim(market: &mut Market, ticket: &mut Ticket, ctx: &mut TxContext): Coin<SUI> {
    assert!(ticket.market_id == object::id(market), EWrongMarket);
    assert!(!ticket.claimed, EAlreadyClaimed);
    let amount = payout_of(market, ticket);
    assert!(amount > 0, ENothingToClaim);

    ticket.claimed = true;
    event::emit(Claimed {
        market_id: ticket.market_id,
        ticket_id: object::id(ticket),
        picker: ctx.sender(),
        amount,
    });
    coin::from_balance(market.vault.split(amount), ctx)
}

// === Views ===

/// What `ticket` is worth right now (0 while open or if it lost).
public fun payout_of(market: &Market, ticket: &Ticket): u64 {
    if (ticket.claimed) return 0;
    if (market.status == STATUS_VOID) return ticket.stake;
    assert!(market.status == STATUS_RESOLVED, ENotSettled);
    if (ticket.outcome != market.winner) return 0;
    let winning_pool = market.pools[market.winner];
    (((ticket.stake as u128) * (market.payout_pot as u128) / (winning_pool as u128)) as u64)
}

public fun status(market: &Market): u8 { market.status }

public fun winner(market: &Market): u64 { market.winner }

public fun pools(market: &Market): vector<u64> { market.pools }

public fun closes_at_ms(market: &Market): u64 { market.closes_at_ms }

public fun ticket_outcome(ticket: &Ticket): u64 { ticket.outcome }

public fun ticket_stake(ticket: &Ticket): u64 { ticket.stake }

public fun ticket_claimed(ticket: &Ticket): bool { ticket.claimed }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
