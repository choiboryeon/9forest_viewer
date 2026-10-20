# 9FOREST Viewer

[Open the 9FOREST viewer](https://choiboryeon.github.io/9forest_viewer/9forest_viewer.html)

상단 **공간** 메뉴에서 **Night Shift / WESS+**를 선택하고, 같은 20개 사물 라이브러리로 배치할 수 있습니다.

[WESS+ 바로 열기](https://choiboryeon.github.io/9forest_viewer/9forest_viewer.html?space=wess)

- 사물 추가, 드래그 이동, X/Y/Z 회전, 바닥·좌대·봉·천장 행잉을 지원합니다.
- 공간마다 배치를 별도로 자동 저장합니다. 공간을 바꾸어도 이전 배치를 유지합니다.
- JSON 저장 파일에는 `space_id`가 포함됩니다. 불러오면 해당 공간으로 자동 전환합니다. 공간 정보가 없는 기존 version 2/3 파일은 Night Shift 배치로 읽습니다.
- 입체·평면·네 방향 시점, 천장/구조물/설비/벽 표시, PNG 저장, 다크 모드를 지원합니다.
- WESS 배치는 벽·기둥·창·열린 문과 바닥 외부를 피하도록 보정합니다. 사물끼리 겹치면 기존 경고를 표시합니다. 워킹은 벽과 사물을 피하고 접근할 수 없는 사물은 제외합니다.

WESS는 도면에서 만든 `WESS_Plus_Space.obj`를 원래 미터 단위와 Z-up 좌표 그대로 반영했습니다. 주실 내측 치수는 7.920 × 4.565 m, 중앙실 단차는 +30 mm입니다. 벽 높이 2.70 m와 선택 표시하는 평천장은 가정값입니다. 처음 WESS를 선택하면 빈 공간이 열려 원하는 사물을 추가할 수 있습니다. 기존 설치안의 9개 작품은 이 20개 사물 라이브러리와 별개입니다.

배치 높이는 해당 위치의 바닥 위 높이입니다. WESS 로비 일부의 Y 좌표는 음수입니다. 계단은 공간 형상으로 표시하지만 사물 배치와 워킹 경로에서 제외합니다. 이 뷰어는 배치 계획 도구이며 실제 설치 시 실측과 구조 검토가 필요합니다.

## 개발 및 검증

Node.js 20 이상:

```sh
npm ci
npm run build
npm test
npm run serve
```

로컬 주소는 `http://127.0.0.1:4186/9forest_viewer.html`입니다. `src/`는 편집 가능한 원본, `data/`는 두 공간과 공용 사물 데이터입니다. `tools/build.mjs`가 Three.js, 공간 모델, 사진을 하나의 `9forest_viewer.html`에 포함하므로 배포 후 CDN이나 모델 서버가 필요 없습니다. 기존 `index.html` 진입 경로와 단일 HTML 다운로드 방식도 유지됩니다.

WESS 원본 수정 시 `node tools/convert-wess.mjs`를 실행한 뒤 다시 빌드하세요. 변환은 5,588개 원본 삼각형의 좌표와 면 방향을 보존하는지 검사합니다. `data/wess-source/README.md`와 `data/wess-geometry-audit.json`에 출처, 치수와 가정을 기록했습니다.

Chrome이 설치된 환경에서 로컬 서버를 켠 뒤 `npm run test:browser`로 드래그, 공간별 저장, JSON/PNG, 워킹 전환과 모바일을 검사할 수 있습니다. 다른 Chrome 실행 파일은 `CHROME_PATH`, 다른 서버 주소는 `VIEWER_URL` 환경 변수로 지정합니다. 스크린샷과 결과는 Git에서 제외된 `test-results/browser/`에 저장됩니다.
