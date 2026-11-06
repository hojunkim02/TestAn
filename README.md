# TestAn Web

원본 **TestAn 1.0 for Windows**(VB6, 2000)을 현대적인 정적 웹 앱으로 포팅한 고전적 문항분석(CTT) 도구.
서버 없이 브라우저에서 모든 계산을 수행한다.

## 핵심 공식과 구현

분석 로직(`script/analysis.js`)은 매뉴얼(성태제, 2000)의 공식을 그대로 구현한다.

### 문항 난이도

$$P = \frac{R}{N}$$

```js
difficulty: R[j] / N    // R = 정답자 수, N = 전체 피험자 수
```

### 문항 변별도(문항점수-총점 상관계수)

$$r = \frac{N\sum XY - \sum X \sum Y}{\sqrt{N\sum X^2 - (\sum X)^2}\;\sqrt{N\sum Y^2 - (\sum Y)^2}}$$

```js
// X = 문항 점수(0/1), Y = 총점. 1차 순환에서 ΣX·ΣX²·ΣXY를 합집계 후:
function pearson(sX, sX2, sXY, sY, sY2, N) {
  const dX = N * sX2 - sX * sX, dY = N * sY2 - sY * sY;
  return dX > 0 && dY > 0 ? (N * sXY - sX * sY) / (Math.sqrt(dX) * Math.sqrt(dY)) : 0;
}
```

### 변별도 지수(상·하위 27% 정답률 차, Kelly)

$$D = P_U - P_L$$

```js
// 상·하위 27% 집단: 총점 내림차순에서 경계 점수의 동점자까지 포함 (원본과 동일)
const cut = Math.max(1, Math.round(N * 0.27));
upperCut = sorted[cut - 1].raw;  lowerCut = sorted[N - cut].raw;
discrimination: (nU ? cU[j] / nU : 0) - (nL ? cL[j] / nL : 0);
```

### 오답지 매력도

$$P_o = \frac{1-P}{Q-1}$$

```js
attractiveness: Q > 1 ? (1 - P) / (Q - 1) : 0   // Q = 답지 수
// 답지 분석에서 응답비율이 P_o보다 높은 오답지를 "◀ 더 매력적임"으로 표시
```

### Cronbach α

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

### 측정오차(SEM)

$$SEM = s_x\sqrt{1-\alpha}$$

```js
sem: s_x * Math.sqrt(Math.max(0, 1 - alpha))
```

### 그 외 (원본 `.out` 지표)

평균·모집단 표준편차·분산·중앙값·왜도·첨도는 표준 정의를 따르며, 답지별 통계(응답비율 전체/상위/하위, 답지-총점 상관)도 위의 `pearson`을 재사용해 계산한다.

## 출처

원본: TestAn 1.0 for Windows (한글 Visual Basic 6.0, 2000) —
이화여자대학교 교육학과 성태제 교수 저서 부록 프로그램, 에버케이션.
