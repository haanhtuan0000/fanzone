# QA Review — FanZone Question Bank v2.2

**Ngày review:** 2026-04-02  
**Reviewer:** Dev Team  
**Tài liệu gốc:** FanZone_Question_Bank_v2_2.docx  
**Tổng issues:** 11 (2 nghiêm trọng, 6 trung bình, 3 thấp)

---

## Issues nghiêm trọng

### #1. Q043 — Logic verify mâu thuẫn (điều kiện unreachable)

**Câu hỏi:** "Thay người đầu tiên của {Đội chủ} trong H2 là phút nào?"  
**Vấn đề:** Mục 5.5 verify Q043 ghi:

```
firstHomeSubst = subst events team==homeTeamId AND elapsed>=46, sort asc, [0]
Nếu elapsed < 46 (H1 sub) → VOID + hoàn 50🪙  ← FIX v2.2
```

Dòng filter đã yêu cầu `elapsed>=46`, nên dòng check `elapsed < 46` **không bao giờ xảy ra** — đây là dead code.

**Ý đồ thực sự (từ changelog v2.2 #1):** Nếu đội chủ nhà ĐÃ thay người trong H1 rồi thì câu hỏi không hợp lý. Nhưng logic verify hiện tại không thực hiện được ý đồ này.

**Đề xuất:** Sửa logic thành 2 bước tách biệt:
```
Bước 1: hasH1Sub = subst events team==homeTeamId AND elapsed<46
        Nếu hasH1Sub → VOID + hoàn 50🪙
Bước 2: firstH2Sub = subst events team==homeTeamId AND elapsed>=46, sort asc, [0]
        Nếu không có → VOID + hoàn 50🪙
        Nếu có → map elapsed vào bracket A/B/C/D
```

**Hoặc:** Bỏ hẳn VOID rule cho H1 sub (vì đội vẫn có thể thay người lần đầu trong H2 dù đã thay trong H1). Cần xác nhận ý đồ sản phẩm.

---

### #2. Q053/Q055 — Không xử lý khi tỷ số thay đổi thành hòa sau trigger

**Câu hỏi:**
- Q053: "Đội thua có phản công tích cực hơn trong 15 phút cuối?" (trigger khi không hòa ở phút 75)
- Q055: "Trong 20 phút cuối, đội nào tạo nhiều cơ hội nguy hiểm hơn?" (trigger khi không hòa ở phút 70)

**Vấn đề:** Cả hai câu dùng biến `{Đội dẫn}` / `{Đội thua}` được inject lúc trigger. Nhưng nếu đội thua gỡ hòa SAU khi câu hỏi mở (ví dụ: Q053 trigger ở 75' khi tỷ số 1-0, nhưng phút 78 thành 1-1), thì:
- `{Đội thua}` không còn tồn tại
- Kết quả verify không còn ý nghĩa (so sánh shots delta giữa hai đội khi không có đội nào "thua")

**Ảnh hưởng:** Kết quả sai hoặc không thể xác định.

**Đề xuất:** Bổ sung rule: "Nếu tỷ số trở thành hòa sau khi câu hỏi mở → VOID + hoàn 50🪙."

---

## Issues trung bình

### #3. Q002 — Options A và B vô nghĩa khi hỏi trong H2

**Câu hỏi:** "Bàn thắng tiếp theo vào phút nào?"  
**Phases:** H1 sớm, Giữa H1, **H2 sớm**  
**Options:** A) Trước phút 30, B) Phút 30–45, C) Phút 46–65, D) Sau phút 65

**Vấn đề:** Khi Q002 được hỏi ở phase H2 sớm (phút 46–60), answer window đóng ở ~phút 51. Verify logic: `nextGoal = Goal events elapsed > T_close`. Bàn thắng tiếp theo chắc chắn ở phút 51+, nên:
- Option A (trước phút 30) — **không bao giờ đúng**
- Option B (phút 30–45) — **không bao giờ đúng**
- Chỉ có C và D là khả thi

**Ảnh hưởng:**
- User thấy 4 options nhưng chỉ 2 có thể thắng → gây nhầm lẫn
- Nếu không ai chọn A/B, fanPct = 0% → công thức multiplier `100/fanPct` sẽ chia cho 0 hoặc ra infinity

