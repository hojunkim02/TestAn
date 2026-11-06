# TestAn Web

원본 **TestAn 1.0 for Windows** (VB6, 2000)을 정적 웹 앱으로 포팅한 고전적 문항분석(CTT) 도구입니다.
GitHub Pages로 바로 배포할 수 있으며, 모든 파싱·계산은 브라우저에서 수행됩니다(서버 없음).

## 사용 방법

1. 응답 데이터 파일(`.dat`)을 업로드하거나 "샘플 데이터로 보기" 클릭
2. 탭에서 점수 결과 / 문항 분석 / 그래프 확인
3. 결과를 `.out` / `.scr` / `.srt` 파일로 다운로드

## 데이터 형식 (`.dat`)

```
문항수 (부가 코드)      ← 첫 줄: 문항수가 정답키 길이와 일치
정답키                (문항수 길이)
배점                  (문항수 길이)
채점 플래그 y/n       (문항수 길이)
학생레코드...          (앞부분은 ID, 마지막 문항수 길이가 응답, 공백=무응답)
```

## 분석 지표

- 학생별: 원점수, 백분율, 순위
- 문항별: 정답자 수, 난이도(p-value), 상/하위 27% 정답률, 변별도(D)
- 전체: 평균, 표준편차, 최고/최저점, Cronbach α

## 디렉토리 구조

- `index.html`, `css/`, `js/` — 웹 앱 (GitHub Pages 배포 대상)
- `Orgin/` — 원본 VB6 실행 파일, 런타임 DLL/OCX, 테스트 데이터(`input_test1~8.dat`, `answer.dat`)

## GitHub Pages 배포

Repository → Settings → Pages → Source: `main` 브랜치, 루트(`/`) 선택.

## 로컬 테스트

```bash
node js/test.js
```
