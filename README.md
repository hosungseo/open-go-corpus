# open-go-corpus

정보공개포털(open.go.kr) 원문공개 대량 수집·분석 코퍼스.

## 왜

관보는 **외부 공표(고시·공고)** 만 나온다. 반면 원문공개는 부처가 결재한 **내부 문서**(검토보고·추진계획·협의요청·회신)가 나온다. 즉 절차의 **중간 단계**가 보인다.

그리고 각 문서에 `PRDCTN_DT`(생산일시, 초 단위)가 있어서, 한 사업의 문서를 시간순으로 세우면 **단계 간 실제 소요기간**이 측정된다. korea100 워룸이 법정기한으로 추정만 하던 값의 실측 대체재.

검증 예 — 광주 군공항 이전건의(워룸 N04):

```
2014-07-15  시민의견 수렴(타운미팅) 추진계획
2014-08-14  이전건의(안) 공청회 발표자·주재자 선정
2014-09-01  시의회 의견수렴 추진계획
2014-10-11  이전건의서 제출 및 추진계획 보고   ← 착수 88일
```

## 접근 방법

공공데이터포털에 이 API는 **없다**(통계연보류만 존재). 포털 내부 AJAX를 직접 쓴다.

- `POST https://www.open.go.kr/othicInfo/infoList/orginlInfoList.ajax` (form-urlencoded)
- **세션 필수** — curl 직접 호출은 `code:491`. playwright-core로 시스템 Chrome을 띄워 포털에 한 번 착지한 뒤 페이지 컨텍스트에서 `fetch`
- 검색어 없이 `startDate`/`endDate`만으로 **전수 조회 가능**, `rowPage=500`, 페이징 상한 없음(10,000번째 이상 정상)
- 포털이 초당 요청을 제한한다(`code:429`) → 페이지 간 딜레이 + 429 전용 장기 백오프

## 채널

| 채널 | 엔드포인트 | 성격 | 규모 |
|---|---|---|---|
| `orginl` | `/othicInfo/infoList/orginlInfoList.ajax` | 원문공개(결재문서) 38필드 | 평일 ~4,000건/일 |
| `infoList` | `/othicInfo/infoList/infoList.ajax` | 정보목록(등록목록) | 대량 |
| `mnstrSan` | `/othicInfo/infoList/mnstrSanDocList.ajax` | 기관장 결재문서 | 평일 7~30건/일 |
| `prevInfo` | `/othicInfo/prevOpenInfo/othinfBefInfList.ajax` | 사전정보공표 27필드 | 소량·날짜 무관 |

## 사용

```bash
# 일별 전수 (검색어 없음 = 그날 전부)
node tools/collect.mjs --channel orginl --mode daily --from 20260101 --to 20260822 --delay 1000

# 키워드별 전 기간 (절차 추적용). queries.json은 korea100 데이터에서 생성
node tools/build-queries.mjs
node tools/collect.mjs --channel orginl --mode query --queries queries.json --from 20140101 --maxPages 40

# 분석
node tools/analyze.mjs summary
node tools/analyze.mjs lifecycle "군 공항"
node tools/analyze.mjs steps
```

두 모드 모두 **재개 가능**하다. 완료 단위는 `state/<channel>.<mode>.json`에 기록되고 다음 실행에서 건너뛴다. 중단해도 손해가 없다.

## 저장 구조

```
raw/orginl/<YYYY>/<YYYYMMDD>.jsonl     일별 전수
raw/orginl-query/<슬러그>.jsonl          키워드별
state/<channel>.<mode>.json             진행 상태(재개용)
queries.json / queries.meta.json        검색어(+출처 메타)
```

JSONL 1행 = 문서 1건. 주요 필드:

`INFO_SJ`(제목) · `DOC_NO`(문서번호) · `PRDCTN_DT`(생산일시 YYYYMMDDHHMMSS) · `PROC_INSTT_NM`(기관) · `CHRG_DEPT_NM`(담당과) · `NFLST_CHRG_DEPT_NM`(전체 계선) · `UNIT_JOB_NM`(BRM 단위과제) · `PRSRV_PD_CO`(보존기간) · `DOC_SUMRY_CN`(요약) · `CHARGER_NM`(담당자)

## 본문(보고서 원문) 수집

목록 API는 메타데이터만 준다. 본문은 상세 페이지 뒤 4단계 ESB 파이프라인(파일전송 → 파일수신 → 개인정보필터링 → PDF변환)으로 **문서당 5~10초** 걸려 생성되므로 선별 수집이 전제다.

