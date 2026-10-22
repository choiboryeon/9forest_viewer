# Sunken 공간 변환 기록

## 원본

- `9 forests/[virtual] sunken/modeling/nineforests_stage_v5.blend` (Blender 4.5.1, nineforests v5)
- 설계 설명: `[virtual] sunken/docs/GALLERY_V4_ko.md`, `GALLERY_V5_ko.md`
- 원본 SHA-256과 추출본 SHA-256은 `data/sunken-geometry-audit.json`과 `data/sunken-room.json`의 `metadata`에 있습니다.

## 재생성

저장소 루트에서 실행합니다.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --background '../../[virtual] sunken/modeling/nineforests_stage_v5.blend' --python tools/blender/export_sunken.py -- data/sunken-source/sunken_v5_export.json
node tools/convert-sunken.mjs
npm run build
```

저장소는 `9 forests/shared/9forest-viewer/`에 두고 쓰므로 원본 .blend는 `../../[virtual] sunken/`에 있습니다. 추출 스크립트는 .blend를 저장하지 않습니다.

빌드 뒤 최종 뷰어를 `9 forests` 루트에 복사합니다: `cp 9forest_viewer.html ../../9forest_viewer.html`

## 포함 범위

| Blender 컬렉션 | 뷰어 분류 |
| --- | --- |
| `ROOM` (`room_floor`) · 바닥 슬래브 · 테이프 그리드 · 컷팅 줄눈 | 바닥 |
| 적벽돌 외피 · 철제 창 · 유리 · 필라스터 | A/B/C/D면 벽 (잘라보기) |
| 지붕 데크 · 천창 프레임 · 천창 유리 | 천장 (`천장` 체크) |
| 트러스 · 크레인 주행보 · 천장 크레인 · 캣워크 | 구조물 |
| 리깅 그리드 · 호이스트 · 프로파일 스팟 · 하이베이 펜던트 · v5 스테이지 · 우수관·전선관·소화기 등 | 설비 |

제외: v2 아홉 작품(`OBJECTS`), 거치대·와이어(`MOUNTS`), 앰프 선반(`EQUIPMENT`), 음향 케이블(`CABLES`), 대기 헤이즈(`v4_atmosphere_haze`), 카메라·라이트.

- 벽돌 외피는 페인트 경계 Z 3.015 m에서 잘라 하부를 흰 도장색, 상부를 적벽돌색으로 나눴습니다.
- 벽 부착 부재는 삼각형 중심이 벽면에서 0.95 m 이내이면 해당 면으로 분류합니다. A=북(y 4), B=동(x 12), C=남(y −9), D=서(x −4).
- 색은 각 재질의 뷰포트 색(`diffuse_color`, 선형 → sRGB)을 쓰고, 벽돌·바닥·유리·지붕만 웹 화면에 맞게 지정했습니다. 사진 텍스처와 Cycles 조명은 웹에 넣지 않았습니다.
- 케이블 곡선은 웹용으로 단면 해상도만 낮췄습니다(원본 모델은 그대로).
- 바닥 위 얇은 면(작업 구역, 줄눈, 테이프)은 겹침 깜빡임을 피하려고 1–2 mm 올렸습니다.

## 배치 규칙

- 바닥: 벽 안쪽 X −4–12, Y −9–4 (16 × 13 m).
- 장애물 29개: 연결된 부재의 경계 상자를 합친 것입니다. 필라스터, 크레인 받침, 캣워크 계단, 캣워크 데크(Z 3.02–4.67), 우수관, 분전반, 소화기, 라이브 스테이지 장비(남동쪽 x 7.75–12, y −9–−5.1 묶음)가 포함됩니다.
- 행잉 상단은 리깅 그리드 Z 5.7 m 기준입니다(`ceiling_m`). 그리드 밖에서도 같은 높이로 계산하는 단순화입니다.
- 출입문: 남쪽 벽 x 0.7–3.3 m 철제 미닫이문. 워킹은 문 안쪽 (2.0, −8.55)에서 시작합니다.

## 조명 미리보기

`src/sunken-lighting.js` — 동남동 상공의 햇빛(그림자), 하늘 반구광, 작품 구역 위 프로파일 스팟 6개(4300K 근사), 스테이지 스팟 1개. 렌즈·펜던트 확산판·비상구 표시등·노트북 화면은 자체 발광색으로 표시합니다. 실제 조도 계산이나 Cycles 렌더와 같지 않습니다.

## 덕트 설치

`src/duct.js`는 `9 forests/[virtual] sunken/installation/duct/simulator/duct-simulator.html`의 생성기를 그대로 옮긴 모듈입니다. 스파이럴 덕트의 직교·사선 랜덤 워크, 고어 엘보, 플렉시블 덕트의 바닥 쌓임, 지지대 규칙과 금속 텍스처가 같습니다.

- 생성기는 자기 영역(W × D × H, Y-up)에서 계산합니다. 뷰어는 영역을 공간에 놓고 Z-up으로 돌립니다. 영역 앞뒤 기준: 굵은 선 쪽 = 원본의 뒷벽(`z0`)으로, **벽면 부착** 덕트가 붙는 면입니다.
- 영역은 바닥 범위와 고정 장애물(필라스터, 캣워크 계단·데크, 스테이지 등)을 피해서 놓입니다. 높이는 리깅 그리드 5.7 m까지이며, **천장 매달기**는 영역 윗면에 매답니다.
- **생성할 때 배치된 사물 피하기**: 영역 안 사물의 경계 상자를 0.2 m 간격 표본으로 채워 생성기의 충돌 해시에 넣습니다. 강성 덕트는 이 표본과의 간격을 지키고, 플렉시블 덕트는 바닥 근처 사물을 돌아갑니다.
- 생성 뒤 사물을 옮기면 덕트 표본과 사물 경계 상자를 비교해 겹침을 경고합니다. 자동으로 다시 생성하지는 않습니다.
- 저장 형식: 배치 JSON `ducts[]` = `{seed, complexity, type, mode, count, diameter, W, D, H, supports, plinth, avoid, x, y, rotation}`. 같은 값과 같은 사물 배치에서 같은 덕트가 생성됩니다.
- 원본 시뮬레이터의 사람 스케일 인형과 공간 크기 슬라이더는 뷰어의 워킹 시뮬레이션·실제 공간으로 대체했습니다.
