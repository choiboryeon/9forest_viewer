# 공간 힘 지하 모델 출처

이 폴더의 OBJ, MTL, `model_notes.json`은 사용자가 제공한 `공간 힘/modeling`의 파일을 복사했습니다. 원본은 도면과 현장 사진으로 재구성한 미터 단위 모델이며 실측·시공 도면이 아닙니다. 원본 OBJ는 Blender 내보내기에서 X와 Y가 함께 180° 회전되어 있습니다. `tools/convert-spacehim.mjs`가 두 축을 함께 회전시켜 원래 Blender `(u,-v,Z)` 좌표로 복구하고 `data/spacehim-room.json`을 생성합니다. 원래 면 방향은 그대로 유지하며 MTL의 선형 RGB를 sRGB로 변환합니다.

미확정 사항은 `model_notes.json`과 원본 프로젝트의 `modeling/README_ko.md`에 기록되어 있습니다. 투사벽 및 기자재 배치영역은 공연 검토를 위해 이 뷰어에서 추가한 계획용 정보입니다.
