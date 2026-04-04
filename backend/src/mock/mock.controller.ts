import { Controller, Post, Logger, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { QuestionsService } from '../questions/questions.service';

// ── Mock Fixture IDs ──
const MOCK_IDS = [99001, 99002, 99003];

// ── Mock Fixtures (API-Football format) ──
const MOCK_FIXTURES_LIVE = [
  {
    fixture: { id: 99001, date: new Date().toISOString(), status: { short: '2H', elapsed: 67 } },
    league: { id: 2, name: 'Champions League', logo: 'https://media.api-sports.io/football/leagues/2.png', round: 'Round of 16' },
    teams: {
      home: { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' },
      away: { id: 157, name: 'Bayern Munich', logo: 'https://media.api-sports.io/football/teams/157.png' },
    },
    goals: { home: 2, away: 1 },
    score: { halftime: { home: 1, away: 1 }, fulltime: { home: null, away: null } },
  },
  {
    fixture: { id: 99002, date: new Date().toISOString(), status: { short: '1H', elapsed: 34 } },
    league: { id: 140, name: 'La Liga', logo: 'https://media.api-sports.io/football/leagues/140.png', round: 'Regular Season - 30' },
    teams: {
      home: { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' },
      away: { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' },
    },
    goals: { home: 1, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
  {
    fixture: { id: 99003, date: new Date().toISOString(), status: { short: '1H', elapsed: 12 } },
    league: { id: 39, name: 'Premier League', logo: 'https://media.api-sports.io/football/leagues/39.png', round: 'Regular Season - 32' },
    teams: {
      home: { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' },
      away: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
    },
    goals: { home: 0, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
];

const MOCK_FIXTURES_TODAY = [
  {
    fixture: {
      id: 99004,
      date: (() => { const d = new Date(); d.setHours(20, 0, 0, 0); return d.toISOString(); })(),
      status: { short: 'NS', elapsed: null },
    },
    league: { id: 39, name: 'Premier League', logo: 'https://media.api-sports.io/football/leagues/39.png', round: 'Regular Season - 32' },
    teams: {
      home: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
      away: { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' },
    },
    goals: { home: 0, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
  {
    fixture: {
      id: 99005,
      date: (() => { const d = new Date(); d.setHours(21, 45, 0, 0); return d.toISOString(); })(),
      status: { short: 'NS', elapsed: null },
    },
    league: { id: 135, name: 'Serie A', logo: 'https://media.api-sports.io/football/leagues/135.png', round: 'Regular Season - 31' },
    teams: {
      home: { id: 496, name: 'Juventus', logo: 'https://media.api-sports.io/football/teams/496.png' },
      away: { id: 489, name: 'AC Milan', logo: 'https://media.api-sports.io/football/teams/489.png' },
    },
    goals: { home: 0, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
];

// ── Mock Statistics (API-Football format) ──
const MOCK_STATS: Record<number, any[]> = {
  99001: [
    { team: { id: 50 }, statistics: [
      { type: 'Ball Possession', value: '58%' }, { type: 'Total Shots', value: '14' },
      { type: 'Yellow Cards', value: '1' }, { type: 'Corner Kicks', value: '4' },
    ]},
    { team: { id: 157 }, statistics: [
      { type: 'Ball Possession', value: '42%' }, { type: 'Total Shots', value: '7' },
      { type: 'Yellow Cards', value: '2' }, { type: 'Corner Kicks', value: '3' },
    ]},
  ],
  99002: [
    { team: { id: 529 }, statistics: [
      { type: 'Ball Possession', value: '63%' }, { type: 'Total Shots', value: '8' },
      { type: 'Yellow Cards', value: '0' }, { type: 'Corner Kicks', value: '5' },
    ]},
    { team: { id: 541 }, statistics: [
      { type: 'Ball Possession', value: '37%' }, { type: 'Total Shots', value: '4' },
      { type: 'Yellow Cards', value: '1' }, { type: 'Corner Kicks', value: '2' },
    ]},
  ],
  99003: [
    { team: { id: 40 }, statistics: [
      { type: 'Ball Possession', value: '52%' }, { type: 'Total Shots', value: '3' },
      { type: 'Yellow Cards', value: '0' }, { type: 'Corner Kicks', value: '1' },
    ]},
    { team: { id: 42 }, statistics: [
      { type: 'Ball Possession', value: '48%' }, { type: 'Total Shots', value: '2' },
      { type: 'Yellow Cards', value: '0' }, { type: 'Corner Kicks', value: '0' },
    ]},
  ],
};

// ── Questions per fixture (following FanZone_Question_Bank.docx) ──
// 13–15 questions per match, 8 phases, proper difficulty/reward/window
// Difficulty rewards: EASY=60, MEDIUM=125-150, HARD=240, EXPERT=480
// Fixed bet: 50🪙. Win = 50 × multiplier. Lose = -50🪙.
const QUESTIONS_PER_MATCH: Record<number, any[]> = {
  // ═══ Man City 2-1 Bayern Munich (67' 2H, Champions League) ═══
  // 15 questions across all 8 phases
  99001: [
    // Phase 1: Pre-match (-5'–0') — goal, corner
    {
      text: 'Đội nào ghi bàn trước trong trận?|Who scores first in the match?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 45,
      options: [
        { name: 'Man City ghi trước', emoji: '🔵', multiplier: 2.2 },
        { name: 'Bayern ghi trước', emoji: '🔴', multiplier: 2.8 },
        { name: 'Không có bàn thắng', emoji: '🚫', multiplier: 4.0 },
      ],
    },
    {
      text: 'Phạt góc tiếp theo có dẫn đến bàn thắng không?|Will the next corner lead to a goal?',
      category: 'CORNER', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 30,
      options: [
        { name: 'Có — bàn trực tiếp', emoji: '⚽', multiplier: 8.0 },
        { name: 'Có — bàn từ pha 2', emoji: '⚽', multiplier: 5.0 },
        { name: 'Không có bàn', emoji: '🚫', multiplier: 1.2 },
      ],
    },
    // Phase 2: Early H1 (1'–25') — card, stat
    {
      text: 'Cầu thủ nào nhiều khả năng nhận thẻ tiếp theo?|Who is most likely to get the next card?',
      category: 'CARD', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 35,
      options: [
        { name: 'Rodri (Man City)', emoji: '🟨', multiplier: 2.8 },
        { name: 'Kimmich (Bayern)', emoji: '🟨', multiplier: 2.5 },
        { name: 'Cầu thủ khác', emoji: '🟨', multiplier: 2.2 },
      ],
    },
    {
      text: 'Tổng số cú sút trong cả trận là bao nhiêu?|How many total shots in the match?',
      category: 'STAT', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 40,
      options: [
        { name: 'Dưới 20 cú sút', emoji: '📊', multiplier: 3.5 },
        { name: '20–27 cú sút', emoji: '📊', multiplier: 2.0 },
        { name: '28–34 cú sút', emoji: '📊', multiplier: 2.8 },
        { name: 'Trên 34 cú sút', emoji: '📊', multiplier: 5.0 },
      ],
    },
    // Phase 3: Mid H1 (26'–40') — var, substitution
    {
      text: 'Có penalty nào được chỉ định trong trận không?|Will a penalty be awarded?',
      category: 'VAR', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 40,
      options: [
        { name: 'Có — Man City được đá', emoji: '🎯', multiplier: 3.5 },
        { name: 'Có — Bayern được đá', emoji: '🎯', multiplier: 4.0 },
        { name: 'Không có penalty', emoji: '🚫', multiplier: 1.5 },
      ],
    },
    {
      text: 'Đội nào thực hiện thay người đầu tiên?|Which team makes the first substitution?',
      category: 'SUB', difficulty: 'EASY', rewardCoins: 60, answerWindowSec: 35,
      options: [
        { name: 'Man City', emoji: '🔄', multiplier: 1.5 },
        { name: 'Bayern', emoji: '🔄', multiplier: 1.5 },
      ],
    },
    // Phase 4: Late H1 (41'–45') — goal, corner
    {
      text: 'Có phạt góc trong 5 phút tới không?|Corner kick in the next 5 minutes?',
      category: 'CORNER', difficulty: 'EASY', rewardCoins: 60, answerWindowSec: 30,
      options: [
        { name: 'Có — Man City', emoji: '🚩', multiplier: 1.6 },
        { name: 'Có — Bayern', emoji: '🚩', multiplier: 1.8 },
        { name: 'Không có phạt góc', emoji: '🚫', multiplier: 1.4 },
      ],
    },
    // Phase 5: Half-time (45'–46') — momentum, goal
    {
      text: 'Đội nào tạo ra bước ngoặt sau nghỉ giữa hiệp?|Who creates the turning point after HT?',
      category: 'MOMENTUM', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 40,
      options: [
        { name: 'Man City — tấn công mạnh hơn', emoji: '🔵', multiplier: 2.0 },
        { name: 'Bayern — phản công hiệu quả', emoji: '🔴', multiplier: 2.8 },
        { name: 'Không có thay đổi rõ', emoji: '⚖️', multiplier: 3.5 },
      ],
    },
    {
      text: 'Đội nào ghi bàn đầu tiên trong hiệp 2?|Who scores first in the second half?',
      category: 'GOAL', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 40,
      options: [
        { name: 'Man City', emoji: '🔵', multiplier: 2.2 },
        { name: 'Bayern', emoji: '🔴', multiplier: 2.8 },
        { name: 'Không ai ghi trước phút 65', emoji: '🚫', multiplier: 2.5 },
      ],
    },
    // Phase 6: Early H2 (46'–65') — substitution, var
    {
      text: 'Khi nào diễn ra thay người tiếp theo?|When will the next substitution happen?',
      category: 'SUB', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 35,
      options: [
        { name: 'Trước phút 60', emoji: '🔄', multiplier: 3.0 },
        { name: 'Phút 60–70', emoji: '🔄', multiplier: 2.0 },
        { name: 'Phút 71–80', emoji: '🔄', multiplier: 2.2 },
        { name: 'Sau phút 80', emoji: '🔄', multiplier: 3.5 },
      ],
    },
    {
      text: 'Bàn thắng tiếp theo vào phút nào?|When will the next goal be scored?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 35,
      options: [
        { name: 'Trước phút 75', emoji: '⚽', multiplier: 2.5 },
        { name: 'Phút 75–85', emoji: '⚽', multiplier: 3.0 },
        { name: 'Sau phút 85', emoji: '⚽', multiplier: 3.5 },
        { name: 'Không có thêm bàn', emoji: '🚫', multiplier: 2.0 },
      ],
    },
    // Phase 7: Mid H2 (66'–80') — card, goal
    {
      text: 'Có thẻ vàng nào trong 15 phút tới?|Yellow card in the next 15 minutes?',
      category: 'CARD', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 30,
      options: [
        { name: 'Có — cầu thủ Man City', emoji: '🟨', multiplier: 2.5 },
        { name: 'Có — cầu thủ Bayern', emoji: '🟨', multiplier: 2.2 },
        { name: 'Không có thẻ vàng', emoji: '✅', multiplier: 2.0 },
      ],
    },
    {
      text: 'Bàn thắng tiếp theo là đầu hay chân?|Next goal: header or foot?',
      category: 'GOAL', difficulty: 'EXPERT', rewardCoins: 480, answerWindowSec: 35,
      options: [
        { name: 'Đánh đầu', emoji: '🗣️', multiplier: 5.0 },
        { name: 'Chân thuận', emoji: '🦶', multiplier: 2.0 },
        { name: 'Chân trái', emoji: '🦶', multiplier: 4.0 },
        { name: 'Phản lưới', emoji: '😱', multiplier: 10.0 },
      ],
    },
    // Phase 8: Late match (81'–90+') — time, goal
    {
      text: 'Trọng tài bù thêm bao nhiêu phút?|How many minutes of added time?',
      category: 'TIME', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 35,
      options: [
        { name: '1–3 phút', emoji: '⏱️', multiplier: 3.5 },
        { name: '4–5 phút', emoji: '⏱️', multiplier: 1.8 },
        { name: '6–7 phút', emoji: '⏱️', multiplier: 2.5 },
        { name: '8 phút trở lên', emoji: '⏱️', multiplier: 5.0 },
      ],
    },
    {
      text: 'Có bàn thắng nào trong giờ bù không?|Goal in stoppage time?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 30,
      options: [
        { name: 'Có, đội đang dẫn ghi', emoji: '⚽', multiplier: 3.5 },
        { name: 'Có, đội đang thua ghi', emoji: '⚽', multiplier: 3.0 },
        { name: 'Không có bàn', emoji: '🚫', multiplier: 1.5 },
      ],
    },
  ],

  // ═══ Barcelona 1-0 Real Madrid (34' 1H, La Liga — El Clasico) ═══
  // 14 questions
  99002: [
    // Phase 1: Pre-match — goal, corner
    {
      text: 'Đội nào ghi bàn trước trong trận El Clasico?|Who scores first in El Clasico?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 45,
      options: [
        { name: 'Barcelona ghi trước', emoji: '🔵🔴', multiplier: 2.2 },
        { name: 'Real Madrid ghi trước', emoji: '⚪', multiplier: 2.8 },
        { name: 'Không có bàn thắng', emoji: '🚫', multiplier: 4.0 },
      ],
    },
    {
      text: 'Đội nào có nhiều phạt góc hơn sau 10 phút nữa?|More corners after 10 minutes?',
      category: 'CORNER', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 35,
      options: [
        { name: 'Barcelona', emoji: '🚩', multiplier: 2.0 },
        { name: 'Real Madrid', emoji: '🚩', multiplier: 2.8 },
        { name: 'Bằng nhau', emoji: '⚖️', multiplier: 4.0 },
      ],
    },
    // Phase 2: Early H1 — card, stat
    {
      text: 'Cầu thủ nào nhiều khả năng nhận thẻ tiếp theo?|Who gets the next card?',
      category: 'CARD', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 35,
      options: [
        { name: 'Gavi (Barcelona)', emoji: '🟨', multiplier: 2.5 },
        { name: 'Tchouaméni (Real)', emoji: '🟨', multiplier: 2.8 },
        { name: 'Cầu thủ khác', emoji: '🟨', multiplier: 2.2 },
      ],
    },
    {
      text: 'Đội nào kiểm soát bóng nhiều hơn sau 90 phút?|Who has more possession at FT?',
      category: 'STAT', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 40,
      options: [
        { name: 'Barcelona trên 55%', emoji: '📊', multiplier: 1.8 },
        { name: 'Real Madrid trên 55%', emoji: '📊', multiplier: 3.0 },
        { name: 'Cân bằng 45–55%', emoji: '⚖️', multiplier: 2.5 },
      ],
    },
    // Phase 3: Mid H1 — var, substitution
    {
      text: 'VAR có được gọi trong 15 phút tới không?|VAR call in next 15 minutes?',
      category: 'VAR', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 35,
      options: [
        { name: 'Có — từ chối bàn thắng', emoji: '📺', multiplier: 5.0 },
        { name: 'Có — chỉ penalty', emoji: '📺', multiplier: 4.0 },
        { name: 'Có — kiểm tra thẻ đỏ', emoji: '📺', multiplier: 6.0 },
        { name: 'Không có VAR', emoji: '🚫', multiplier: 1.5 },
      ],
    },
    {
      text: 'Đội nào thay người đầu tiên?|Which team subs first?',
      category: 'SUB', difficulty: 'EASY', rewardCoins: 60, answerWindowSec: 35,
      options: [
        { name: 'Barcelona', emoji: '🔄', multiplier: 1.5 },
        { name: 'Real Madrid', emoji: '🔄', multiplier: 1.5 },
      ],
    },
    // Phase 4: Late H1 — goal
    {
      text: 'Có bàn thắng trong 10 phút tới không?|Goal in the next 10 minutes?',
      category: 'GOAL', difficulty: 'EASY', rewardCoins: 60, answerWindowSec: 30,
      options: [
        { name: 'Có — Barcelona ghi', emoji: '🔵🔴', multiplier: 1.8 },
        { name: 'Có — Real Madrid ghi', emoji: '⚪', multiplier: 2.0 },
        { name: 'Không có bàn thắng', emoji: '🚫', multiplier: 1.3 },
      ],
    },
    // Phase 5: Half-time — momentum, goal
    {
      text: 'Ai tạo bước ngoặt sau nghỉ giữa hiệp?|Who turns it around after HT?',
      category: 'MOMENTUM', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 40,
      options: [
        { name: 'Barca — tấn công mạnh hơn', emoji: '🔵🔴', multiplier: 2.0 },
        { name: 'Real — phản công sắc bén', emoji: '⚪', multiplier: 2.8 },
        { name: 'Không có thay đổi rõ', emoji: '⚖️', multiplier: 3.5 },
      ],
    },
    {
      text: 'Ai ghi bàn đầu tiên hiệp 2?|Who scores first in H2?',
      category: 'GOAL', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 40,
      options: [
        { name: 'Lewandowski', emoji: '🔵🔴', multiplier: 2.5 },
        { name: 'Mbappé', emoji: '⚪', multiplier: 2.8 },
        { name: 'Cầu thủ khác', emoji: '⚽', multiplier: 2.0 },
        { name: 'Không ai', emoji: '🚫', multiplier: 3.0 },
      ],
    },
    // Phase 6: Early H2 — substitution, var
    {
      text: 'Tổng số thay người trong hiệp 2 là bao nhiêu?|Total subs in H2?',
      category: 'SUB', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 40,
      options: [
        { name: '3 thay người', emoji: '🔄', multiplier: 3.5 },
        { name: '4 thay người', emoji: '🔄', multiplier: 2.5 },
        { name: '5 thay người', emoji: '🔄', multiplier: 2.0 },
        { name: '6 người (tối đa)', emoji: '🔄', multiplier: 2.8 },
      ],
    },
    // Phase 7: Mid H2 — card, goal
    {
      text: 'Có thẻ đỏ nào trong trận El Clasico?|Red card in El Clasico?',
      category: 'CARD', difficulty: 'EXPERT', rewardCoins: 480, answerWindowSec: 35,
      options: [
        { name: 'Có — Barca bị đuổi', emoji: '🟥', multiplier: 8.0 },
        { name: 'Có — Real bị đuổi', emoji: '🟥', multiplier: 8.0 },
        { name: 'Không có thẻ đỏ', emoji: '✅', multiplier: 1.2 },
      ],
    },
    {
      text: 'Tỷ số cuối trận El Clasico?|Final score of El Clasico?',
      category: 'GOAL', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 40,
      options: [
        { name: '1-0 Barca giữ sạch', emoji: '🛡️', multiplier: 2.5 },
        { name: '2-0 Barca thắng đậm', emoji: '🔵🔴', multiplier: 3.0 },
        { name: '1-1 Hoà', emoji: '⚖️', multiplier: 2.8 },
        { name: 'Real thắng ngược', emoji: '⚪', multiplier: 4.0 },
      ],
    },
    // Phase 8: Late match — time, goal
    {
      text: 'Trọng tài bù bao nhiêu phút?|How much stoppage time?',
      category: 'TIME', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 35,
      options: [
        { name: '1–3 phút', emoji: '⏱️', multiplier: 3.5 },
        { name: '4–5 phút', emoji: '⏱️', multiplier: 1.8 },
        { name: '6–7 phút', emoji: '⏱️', multiplier: 2.5 },
        { name: '8 phút trở lên', emoji: '⏱️', multiplier: 5.0 },
      ],
    },
    {
      text: 'Có bàn thắng phút bù giờ?|Stoppage time goal?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 30,
      options: [
        { name: 'Có', emoji: '⚽', multiplier: 3.0 },
        { name: 'Không', emoji: '🚫', multiplier: 1.4 },
      ],
    },
  ],

  // ═══ Liverpool 0-0 Arsenal (12' 1H, Premier League) ═══
  // 15 questions
  99003: [
    // Phase 1: Pre-match — goal, corner
    {
      text: 'Đội nào ghi bàn trước?|Who scores first?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 45,
      options: [
        { name: 'Liverpool ghi trước', emoji: '🔴', multiplier: 2.2 },
        { name: 'Arsenal ghi trước', emoji: '🔴', multiplier: 2.5 },
        { name: 'Hoà 0-0 hiệp 1', emoji: '🤝', multiplier: 2.5 },
      ],
    },
    {
      text: 'Có phạt góc trong 5 phút tới không?|Corner in next 5 minutes?',
      category: 'CORNER', difficulty: 'EASY', rewardCoins: 60, answerWindowSec: 30,
      options: [
        { name: 'Có — Liverpool', emoji: '🚩', multiplier: 1.6 },
        { name: 'Có — Arsenal', emoji: '🚩', multiplier: 1.8 },
        { name: 'Không có', emoji: '🚫', multiplier: 1.4 },
      ],
    },
    // Phase 2: Early H1 — card, stat
    {
      text: 'Có thẻ vàng nào trong 15 phút tới?|Yellow card in next 15 minutes?',
      category: 'CARD', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 30,
      options: [
        { name: 'Có — cầu thủ Liverpool', emoji: '🟨', multiplier: 2.5 },
        { name: 'Có — cầu thủ Arsenal', emoji: '🟨', multiplier: 2.2 },
        { name: 'Không có thẻ vàng', emoji: '✅', multiplier: 2.0 },
      ],
    },
    {
      text: 'Tổng số cú sút cả trận là bao nhiêu?|Total shots in the match?',
      category: 'STAT', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 40,
      options: [
        { name: 'Dưới 20 cú sút', emoji: '📊', multiplier: 3.5 },
        { name: '20–27 cú sút', emoji: '📊', multiplier: 2.0 },
        { name: '28–34 cú sút', emoji: '📊', multiplier: 2.8 },
        { name: 'Trên 34 cú sút', emoji: '📊', multiplier: 5.0 },
      ],
    },
    // Phase 3: Mid H1 — var, substitution
    {
      text: 'VAR có được gọi trong 15 phút tới?|VAR in the next 15 minutes?',
      category: 'VAR', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 35,
      options: [
        { name: 'Có — từ chối bàn thắng', emoji: '📺', multiplier: 5.0 },
        { name: 'Có — chỉ penalty', emoji: '📺', multiplier: 4.0 },
        { name: 'Có — kiểm tra thẻ đỏ', emoji: '📺', multiplier: 6.0 },
        { name: 'Không có VAR', emoji: '🚫', multiplier: 1.5 },
      ],
    },
    {
      text: 'Đội nào thay người đầu tiên?|Which team subs first?',
      category: 'SUB', difficulty: 'EASY', rewardCoins: 60, answerWindowSec: 35,
      options: [
        { name: 'Liverpool', emoji: '🔄', multiplier: 1.5 },
        { name: 'Arsenal', emoji: '🔄', multiplier: 1.5 },
      ],
    },
    // Phase 4: Late H1 — corner
    {
      text: 'Tổng số phạt góc trong hiệp 1?|Total corners in the first half?',
      category: 'CORNER', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 35,
      options: [
        { name: 'Ít hơn 4', emoji: '🚩', multiplier: 2.0 },
        { name: '4–6 phạt góc', emoji: '🚩', multiplier: 1.8 },
        { name: '7–9 phạt góc', emoji: '🚩', multiplier: 2.8 },
        { name: '10 trở lên', emoji: '🚩', multiplier: 5.0 },
      ],
    },
    // Phase 5: Half-time — momentum, goal
    {
      text: 'Đội nào tạo bước ngoặt sau HT?|Who creates the turning point after HT?',
      category: 'MOMENTUM', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 40,
      options: [
        { name: 'Liverpool — pressing mạnh hơn', emoji: '🔴', multiplier: 2.0 },
        { name: 'Arsenal — phản công sắc bén', emoji: '🔴', multiplier: 2.8 },
        { name: 'Không có thay đổi rõ', emoji: '⚖️', multiplier: 3.5 },
      ],
    },
    {
      text: 'Ai ghi bàn đầu tiên hiệp 2?|Who scores first in H2?',
      category: 'GOAL', difficulty: 'MEDIUM', rewardCoins: 150, answerWindowSec: 40,
      options: [
        { name: 'Salah', emoji: '🔴', multiplier: 2.5 },
        { name: 'Saka', emoji: '🔴', multiplier: 3.0 },
        { name: 'Cầu thủ khác', emoji: '⚽', multiplier: 2.0 },
        { name: 'Không ai ghi trước phút 65', emoji: '🚫', multiplier: 2.5 },
      ],
    },
    // Phase 6: Early H2 — substitution, goal
    {
      text: 'Cầu thủ vào thay có ghi bàn không?|Will a substitute score?',
      category: 'SUB', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 35,
      options: [
        { name: 'Có — ghi bàn', emoji: '⚽', multiplier: 4.0 },
        { name: 'Không ghi bàn', emoji: '🚫', multiplier: 1.2 },
      ],
    },
    {
      text: 'Bàn thắng tiếp theo vào phút nào?|When is the next goal?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 35,
      options: [
        { name: 'Trước phút 60', emoji: '⚽', multiplier: 2.5 },
        { name: 'Phút 60–75', emoji: '⚽', multiplier: 2.0 },
        { name: 'Phút 76–90', emoji: '⚽', multiplier: 2.8 },
        { name: 'Không có bàn nào', emoji: '🚫', multiplier: 3.0 },
      ],
    },
    // Phase 7: Mid H2 — card, goal
    {
      text: 'Trọng tài rút bao nhiêu thẻ vàng còn lại?|How many more yellow cards?',
      category: 'CARD', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 35,
      options: [
        { name: '0 thẻ', emoji: '✅', multiplier: 2.5 },
        { name: '1 thẻ', emoji: '🟨', multiplier: 2.0 },
        { name: '2 thẻ', emoji: '🟨', multiplier: 2.5 },
        { name: '3 thẻ trở lên', emoji: '🟨', multiplier: 4.0 },
      ],
    },
    {
      text: 'VAR lật lại quyết định của trọng tài?|VAR overturns the referee decision?',
      category: 'VAR', difficulty: 'EXPERT', rewardCoins: 480, answerWindowSec: 60,
      options: [
        { name: 'Có — lật quyết định', emoji: '📺', multiplier: 3.0 },
        { name: 'Không — giữ nguyên', emoji: '❌', multiplier: 1.3 },
      ],
    },
    // Phase 8: Late match — time, goal
    {
      text: 'Trọng tài bù bao nhiêu phút?|How much added time?',
      category: 'TIME', difficulty: 'MEDIUM', rewardCoins: 125, answerWindowSec: 35,
      options: [
        { name: '1–3 phút', emoji: '⏱️', multiplier: 3.5 },
        { name: '4–5 phút', emoji: '⏱️', multiplier: 1.8 },
        { name: '6–7 phút', emoji: '⏱️', multiplier: 2.5 },
        { name: '8 phút trở lên', emoji: '⏱️', multiplier: 5.0 },
      ],
    },
    {
      text: 'Có bàn thắng trong phút bù giờ không?|Goal in stoppage time?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 240, answerWindowSec: 30,
      options: [
        { name: 'Có, Liverpool ghi', emoji: '🔴', multiplier: 3.0 },
        { name: 'Có, Arsenal ghi', emoji: '🔴', multiplier: 3.5 },
        { name: 'Không có bàn', emoji: '🚫', multiplier: 1.4 },
      ],
    },
  ],
};

// ── Mock users for feed ──
const MOCK_USERS = [
  { email: 'mock-1@fanzone.test', displayName: 'JP TokyoKicker', avatarEmoji: '⚽', countryCode: 'JP' },
  { email: 'mock-2@fanzone.test', displayName: 'VN SaigonFan', avatarEmoji: '🎯', countryCode: 'VN' },
  { email: 'mock-3@fanzone.test', displayName: 'KR SeoulStriker', avatarEmoji: '🏆', countryCode: 'KR' },
  { email: 'mock-4@fanzone.test', displayName: 'US NYGoalHunter', avatarEmoji: '🦁', countryCode: 'US' },
  { email: 'mock-5@fanzone.test', displayName: 'BR RioFan99', avatarEmoji: '🔥', countryCode: 'BR' },
];

@Controller('mock')
export class MockController {
  private readonly logger = new Logger(MockController.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private scoringService: ScoringService,
    private ws: WebsocketGateway,
    private questionsService: QuestionsService,
  ) {}

  /**
   * POST /mock/seed
   * Seeds 3 live matches + upcoming matches + questions + stats + feed events.
   */
  @Post('seed')
  async seed() {
    // ── Cleanup previous mock data ──
    for (const fid of [...MOCK_IDS, 99004, 99005]) {
      await this.prisma.prediction.deleteMany({ where: { question: { fixtureId: fid } } });
      await this.prisma.questionOption.deleteMany({ where: { question: { fixtureId: fid } } });
      await this.prisma.question.deleteMany({ where: { fixtureId: fid } });
      await this.prisma.feedEvent.deleteMany({ where: { fixtureId: fid } });
    }

    // ── Seed fixtures in Redis ──
    await this.redis.setJson('cache:fixtures:live', MOCK_FIXTURES_LIVE, 86400);
    await this.redis.setJson('cache:fixtures:today', [...MOCK_FIXTURES_LIVE, ...MOCK_FIXTURES_TODAY], 86400);

    // ── Seed stats in Redis ──
    for (const [fid, stats] of Object.entries(MOCK_STATS)) {
      await this.redis.setJson(`cache:fixture:${fid}:stats`, stats, 86400);
    }

    // ── Create questions for each live match ──
    const allQuestions: Record<number, any[]> = {};

    for (const fixtureId of MOCK_IDS) {
      const questions = QUESTIONS_PER_MATCH[fixtureId] || [];
      const now = new Date();
      const created: any[] = [];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const opensAt = new Date(now.getTime() + i * 90_000);
        const closesAt = new Date(opensAt.getTime() + q.answerWindowSec * 1000);

        const question = await this.questionsService.createQuestion({
          fixtureId,
          category: q.category,
          difficulty: q.difficulty,
          text: q.text,
          rewardCoins: q.rewardCoins,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          options: q.options,
        });
        created.push(question);
      }

      // Open the first question for each match
      if (created.length > 0) {
        await this.questionsService.openQuestion(created[0].id);
      }

      allQuestions[fixtureId] = created;
    }

    // ── Ensure mock users exist ──
    const userIds: string[] = [];
    for (const mu of MOCK_USERS) {
      const user = await this.prisma.user.upsert({
        where: { email: mu.email },
        update: { displayName: mu.displayName, avatarEmoji: mu.avatarEmoji },
        create: { email: mu.email, passwordHash: 'mock', displayName: mu.displayName, avatarEmoji: mu.avatarEmoji, countryCode: mu.countryCode },
      });
      userIds.push(user.id);
    }

    // ── Seed feed events ──
    const feedMessages = [
      { vi: 'Dự đoán đúng: Phạt góc trong 5\'', en: 'Correct: Corner in 5\'', type: 'CORRECT' as const, coins: 80 },
      { vi: 'Dự đoán sai: Ai ghi bàn tiếp', en: 'Wrong: Who scores next', type: 'WRONG' as const, coins: -50 },
      { vi: 'Dự đoán đúng: Thẻ vàng cho đội khách', en: 'Correct: Yellow card for away', type: 'CORRECT' as const, coins: 100 },
      { vi: 'Dự đoán sai: Tỷ số hiệp 1', en: 'Wrong: Half-time score', type: 'WRONG' as const, coins: -50 },
      { vi: 'Dự đoán đúng: Đội nhà ghi bàn trước', en: 'Correct: Home scores first', type: 'CORRECT' as const, coins: 125 },
      { vi: 'Dự đoán đúng: Có VAR', en: 'Correct: VAR intervention', type: 'CORRECT' as const, coins: 175 },
      { vi: 'Dự đoán sai: Phạt góc đầu tiên', en: 'Wrong: First corner', type: 'WRONG' as const, coins: -50 },
      { vi: 'Dự đoán đúng: Thay người trước 60\'', en: 'Correct: Sub before 60\'', type: 'CORRECT' as const, coins: 90 },
    ];

    for (const fixtureId of MOCK_IDS) {
      for (let i = 0; i < feedMessages.length; i++) {
        const fm = feedMessages[i];
        await this.prisma.feedEvent.create({
          data: {
            fixtureId,
            userId: userIds[i % userIds.length],
            type: fm.type,
            message: `${fm.en}|${fm.vi}`,
            coinsDelta: fm.coins,
          },
        });
      }
    }

    const summary = MOCK_IDS.map((fid) => {
      const fixture = MOCK_FIXTURES_LIVE.find((f) => f.fixture.id === fid);
      return {
        fixtureId: fid,
        match: `${fixture?.teams.home.name} vs ${fixture?.teams.away.name}`,
        questionsCount: allQuestions[fid]?.length ?? 0,
        firstQuestionId: allQuestions[fid]?.[0]?.id,
      };
    });

    this.logger.log(`Mock seed complete: ${MOCK_IDS.length} matches, ${Object.values(allQuestions).flat().length} questions`);

    return { matches: summary, upcomingMatches: MOCK_FIXTURES_TODAY.length };
  }

  /**
   * POST /mock/seed-scenario
   * Requires JWT. Seeds mock data + creates predictions for the authenticated user:
   * - Q1, Q2, Q3: RESOLVED with user predictions (correct/wrong/correct)
   * - Q4, Q5: LOCKED with user predictions (pending results)
   * - Q6 (next match): OPEN for user to answer
   * Produces the rich predict screen shown in the design doc.
   */
  @Post('seed-scenario')
  async seedScenario(@Request() req: any) {
    // Try JWT first, fall back to finding first non-mock user
    let userId: string | undefined = req.user?.id;
    if (!userId) {
      const realUser = await this.prisma.user.findFirst({
        where: { email: { not: { contains: 'mock' } } },
        orderBy: { createdAt: 'desc' },
      });
      if (!realUser) return { error: 'No user found. Register first.' };
      userId = realUser.id;
    }

    // First, run normal seed
    const seedResult = await this.seed();

    // Work with fixture 99001 (Man City vs Bayern — 5 questions)
    const fixtureId = 99001;
    const questions = await this.prisma.question.findMany({
      where: { fixtureId },
      orderBy: { opensAt: 'asc' },
      include: { options: true },
    });

    if (questions.length < 5) {
      return { ...seedResult, scenario: 'not enough questions' };
    }

    const now = new Date();

    // Q1: RESOLVED — user predicted option[0], correct answer is option[0] → CORRECT
    const q1 = questions[0];
    await this.prisma.question.update({
      where: { id: q1.id },
      data: { status: 'RESOLVED', correctOptionId: q1.options[0].id, closesAt: new Date(now.getTime() - 300_000) },
    });
    await this.prisma.questionOption.update({ where: { id: q1.options[0].id }, data: { isCorrect: true, fanCount: 12 } });
    await this.prisma.prediction.create({
      data: { userId, questionId: q1.id, optionId: q1.options[0].id, coinsBet: 50, coinsResult: 125, isCorrect: true },
    });

    // Q2: RESOLVED — user predicted option[0], correct answer is option[1] → WRONG
    const q2 = questions[1];
    await this.prisma.question.update({
      where: { id: q2.id },
      data: { status: 'RESOLVED', correctOptionId: q2.options[1].id, closesAt: new Date(now.getTime() - 240_000) },
    });
    await this.prisma.questionOption.update({ where: { id: q2.options[1].id }, data: { isCorrect: true, fanCount: 8 } });
    await this.prisma.prediction.create({
      data: { userId, questionId: q2.id, optionId: q2.options[0].id, coinsBet: 50, coinsResult: -50, isCorrect: false },
    });

    // Q3: RESOLVED — user predicted option[0], correct answer is option[0] → CORRECT
    const q3 = questions[2];
    await this.prisma.question.update({
      where: { id: q3.id },
      data: { status: 'RESOLVED', correctOptionId: q3.options[0].id, closesAt: new Date(now.getTime() - 180_000) },
    });
    await this.prisma.questionOption.update({ where: { id: q3.options[0].id }, data: { isCorrect: true, fanCount: 15 } });
    await this.prisma.prediction.create({
      data: { userId, questionId: q3.id, optionId: q3.options[0].id, coinsBet: 50, coinsResult: 260, isCorrect: true },
    });

    // Q4: OPEN — active question for user to answer (3 min window for testing)
    const q4 = questions[3];
    await this.prisma.question.update({
      where: { id: q4.id },
      data: { status: 'OPEN', opensAt: now, closesAt: new Date(now.getTime() + 180_000) },
    });
    for (const opt of q4.options) {
      const fakeFanCount = Math.floor(Math.random() * 20) + 5;
      await this.prisma.questionOption.update({ where: { id: opt.id }, data: { fanCount: fakeFanCount } });
    }

    // Q5: PENDING — next question, opens 5 min from now (shows countdown after Q4 expires)
    const q5 = questions[4];
    await this.prisma.question.update({
      where: { id: q5.id },
      data: { status: 'PENDING', opensAt: new Date(now.getTime() + 300_000), closesAt: new Date(now.getTime() + 330_000) },
    });

    this.logger.log(`Scenario seeded for user ${userId}: 3 resolved + 1 open (30s) + 1 pending (opens in 60s)`);

    return {
      ...seedResult,
      scenario: {
        userId,
        resolved: [q1.id, q2.id, q3.id],
        open: q4.id,
        pending: q5.id,
        message: 'Pull to refresh on predict screen',
      },
    };
  }

  /**
   * POST /mock/auto-resolve
   * Auto-resolves predictions after ~3 seconds for ALL mock matches.
   */
  @Post('auto-resolve')
  async enableAutoResolve() {
    if (this.autoResolveActive) {
      return { status: 'already active' };
    }
    this.autoResolveActive = true;
    this.runAutoResolveLoop();
    this.logger.log('Auto-resolve mode ENABLED for all mock matches');
    return { status: 'enabled', message: 'Predictions will resolve randomly after ~3 seconds' };
  }

  @Post('auto-resolve/stop')
  async disableAutoResolve() {
    this.autoResolveActive = false;
    this.logger.log('Auto-resolve mode DISABLED');
    return { status: 'disabled' };
  }

  private autoResolveActive = false;

  private async runAutoResolveLoop() {
    while (this.autoResolveActive) {
      try {
        for (const fixtureId of MOCK_IDS) {
          const questionsWithPredictions = await this.prisma.question.findMany({
            where: {
              fixtureId,
              status: 'OPEN',
              predictions: { some: { isCorrect: null } },
            },
            include: { options: true, predictions: { where: { isCorrect: null } } },
          });

          for (const question of questionsWithPredictions) {
            const oldestPrediction = question.predictions
              .sort((a, b) => a.predictedAt.getTime() - b.predictedAt.getTime())[0];

            if (!oldestPrediction) continue;
            const ageMs = Date.now() - oldestPrediction.predictedAt.getTime();
            if (ageMs < 3000) continue;

            const randomOption = question.options[
              Math.floor(Math.random() * question.options.length)
            ];

            this.logger.log(`[AUTO-RESOLVE] fixture ${fixtureId}: "${question.text}" → "${randomOption.name}"`);

            await this.questionsService.resolveQuestion(question.id, randomOption.id);
            const results = await this.scoringService.scoreQuestion(question.id, randomOption.id);

            const nextQuestion = await this.questionsService.openNextPending(fixtureId);

            this.ws.emitToMatch(fixtureId, 'prediction_result', {
              questionId: question.id,
              correctOptionId: randomOption.id,
              results: results.map((r) => ({
                userId: r.userId,
                isCorrect: r.isCorrect,
                coinsResult: r.coinsResult,
                xpEarned: r.xpEarned,
              })),
            });

            if (nextQuestion) {
              this.ws.emitToMatch(fixtureId, 'new_question', {
                fixtureId,
                questionId: nextQuestion.id,
                text: nextQuestion.text,
                category: nextQuestion.category,
              });
            }
          }
        }
      } catch (e) {
        this.logger.error(`Auto-resolve error: ${e}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