```bash
node tools/fetch-body.mjs --limit 300 --keep-pdf          # 우선순위대로
node tools/fetch-body.mjs --limit 100 --family 산업단지계획   # 절차군 지정
```

경로: 목록의 `PRDCTN_INSTT_REGIST_NO` → 상세 페이지 GET(`infoListDetl.do?prdnNstRgstNo=…&prdnDt=…&nstSeCd=…`) → onclick의 `wonmunStep1('<해시>',…)` 추출 → 호출 후 다운로드 수신 → 텍스트 추출.

### 본문만 받으면 절반을 놓친다

`[본문] ○○.pdf | [첨부] ○○.hwpx` 구조인데 **첨부가 실제 문서**인 경우가 많다(본문 PDF 27KB + 첨부 HWPX 1.3MB). 그래서 상세 페이지의 모든 파일을 받는다. 실측 한 건: `pdf:1869자 + hwpx:815 + zip:5484 + hwpx:2225 + hwpx:1960` — PDF만 받을 때의 6.6배.

파일 유형 분포(48,637건): 본문pdf만 15,198 · 본문pdf+첨부 14,395 · **본문hwp만 5,285** · **본문hwp+첨부 6,793** · 그 외 hwpx/odt/mht/xlsx/zip.

### 포맷별 추출 (`tools/extract.py`)

| 포맷 | 처리 |
|---|---|
| hwp · hwpx · hwtx · hml | **rhwp** `export-text` (폴백: pyhwp `hwp5txt` / zip XML) |
| pdf | pypdf |
| odt · xlsx · docx | ZIP 내 XML |
| mht | email 파싱 |
| zip | 내부 파일 재귀 추출 |

[**rhwp**](https://github.com/edwardkim/rhwp)(Rust)가 HWP 계열의 정본이다. 페이지·표 레이아웃을 보존하고(직접 만든 XML 파서는 뭉개진다), 무엇보다:

```bash
vendor/rhwp/rhwp extract-data <파일> --kind date --json   # 날짜 정규화 + 위치
vendor/rhwp/rhwp export-tables <파일> --json              # 표를 셀 단위 구조로
```

`extract-data`는 `2026. 7. 16.` 같은 표기를 `normalized: "2026-07-16"`으로 바꿔 page/paragraph/cell 위치와 함께 준다. 실제로 인천2호선 실시계획 문서 한 건에서 `2024-02-21 → 2024-03-11 → 2025-06-30 → 2026-07-27 → 2026-10-15` 절차 연혁이 통째로 나왔다. `fetch-body.mjs`가 HWP 계열 파일마다 이 둘을 호출해 `dates`/`tables` 필드로 함께 저장한다.

설치: 릴리스 tar.gz를 `vendor/`에 풀면 `vendor/rhwp/rhwp` (디렉토리 안에 동명 바이너리).

## 주의

- 일별 전수는 교육청 예산·지출 등 **행정 일상 문서가 지배적**이다. 인허가 절차 분석은 `query` 모드 결과를 쓸 것.
- 개인정보가 포함될 수 있는 원문 데이터다. 공개 재배포 전 검토 필요 — 이 저장소는 로컬 분석용.

## 공개 페이지 (GitHub Pages)

`docs/`가 Pages 루트다. 페이지는 넷: 개요(`index`) → 세 제도 비교(`compare`, 1층 아홉 기준 매트릭스 + 2층 항목별 실측 근거) → 사업 대조기(`explorer/`) → 정책실명제 2.0(`policy2`, 행안부 주민자치회 사업의 4년 계보 + 원문 뷰어 시안; 구 `ai-plan.html`은 리다이렉트). 정적 페이지 소스는 `docs/src/*.html` + 공통 스타일 `docs/src/shared.css`이고, `node tools/build-explorer.mjs`가 CSS를 인라인해 `docs/*.html`과 대조기 `docs/explorer/index.html`을 생성한다. 정책실명제 2.0의 원문 페이지 이미지는 `docs/assets/jumin/p1~7.png`(결재란 성명 가림). **`docs/*.html`을 직접 고치지 말고 `docs/src/`를 고친 뒤 빌드한다.** 빌드는 각주·값 참조, 남은 로컬 스타일시트 링크, 기본 예시 사업(기관+사업명 상수) 해석을 검사하고 실명 누출을 경고한다.
