# 서버 구조 설계 (v2)

로그인 없이 **가족 코드**로 부부 결과를 묶고, 결과는 서버(Supabase)에 저장합니다.
서버 설정(`data/config.json`의 `supabaseUrl`, `supabaseAnonKey`)이 비어 있으면 지금처럼 **URL 방식**으로 동작하므로, 서버가 준비되기 전에도 사이트는 그대로 쓸 수 있습니다.

## 1. 전체 그림

```
[브라우저]                         [Supabase]
index.html  ── 80문항 응답 ──▶  submit_result()  ── 채점·저장 ──▶ results
   ▲                                   │                          families
   │ 초대 링크(?inv=…)                  ▼
   │                            결과 토큰 반환
result.html?t=토큰  ◀───────────────────┘
   │   get_result(토큰) ──▶ 내 점수 + 배우자 점수 + 이전 검사
   │   subscribe(토큰, 이메일) ──▶ contacts
   ▼
배우자 완료 → notifications 대기열 → 발송 함수(notify) → 이메일 / (추후) 카카오 알림톡
```

- 브라우저는 테이블에 **직접 접근하지 못합니다.** 정해진 함수(RPC) 4개만 호출할 수 있습니다.
- 채점은 서버에서 다시 합니다 (화면에서 보낸 점수를 그대로 믿지 않음).

## 2. 식별 방식 — 로그인 대신 "비밀 링크 + 가족 코드"

| 이름 | 예시 | 용도 | 노출 |
|---|---|---|---|
| 결과 토큰 | `result.html?t=Xq3…`(22자) | 내 결과를 다시 보는 열쇠. 이걸 가진 사람만 결과를 봄 | 본인만 |
| 초대 토큰 | `index.html?inv=k9P…`(22자) | 배우자에게 보내는 링크. 이 링크로 검사하면 같은 가족으로 묶임 | 배우자에게만 |
| 가족 코드 | `KJ-4821` | 사람이 읽고 입력하는 짧은 코드. 링크 없이 시작 화면에 입력해 합류 | 화면 표시 |

- 한 가족은 **최대 2명**(구성원 1, 2). 두 번째 사람이 합류하면 가족 코드로는 더 이상 합류할 수 없습니다 (코드 추측으로 남의 결과를 보는 것 방지).
- 배우자 점수는 같은 가족의 결과 토큰을 가진 사람에게만 보입니다 → 기획서의 "두 분의 점수는 서로에게만 보입니다" 충족.
- 재검사(6개월 뒤): 내 결과 화면의 "다시 검사하기"로 시작하면 같은 가족·같은 구성원 번호로 저장되고 이전 결과와 비교됩니다.

## 3. 테이블

### families — 가족
| 컬럼 | 설명 |
|---|---|
| id | uuid |
| code | 가족 코드 `KJ-4821` (중복 없음) |
| invite_token | 초대 링크용 비밀 값 |
| created_at | |

### results — 검사 결과 (1회 검사 = 1행)
| 컬럼 | 설명 |
|---|---|
| id | uuid |
| token | 결과 토큰 (비밀) |
| family_id | 가족 |
| member_no | 1 = 처음 한 사람, 2 = 배우자 |
| role | `m` 엄마 / `f` 아빠 / `o` 기타 양육자 |
| answers | 문항별 응답 80개 (문항 검증용 — 블루돌핀 파일럿과 같은 이유) |
| scores | 영역 점수 8개 (서버 채점) |
| items_version | 문항 버전 (문항 교체 시 구분) |
| previous_id | 재검사일 때 이전 결과 |
| created_at | 검사일 |

이름·아이 정보는 저장하지 않습니다.

### contacts — 연락처 (알림 신청한 사람만)
| 컬럼 | 설명 |
|---|---|
| id, family_id, result_id | |
| purpose | `partner_done`(배우자 완료 알림) / `book_release`(출간 알림) |
| channel | `email` / `kakao` |
| value | 이메일 주소 또는 휴대폰 번호 |
| consent_at | 수집·이용 동의 시각 (필수) |
| deleted_at | 파기 시각 |

### notifications — 발송 대기열·기록
| 컬럼 | 설명 |
|---|---|
| id, contact_id, kind | |
| status | `pending` → `sent` / `failed` |
| payload | 보낼 내용 (결과 링크 등) |
| sent_at, error | |

배우자(구성원 2)의 결과가 저장되면 구성원 1의 `partner_done` 연락처로 대기열이 자동 생성됩니다(트리거).

## 4. 브라우저가 부르는 함수 (RPC)

| 함수 | 입력 | 반환 | 설명 |
|---|---|---|---|
| `submit_result` | role, answers[80], invite?, code?, previous_token? | token, family_code, invite_token | 채점·저장. 초대 토큰/가족 코드가 있으면 그 가족에 합류 |
| `get_result` | token | 내 결과, 배우자 최신 결과, 이전 결과, 가족 코드, 초대 토큰 | 결과 화면 |
| `check_family` | invite? 또는 code? | 합류 가능 여부, 먼저 한 사람의 역할 | 시작 화면 안내용 (점수는 안 줌) |
| `subscribe` | token, purpose, channel, value, consent | ok | 알림 신청 |

오류 코드: `invalid_answers`, `family_not_found`, `family_full`, `result_not_found`, `consent_required`, `invalid_contact`.

## 5. 결과 URL

| 방식 | 결과 | 초대 |
|---|---|---|
| 서버 (v2) | `result.html?t=토큰` | `index.html?inv=초대토큰` |
| URL (v1, 서버 없을 때) | `result.html?r=m&d=…&s=…` | `index.html?ir=m&id=…&is=…` |

v1 링크는 서버를 켠 뒤에도 계속 열립니다 (이미 공유된 링크 보호).

## 6. 파일 위치

```
supabase/migrations/0001_init.sql   테이블·함수·권한
supabase/functions/notify/          알림 발송 함수 (이메일 → 추후 카카오) — 아직 없음, 메일 서비스 정해지면 작성
assets/js/store.js                  저장 방식 선택 (서버 / URL)
scripts/dev-server.mjs              로컬 개발 서버: Supabase 없이 서버 모드 시험 (npm run dev → localhost:5174)
tests/db.test.mjs                   SQL 함수 테스트 (로컬 Postgres)
```

로컬 개발 서버에서는 `http://localhost:5174/dev/notifications`로 알림 대기열을 볼 수 있습니다. 서버를 끄면 데이터는 사라집니다.

## 7. 서버를 켜는 순서

1. Supabase 프로젝트 생성 → SQL Editor에서 `0001_init.sql` 실행
2. `data/config.json`에 `supabaseUrl`, `supabaseAnonKey`(공개 키) 입력 → `npm run data`
3. 알림: 메일 발송 서비스(Resend 등) 키를 Supabase 비밀 설정에 넣고 `notify` 함수 배포
4. 개인정보 처리방침 페이지 연결

## 8. 남은 결정

- 결과 보관 기간 (예: 2년 뒤 자동 삭제)
- 연락처 파기 시점 (출간 알림 발송 후 즉시 등)
- 카카오 알림톡 도입 시점
