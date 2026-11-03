#!/usr/bin/env python3
"""Riippumaton FSRS-6-referenssitoteutus (py-fsrs-tyylinen) testien kultaisten arvojen laskemiseen.

Tarkoitus: js/fsrs.js kirjoitettiin erikseen samoista kaavoista. Tämä skripti laskee samat kertaussarjat
toisella kielellä ja toisella rakenteella, ja tests/fsrs.test.mjs vertaa tuloksia tiedostoon
tests/fsrs.golden.json. Ajo: python3 tools/fsrs_reference.py > tests/fsrs.golden.json
"""
import json
import math

W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
     0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
DECAY = -W[20]
FACTOR = 0.9 ** (1 / DECAY) - 1
S_MIN, S_MAX = 0.001, 36500.0


def jsround(x):
    return math.floor(x + 0.5)


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def retr(t, s):
    return (1 + FACTOR * t / s) ** DECAY


def interval(s, retention):
    return int(clamp(jsround((s / FACTOR) * (retention ** (1 / DECAY) - 1)), 1, 36500))


def init_d(g, do_clamp=True):
    d = W[4] - math.exp(W[5] * (g - 1)) + 1
    return clamp(d, 1, 10) if do_clamp else d


def next_d(d, g):
    delta = -W[6] * (g - 3)
    nd = d + (10 - d) * delta / 9
    nd = W[7] * init_d(4, False) + (1 - W[7]) * nd
    return clamp(nd, 1, 10)


def recall_s(d, s, r, g):
    hp = W[15] if g == 2 else 1
    eb = W[16] if g == 4 else 1
    return clamp(s * (1 + math.exp(W[8]) * (11 - d) * s ** -W[9] * (math.exp((1 - r) * W[10]) - 1) * hp * eb), S_MIN, S_MAX)


def forget_s(d, s, r):
    lt = W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * math.exp((1 - r) * W[14])
    st = s / math.exp(W[17] * W[18])
    return clamp(min(lt, st), S_MIN, S_MAX)


def short_s(s, g):
    inc = math.exp(W[17] * (g - 3 + W[18])) * s ** -W[19]
    if g >= 3:
        inc = max(inc, 1.0)
    return clamp(s * inc, S_MIN, S_MAX)


def step(card, g, today):
    """Palauttaa (stability, difficulty, state, lapses) valitulle arvosanalle."""
    if card is None:
        return clamp(W[g - 1], S_MIN, S_MAX), init_d(g), (1 if g == 1 else 2), 0
    t = max(0, today - card["last_day"])
    nd = next_d(card["difficulty"], g)
    if t < 1:
        ns = short_s(card["stability"], g)
    else:
        r = retr(t, card["stability"])
        ns = forget_s(card["difficulty"], card["stability"], r) if g == 1 else recall_s(card["difficulty"], card["stability"], r, g)
    lapses = card["lapses"]
    state = 2
    if g == 1:
        lapses += 1
        state = 1 if card["state"] == 1 else 3
    return ns, nd, state, lapses


def run(sequence, retention):
    card = None
    out = []
    for today, g in sequence:
        raw = {k: step(card, k, today) for k in (1, 2, 3, 4)}
        iv = {k: interval(raw[k][0], retention) for k in raw}
        hard = min(iv[2], iv[3])
        again = min(iv[1], hard)
        good = max(iv[3], hard + 1)
        easy = max(iv[4], good + 1)
        hard = min(hard, good)
        chosen = {1: again, 2: hard, 3: good, 4: easy}[g]
        s, d, state, lapses = raw[g]
        card = {"stability": s, "difficulty": d, "state": state, "lapses": lapses, "last_day": today}
        out.append({
            "day": today, "rating": g, "stability": s, "difficulty": d, "state": state, "lapses": lapses,
            "interval": chosen, "dueDay": today + chosen,
            "buttons": {"1": again, "2": hard, "3": good, "4": easy},
        })
    return out


CASES = {
    "steady_good": {"retention": 0.9, "sequence": [[0, 3], [2, 3], [7, 3], [20, 3], [52, 3], [130, 3]]},
    "mixed": {"retention": 0.9, "sequence": [[0, 3], [2, 3], [7, 2], [20, 3], [40, 1], [40, 3], [41, 4], [50, 3], [90, 4]]},
    "starts_again": {"retention": 0.9, "sequence": [[0, 1], [0, 1], [0, 3], [1, 3], [3, 3], [9, 2], [20, 3]]},
    "retention_95": {"retention": 0.95, "sequence": [[0, 3], [1, 3], [3, 3], [8, 3], [20, 4]]},
    "retention_80": {"retention": 0.8, "sequence": [[0, 3], [3, 3], [11, 3], [40, 3], [150, 3]]},
}

if __name__ == "__main__":
    result = {"w": W, "cases": {k: {"retention": v["retention"], "steps": run(v["sequence"], v["retention"])} for k, v in CASES.items()}}
    print(json.dumps(result, indent=1))