**Đề xuất:** Một trong hai:
- Bỏ H2 sớm khỏi phases (chỉ hỏi Q002 ở H1)
- Hoặc: dùng options dynamic theo phase (nếu H2: chỉ hiện 2 options C/D)

---

### #4. Q023 — Verify logic và label option không khớp

**Câu hỏi:** "Tổng số thay người trong hiệp 2 là bao nhiêu?"  
**Options trong bảng:** A) 3–4 người, B) 5–6, C) 7–8, D) 9–10  
**Verify logic (mục 5.5):** `A: count<=4, B: 5-6, C: 7-8, D: count>=9`

**Vấn đề:** Verify ghi `count<=4` (bao gồm 0, 1, 2, 3, 4) nhưng label option A ghi "3–4 người". Hai trường hợp không khớp:
- Nếu H2 có 0–2 thay người → verify chọn A ("3–4 người") nhưng thực tế không phải 3–4
- User chọn A nghĩ rằng "3 hoặc 4" nhưng thực tế A cũng thắng khi chỉ có 1–2 thay người

**Đề xuất:** Đổi label option A thành "0–4 người" để khớp verify logic. Hoặc sửa verify: thêm rule "Nếu count < 3 → VOID + hoàn 50🪙" và giữ label A = "3–4".

---

### #5. Q048 — Engine cần metadata loại giải đấu nhưng chưa được định nghĩa

**Câu hỏi:** "Trận có đi vào hiệp phụ không?"  
**Trigger:** "Có (cup/playoff khi hòa ở phút 80)"  
**Verify:** `fixture.league.type == "Cup"`

**Vấn đề:** Tài liệu yêu cầu engine biết loại giải (Cup vs League) nhưng không định nghĩa:
- Nguồn dữ liệu lấy từ đâu? (API-Football fixture response? Config thủ công?)
- Danh sách giải đấu nào được coi là "Cup"?
- Nếu engine chỉ track giải League (ví dụ Premier League), Q048 sẽ không bao giờ trigger

**Đề xuất:** Bổ sung bảng mapping giải đấu → loại (Cup/League/Playoff), hoặc ghi rõ lấy từ `fixture.league.type` của API-Football.

---

### #6. Q036 — Solo goal luôn VOID, tỷ lệ VOID quá cao

**Câu hỏi:** "Cầu thủ nào là người kiến tạo bàn thắng tiếp theo?"  
**Verify:** `assist.id == null → VOID + hoàn 50🪙`

**Vấn đề:** Trong bóng đá thực tế, khoảng 25-30% bàn thắng không có kiến tạo (solo dribble, rebound, phản lưới, đá phạt trực tiếp). Điều này có nghĩa Q036 sẽ VOID ~1/4 đến ~1/3 số lần được hỏi.

**Ảnh hưởng:** UX tệ — user trả lời, chờ đợi, rồi chỉ nhận lại 50 xu mà không có kết quả thắng/thua. Nếu xảy ra thường xuyên, user sẽ cảm thấy câu hỏi vô nghĩa.

**Đề xuất:** Cân nhắc một trong các giải pháp:
- Thêm option E: "Không có kiến tạo / Solo goal" với defaultPct ~25%
- Hoặc: chỉ trigger Q036 khi xác suất có assist cao
- Hoặc: chấp nhận tỷ lệ VOID cao và ghi rõ trong UX

---

### #7. Q054 — Vô nghĩa khi bàn thắng đầu tiên quá sớm

**Câu hỏi:** "Đội ghi bàn đầu có tiếp tục kiểm soát trận đấu?"  
**Trigger:** Sau Goal event đầu tiên tại phút G  
**Verify:** So sánh stats `[max(G-15, 1), G]` vs `[G, G+15]`

**Vấn đề:** Nếu bàn thắng đầu tiên ở phút 2-3, window "trước" là `[1, 3]` = 2 phút data. Stats tại phút 1-3 (possession, shots) gần như bằng 0, khiến phép so sánh vô nghĩa. Bất kỳ đội nào có 1 cú sút sau bàn thắng đều "thắng" so sánh.

**Đề xuất:** Thêm điều kiện: "Chỉ trigger Q054 nếu G > 15 (bàn thắng đầu tiên sau phút 15)." Nếu G <= 15, không trigger câu hỏi này.

---

