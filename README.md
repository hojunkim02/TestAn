# TestAn Web

원본 **TestAn 1.0 for Windows**(VB6, 2000)을 현대적인 정적 웹 앱으로 포팅한 고전적 문항분석(CTT) 도구.
서버 없이 브라우저에서 모든 계산을 수행하며, GitHub Pages로 바로 배포할 수 있다.

## 사용 방법

1. **샘플 데이터로 보기** — 매뉴얼 예제 데이터(119명 × 70문항)로 즉시 분석
2. **새 응답자료 만들기** — 문항 수·ID 칸 수 입력 → 표에서 문항별 정답·답지 수·분석 포함 여부 입력(Enter=아래 칸, Tab=오른쪽 칸) → 확인 → 표 편집기에서 학생 응답 입력
3. **데이터 편집** — 정답·답지 수·분석 포함 여부와 학생 응답을 그리드에서 직접 수정
4. **.dat 불러오기 / 내보내기** — 원본 프로그램의 `.dat` 파일을 그대로 입출력

## 데이터 형식

내부 모델은 CSV와 동일한 구조이며, 편집 화면과 외부 파일은 원본 `.dat` 형식을 사용한다.

```
  5      4        ← control line: 문항수(1-3열) + ID 칸 수(9-10열)
43133               ← 정답키
44244               ← 답지 수
yyyyy               ← 분석 포함 여부 (y/n)
0001 2314           ← 학생 응답 (ID 뒤에 응답, 공백 = 무응답)
```

## 핵심 공식과 구현

분석 로직(`script/analysis.js`)은 매뉴얼(성태제, 2000) 1부의 공식을 그대로 구현한다.

### 문항 난이도 — 매뉴얼 III-1

$$P = \frac{R}{N}$$

```js
difficulty: R[j] / N    // R = 정답자 수, N = 전체 피험자 수
```

### 문항 변별도(문항점수-총점 상관계수) — 매뉴얼 III-2

$$r = \frac{N\sum XY - \sum X \sum Y}{\sqrt{N\sum X^2 - (\sum X)^2}\;\sqrt{N\sum Y^2 - (\sum Y)^2}}$$

```js
// X = 문항 점수(0/1), Y = 총점. 1차 순환에서 ΣX·ΣX²·ΣXY를 합집계 후:
function pearson(sX, sX2, sXY, sY, sY2, N) {
  const dX = N * sX2 - sX * sX, dY = N * sY2 - sY * sY;
  return dX > 0 && dY > 0 ? (N * sXY - sX * sY) / (Math.sqrt(dX) * Math.sqrt(dY)) : 0;
}
```

### 변별도 지수(상·하위 27% 정답률 차) — 매뉴얼 III-2, Kelly

$$D = P_U - P_L$$

```js
// 상·하위 27% 집단: 총점 내림차순에서 경계 점수의 동점자까지 포함 (원본과 동일)
const cut = Math.max(1, Math.round(N * 0.27));
upperCut = sorted[cut - 1].raw;  lowerCut = sorted[N - cut].raw;
discrimination: (nU ? cU[j] / nU : 0) - (nL ? cL[j] / nL : 0);
```

### 오답지 매력도 — 매뉴얼 III-3

$$P_o = \frac{1-P}{Q-1}$$

```js
attractiveness: Q > 1 ? (1 - P) / (Q - 1) : 0   // Q = 답지 수
// 답지 분석에서 응답비율이 P_o보다 높은 오답지를 "◀ 더 매력적임"으로 표시
```

### Cronbach α — 매뉴얼 IV-2

$$\alpha = \frac{n}{n-1}\left[1 - \frac{\sum s_i^2}{s_x^2}\right]$$

```js
// s_i² = Σ(X−X̄_i)²/N (문항분산), s_x² = 총점분산. 매뉴얼은 N분모이며
// 분모가 양쪽 모두 N이므로 표본분산(n−1) 비율과 결과가 동일하다.
const alpha = k / (k - 1) * (1 - sumSi2 * scale / sX2sample);
```

**문항 제외 시 α**: 문항 j를 뺀 총점의 합집계를 O(1)로 갱신해 전체 O(k²·n) → O(k·n).

$$\sum Y' = \sum Y - \sum X_j,\qquad \sum Y'^2 = \sum Y^2 - 2\sum X_jY + \sum X_j^2$$

```js
const sYx = sY - sX[j], sY2x = sY2 - 2 * sXY[j] + sX2[j];
it.alphaIfDeleted = kk / (kk - 1) * (1 - (sumSi2 - it.s_i2) * scale / varX);
```

### 측정오차(SEM) — 매뉴얼 IV-3

$$SEM = s_x\sqrt{1-\alpha}$$

```js
sem: s_x * Math.sqrt(Math.max(0, 1 - alpha))
```

### 그 외 (원본 `.out` 지표)

평균·모집단 표준편차·분산·중앙값·왜도·첨도는 표준 정의를 따르며, 답지별 통계(응답비율 전체/상위/하위, 답지-총점 상관)도 위의 `pearson`을 재사용해 계산한다.

## 검증

`node script/test.js` — 42개 테스트:

- **매뉴얼 1부 예제 6개 재현**: 표 1(P=R/N) · 표 4(r=.94) · 표 5(r=0) · 표 6(r=.76) · 표 8(r=−.87) · 표 10(P_o=.3)
- **원본 `.out` 골든 수치 25개 일치**: 평균 45.059, 표준편차 5.282, Cronbach α 0.633, 측정오차 3.201, 상·하위 27% 집단(36/32명), 문항 제외 시 α(.641/.626/.645/.614/.609), 답지별 상관계수 등
- CSV/`.dat` 왕복 동일성

## 성능

모든 문항 통계를 학생 2회 순환으로 집계(O(k·n)), 문항 제외 시 α는 합집계로 O(1) —
119명 × 70문항 분석 약 1ms, 999명 × 21문항 약 1.7ms.

## 배포

GitHub Pages: Settings → Pages → Source에서 `main` 브랜치 루트(`/`) 선택.

## 출처

원본: TestAn 1.0 for Windows (한글 Visual Basic 6.0, 2000) —
이화여자대학교 교육학과 성태제 교수 저서 부록 프로그램, 에버케이션.
