# FanZone — Question Lifecycle Diagram

## 1. Master Loop (15-second heartbeat)

```
 MatchDataManager.tick()  ← runs every 15 seconds
 │
 ├─ 1. scheduleTracker.refreshIfNeeded()     [every 30 min]
 │     └─ Fetch today's fixtures from API-Football
 │
 ├─ 2. Sleep/Wake check
 │     └─ Sleep if no matches for >2 hours
 │     └─ Wake if next kickoff <= 30 min
 │
 ├─ 3. pollFixtures()                         [every 15s, 1 API call]
 │     ├─ GET /fixtures?live=all
 │     ├─ For each tracked fixture:
 │     │   ├─ Broadcast score_update via WebSocket
 │     │   ├─ New match? → generateForPhase() ──────────► [QUESTION GENERATION]
 │     │   ├─ Period changed? → handlePeriodTransition() ► [HT/FT/2H LOGIC]
 │     │   └─ ensureQuestionsExist()                     ► [SAFETY NET]
 │     └─ Cleanup stale matches (missing >5 min)
 │
 ├─ 4. fetchMissingLineups()                  [on-demand, max 3 retries]
 │     └─ GET /fixtures/lineups/{id}
 │     └─ Parse strikers, midfielders, keeper → Redis
 │
 ├─ 5a. lockAllExpired()                      [every 15s, DB only]
 │      └─ For each live match:
 │          └─ questionResolver.lockExpiredQuestions()
 │              ├─ OPEN + closesAt < now → LOCKED
 │              └─ Open next PENDING question
 │
 ├─ 5b. pollEvents()                          [every 60s per match]
 │      └─ For each match with active questions:
 │          ├─ GET /fixtures/events/{id}
 │          ├─ Detect new events (slice from last count)
 │          ├─ Broadcast match_event via WebSocket
 │          ├─ tryResolveFromEvent() ───────────────────► [EVENT RESOLUTION]
 │          └─ If not resolved → generateFromEvent() ──► [EVENT-TRIGGERED Q]
 │
 ├─ 6. resolveExpiredTimers()                 [every 15s, DB only]
 │     └─ LOCKED + resolvesAt <= now → resolve with "No" option
 │
 ├─ 7. pollStats()                            [every 5-10 min per match]
 │     └─ GET /fixtures/statistics/{id}
 │     └─ Broadcast stats_update via WebSocket
 │
 └─ 8. pollStandings()                        [every 30 min]
       └─ GET /leagues/standings
```

## 2. Question Generation

```
 ┌──────────────────────────────────────────────────────┐
 │            TWO TRIGGERS FOR GENERATION                │
 ├──────────────────────────────────────────────────────┤
 │                                                      │
 │  A) PHASE CHANGE (scheduled)                         │
 │     ┌─────────────────────────────┐                  │
 │     │ pollFixtures() detects:     │                  │
 │     │  - New match kicks off      │                  │
 │     │  - Period transition        │                  │
 │     │  - ensureQuestionsExist()   │                  │
 │     └──────────┬──────────────────┘                  │
 │                ▼                                     │
 │     generateForPhase(fixtureId, elapsed, teams)      │
 │                │                                     │
 │                ▼                                     │
 │     scenarioEngine.onPhaseChange()                   │
 │       1. Determine phase from elapsed                │
 │       2. Check MAX_QUESTIONS (15) not reached        │
 │       3. Get used templates for this fixture         │
 │       4. Select templates for phase + difficulty     │
 │       5. Resolve variables ({home_team}, etc)        │
 │       6. Create questions:                           │
 │          Q1 → OPEN  (opensAt=now, closesAt=now+35s)  │
 │          Q2 → PENDING (opensAt=now, closesAt=now+40s)│
 │               ↑ PROBLEM: both get opensAt=now        │
 │                                                      │
 │  B) MATCH EVENT (reactive)                           │
 │     ┌────────────────────────────┐                   │
 │     │ pollEvents() detects:     │                   │
 │     │  - Goal scored            │                   │
 │     │  - Card shown             │                   │
 │     │  - Corner kick            │                   │
 │     │  - VAR review             │                   │
 │     │  - Substitution           │                   │
 │     └──────────┬────────────────┘                   │
 │                ▼                                     │
 │     generateFromEvent(fixtureId, event, teams)       │
 │       1. Check cooldown (45s between event Qs)       │
 │       2. Check MAX_QUESTIONS not reached             │
 │       3. Find template matching trigger + phase      │
 │       4. Create 1 question → OPEN                    │
 │                                                      │
 └──────────────────────────────────────────────────────┘
```