### #8. Q053 — Ngưỡng quá cao, Option B thắng ~90% trường hợp

**Câu hỏi:** "Đội thua có phản công tích cực hơn trong 15 phút cuối?"  
**Công thức:** `shots_losing_delta > shots_leading_delta + 3 → A`

**Vấn đề:** Trung bình mỗi đội sút khoảng 3-4 cú sút trong 15 phút. Để Option A thắng, đội thua cần sút NHIỀU HƠN đội dẫn **3 cú** — tức đội thua ~6-7 cú sút vs đội dẫn ~3-4 cú. Điều này chỉ xảy ra trong ~5-10% trận đấu.

**Ảnh hưởng:** Câu hỏi trở nên nhàm chán vì user biết Option B gần như chắc chắn thắng. Multiplier của Option A sẽ rất cao nhưng gần như không bao giờ trả thưởng.

**Đề xuất:** Giảm ngưỡng xuống `shots_losing_delta > shots_leading_delta + 1` hoặc `+2` để tỷ lệ Option A thắng tăng lên ~25-35%.

---

## Issues thấp

### #9. Q022 — Không có VOID rule nếu không đội nào thay người

**Câu hỏi:** "Đội nào thực hiện thay người đầu tiên?"  
**Options:** Chỉ có A ({Đội chủ}) và B ({Đội khách}), không có option C ("Không ai thay người").

**Vấn đề:** Tuy cực kỳ hiếm, nhưng lý thuyết cả hai đội có thể chơi 90 phút mà không thay người. Khi đó không có option nào đúng và không có VOID rule.

**Đề xuất:** Thêm: "Nếu không có subst event nào đến FT → VOID + hoàn 50🪙." (Hoặc chấp nhận rủi ro vì xác suất gần 0.)

---

### #10. Q019 — Timeout VOID 180s có thể quá ngắn

**Câu hỏi:** "VAR lật lại quyết định của trọng tài không?"  
**VOID rule:** "Nếu không có verdict trong 180s → VOID"

**Vấn đề:** Tổng thời gian chờ = 60s (answer window) + 180s (verdict) = 4 phút. Các VAR review phức tạp (offside nhiều góc quay, handball check) có thể mất 3-5 phút. Timeout 180s sau answer window có thể gây VOID sớm trong khi VAR vẫn đang review.

**Đề xuất:** Tăng timeout lên 240-300s (tổng 5-6 phút) để cover hầu hết VAR review.

---

### #11. Sliding window — Không rõ scope reset

**Thông số:** Window = 12, pool khả dụng = 55 - 12 = 43 câu/trận

**Vấn đề:** Tài liệu ghi "pool khả dụng = 43 câu/trận" ngụ ý tính per-match, nhưng không ghi rõ:
- Sliding window có **reset khi bắt đầu trận mới** không?
- Hay window giữ nguyên và carry over giữa các trận? (Nếu vậy, trận tiếp theo sẽ bị exclude 12 câu từ trận trước)

**Đề xuất:** Ghi rõ: "Sliding window reset về rỗng khi bắt đầu mỗi fixture mới."

---

## Tóm tắt hành động cần thiết

| # | Mức độ | Câu hỏi | Hành động |
|---|--------|---------|-----------|
| 1 | Nghiêm trọng | Q043 | Sửa logic verify (2 bước tách biệt) |
| 2 | Nghiêm trọng | Q053, Q055 | Thêm VOID khi tỷ số thành hòa sau trigger |
| 3 | Trung bình | Q002 | Bỏ phase H2 sớm hoặc dùng dynamic options |
| 4 | Trung bình | Q023 | Sửa label A thành "0–4" hoặc thêm VOID cho count<3 |
| 5 | Trung bình | Q048 | Định nghĩa nguồn metadata loại giải |
| 6 | Trung bình | Q036 | Giảm tỷ lệ VOID (thêm option hoặc điều kiện) |
| 7 | Trung bình | Q054 | Thêm ngưỡng G > 15 |
| 8 | Trung bình | Q053 | Giảm ngưỡng shots delta |
| 9 | Thấp | Q022 | Thêm VOID rule (optional) |
| 10 | Thấp | Q019 | Tăng timeout lên 240-300s |
| 11 | Thấp | Sliding window | Ghi rõ reset scope |
