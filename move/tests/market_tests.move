#[test_only]
module receipts::market_tests;

use receipts::market::{Self, Market, Config, ResolverCap, Ticket};
use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};

const ADMIN: address = @0xA;
const ALICE: address = @0xB;
const BOB: address = @0xC;
const CAROL: address = @0xD;
const SUI1: u64 = 1_000_000_000;
const CLOSE: u64 = 1_000_000;

fun setup(): (Scenario, Clock) {
    let mut s = ts::begin(ADMIN);
    market::init_for_testing(s.ctx());
    let mut clock = clock::create_for_testing(s.ctx());
    clock.set_for_testing(1_000);
    s.next_tx(ADMIN);
    {
        let cap = s.take_from_sender<ResolverCap>();
        market::create_market(
            &cap,
            b"pm:1".to_string(),
            b"Will it rain?".to_string(),
            b"culture".to_string(),
            b"polymarket".to_string(),
            vector[b"Yes".to_string(), b"No".to_string()],
            CLOSE,
            &clock,
            s.ctx(),
        );
        s.return_to_sender(cap);
    };
    (s, clock)
}

fun pick(s: &mut Scenario, clock: &Clock, who: address, outcome: u64, amount: u64) {
    s.next_tx(who);
    let mut m = s.take_shared<Market>();
    let config = s.take_shared<Config>();
    let pay = coin::mint_for_testing<SUI>(amount, s.ctx());
    let t = market::place(&mut m, &config, outcome, pay, b"h", clock, s.ctx());
    transfer::public_transfer(t, who);
    ts::return_shared(m);
    ts::return_shared(config);
}

fun resolve(s: &mut Scenario, clock: &Clock, winner: u64) {
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<ResolverCap>();
    let mut m = s.take_shared<Market>();
    let config = s.take_shared<Config>();
    market::resolve(&cap, &mut m, &config, winner, clock, s.ctx());
    s.return_to_sender(cap);
    ts::return_shared(m);
    ts::return_shared(config);
}

fun claim(s: &mut Scenario, who: address): u64 {
    s.next_tx(who);
    let mut m = s.take_shared<Market>();
    let mut t = s.take_from_sender<Ticket>();
    let c = market::claim(&mut m, &mut t, s.ctx());
    let v = c.value();
    transfer::public_transfer(c, who);
    s.return_to_sender(t);
    ts::return_shared(m);
    v
}

#[test]
fun winners_split_pot_minus_fee() {
    let (mut s, mut clock) = setup();
    pick(&mut s, &clock, ALICE, 0, SUI1);
    pick(&mut s, &clock, BOB, 0, 3 * SUI1);
    pick(&mut s, &clock, CAROL, 1, 4 * SUI1);
    clock.set_for_testing(CLOSE);
    resolve(&mut s, &clock, 0);

    // pot 8 SUI, fee 2% = 0.16, payout pot 7.84, winners hold 1/4 and 3/4
    assert_eq!(claim(&mut s, ALICE), 1_960_000_000);
    assert_eq!(claim(&mut s, BOB), 5_880_000_000);

    s.next_tx(ADMIN);
    let fee = s.take_from_sender<Coin<SUI>>();
    assert_eq!(fee.value(), 160_000_000);
    s.return_to_sender(fee);

    // ticket survives as a receipt, marked claimed
    s.next_tx(ALICE);
    let t = s.take_from_sender<Ticket>();
    assert!(market::ticket_claimed(&t));
    s.return_to_sender(t);

    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = market::ENothingToClaim)]
fun loser_cannot_claim() {
    let (mut s, mut clock) = setup();
    pick(&mut s, &clock, ALICE, 0, SUI1);
    pick(&mut s, &clock, CAROL, 1, SUI1);
    clock.set_for_testing(CLOSE);
    resolve(&mut s, &clock, 0);
    claim(&mut s, CAROL);
    abort
}

#[test, expected_failure(abort_code = market::EAlreadyClaimed)]
fun double_claim_fails() {
    let (mut s, mut clock) = setup();
    pick(&mut s, &clock, ALICE, 0, SUI1);
    clock.set_for_testing(CLOSE);
    resolve(&mut s, &clock, 0);
    claim(&mut s, ALICE);
    claim(&mut s, ALICE);
    abort
}

#[test]
fun nobody_on_winner_voids_and_refunds() {
    let (mut s, mut clock) = setup();
    pick(&mut s, &clock, ALICE, 1, 2 * SUI1);
    clock.set_for_testing(CLOSE);
    resolve(&mut s, &clock, 0);
    s.next_tx(ADMIN);
    {
        let m = s.take_shared<Market>();
        assert_eq!(market::status(&m), 2);
        ts::return_shared(m);
    };
    assert_eq!(claim(&mut s, ALICE), 2 * SUI1);
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = market::EClosed)]
fun cannot_pick_after_close() {
    let (mut s, mut clock) = setup();
    clock.set_for_testing(CLOSE);
    pick(&mut s, &clock, ALICE, 0, SUI1);
    abort
}

#[test, expected_failure(abort_code = market::ETooEarly)]
fun cannot_resolve_before_close() {
    let (mut s, clock) = setup();
    pick(&mut s, &clock, ALICE, 0, SUI1);
    resolve(&mut s, &clock, 0);
    abort
}

#[test, expected_failure(abort_code = market::EStakeTooSmall)]
fun dust_stake_rejected() {
    let (mut s, clock) = setup();
    pick(&mut s, &clock, ALICE, 0, 1);
    abort
}

#[test, expected_failure(abort_code = market::EBadOutcome)]
fun bad_outcome_rejected() {
    let (mut s, clock) = setup();
    pick(&mut s, &clock, ALICE, 7, SUI1);
    abort
}