## 3. Phase Detection

```
 elapsed (minutes from API-Football)
 │
 ├─ period == 'HT'         → HALF_TIME
 ├─ elapsed <= 0            → PRE_MATCH
 ├─ elapsed <= 15           → EARLY_H1    (2 EASY questions)
 ├─ elapsed <= 35           → MID_H1      (2 MEDIUM questions)
 ├─ elapsed <= 45           → LATE_H1     (1 MEDIUM question)
 ├─ elapsed <= 60           → EARLY_H2    (2 MEDIUM questions)
 ├─ elapsed <= 75           → MID_H2      (2 HARD questions)
 └─ elapsed > 75            → LATE_H2     (2 HARD questions)

 Phase changes detected by:
   handlePeriodTransition() — when API period code changes (1H→HT→2H→FT)
   ensureQuestionsExist()   — every 60s safety net, generates if 0 OPEN/PENDING
   pollFixtures()           — on first detection of live match
```

## 4. Question State Machine

```
                    ┌──────────┐
                    │ PENDING  │  Created but not visible to users
                    └────┬─────┘
                         │
              opensAt <= now (checked every 15s in lockAllExpired)
              OR previous question resolved/locked
                         │
                         ▼
                    ┌──────────┐
                    │   OPEN   │  Visible, users can predict (30-60s window)
                    └────┬─────┘
                         │
              closesAt < now (checked every 15s in lockAllExpired)
                         │
                         ▼
                    ┌──────────┐
                    │  LOCKED  │  Answer window closed, waiting for result
                    └────┬─────┘
                         │
          ┌──────────────┼──────────────┬──────────────┐
          │              │              │              │
    Match event    Timer expired    Half-time      Full-time
    (goal/card/    (resolvesAt     (period=HT)    (period=FT)
     VAR/sub)      reached)
          │              │              │              │
          ▼              ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐
   │  RESOLVED  │ │  RESOLVED  │ │  RESOLVED  │ │ RESOLVED │
   │ (event)    │ │ (timeout→  │ │ (HT stats) │ │ (FT all) │
   │            │ │  "No" opt) │ │            │ │          │
   └────────────┘ └────────────┘ └────────────┘ └──────────┘

   Special cases:
   ┌──────────┐
   │  VOIDED  │  Condition impossible → refund 50 coins
   └──────────┘  (no goal for Q002/Q004, penalty cancelled for Q042, etc.)

   ┌──────────┐
   │  CLOSED  │  PENDING questions that never opened (phase passed)
   └──────────┘  (1H PENDING at half-time, all PENDING at full-time)
```

## 5. Period Transitions

```
 1H (first half running)
 │
 ├─→ HT (half-time whistle)
 │     ├─ questionResolver.onHalfTime()
 │     │   ├─ Fetch HT stats from API
 │     │   ├─ Resolve stat-based Qs (Q015 corners, Q050 possession, Q051 shots)
 │     │   ├─ Resolve Q031 (goals in H1), Q035 (score at 30'), Q046 (H1 stoppage)
 │     │   └─ Close all PENDING 1H-phase questions → CLOSED
 │     └─ generateForPhase(HALF_TIME)
 │         └─ Create 2 questions (Q030 momentum, Q008 first H2 goal, etc.)
 │
 ├─→ 2H (second half kicks off)
 │     └─ generateForPhase(elapsed=46)
 │         └─ Create 2 questions for EARLY_H2
 │
 └─→ FT / AET / PEN (match ends)
       └─ questionResolver.onFullTime()
           ├─ Fetch final stats + events from API
           ├─ Resolve ALL remaining OPEN/LOCKED questions
           │   ├─ Each template has specific FT resolution logic
           │   ├─ VOID where applicable (no goal, no sub, etc.)
           │   └─ Default to "No" option if no specific logic matches
           ├─ Close all PENDING → CLOSED
           └─ questionGenerator.cleanupFixture()
               └─ Clear scenario engine state for this match
```

## 6. Resolution Paths by Question Type

```
 ┌─────────────────────────────────────────────────────────────┐
 │                    RESOLUTION STRATEGY                       │
 ├─────────────┬───────────────────────────────────────────────┤
 │ AUTO        │ Resolved by match event OR at FT              │
 │             │ Q001 (goal→scorer), Q005 (goal→team),         │
 │             │ Q010 (card→red), Q022 (sub→team)              │
 ├─────────────┼───────────────────────────────────────────────┤
 │ TIMEOUT_    │ Auto-resolve after X minutes if no event      │
 │ DEFAULT     │ Q003 (10min→"No goal"), Q009 (15min→"No YC"), │
 │             │ Q014 (5min→"No corner"), Q018 (15min→"No VAR")│
 │             │ Timer set: resolvesAt = opensAt + timeoutMin   │
 │             │ Checked every 15s in resolveExpiredTimers()    │
 ├─────────────┼───────────────────────────────────────────────┤
 │ VOID cases  │ Question can't be resolved → refund 50 coins  │
 │             │ Q002/Q004 (no goal), Q012 (no card after),    │
 │             │ Q025 (no sub), Q036 (no assist), Q042 (VAR    │
 │             │ penalty cancelled), Q043 (home H1 sub), Q044  │
 │             │ (no sub in window)                             │
 └─────────────┴───────────────────────────────────────────────┘
```

## 7. Frontend ↔ Backend Communication

```
 BACKEND (15s tick)                          FRONTEND (Flutter)
 ──────────────────                          ──────────────────

 pollFixtures()
   └─ WS: score_update ──────────────────► LiveProvider updates score

 pollEvents()
   ├─ WS: match_event ──────────────────► Feed shows event
   ├─ WS: new_question ─────────────────► PredictProvider refreshes
   └─ WS: prediction_result ────────────► Show correct/wrong + coins

 pollStats()
   └─ WS: stats_update ─────────────────► Live screen stats

 GET /questions/active/{fixtureId} ◄──────  PredictProvider.loadQuestions()
   returns:                                  Called on:
     active: Question (OPEN)                   - Screen mount
     upcoming: Question[] (PENDING, max 3)     - Pull to refresh
     pendingResults: Question[] (LOCKED)       - After expireQuestion()
     resolved: Question[] (RESOLVED/VOIDED)    - After WS prediction_result
                                               - Poll every 5s after confirm

 POST /predictions ◄─────────────────────  User taps "Confirm"
   body: { questionId, optionId }
   response: { prediction, fanPcts, multipliers, isFirstPrediction }
```

## 8. Current Timing Problem

```
 CURRENT (all opensAt = now):

 Phase EARLY_H1 starts at minute 3:
   Q1: opensAt=03:00, closesAt=03:35  → OPEN immediately
   Q2: opensAt=03:00, closesAt=03:40  → PENDING, opens when Q1 locks
   
   Timeline:
   min 3:00 ──[Q1 35s]──3:35──[Q2 opens immediately]──[Q2 40s]──4:15──DONE
                                                                    │
                                                            Nothing until
                                                            min 15 (MID_H1)
                                                            = 11 min gap!

 PROPOSED (spaced within phase):

   Q1: opensAt=min 5,  closesAt=min 5:35
   Q2: opensAt=min 10, closesAt=min 10:40
   
   Timeline:
   min 3──wait──5:00──[Q1 35s]──5:35──wait──10:00──[Q2 40s]──10:40──wait──15:00
              2 min                      4.5 min                       4.3 min
                                                                         │
                                                                    MID_H1 starts

 Questions spread across full phase, ~5 min between questions.
```
