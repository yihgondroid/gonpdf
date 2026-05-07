# Auto-Update 설계 — PDF 편집 툴

**날짜:** 2026-05-07  
**상태:** 승인됨

---

## 개요

Electron 기반 PDF 편집 툴에 수동 트리거 방식의 자동 업데이트 기능을 추가한다.  
업데이트 파일은 GitHub Releases에 호스팅하고, `electron-updater`로 다운로드 및 설치를 처리한다.

---

## 업데이트 흐름

1. 사용자가 **도움말 > 업데이트 확인** 메뉴 클릭
2. `autoUpdater.checkForUpdates()` 호출 → GitHub Releases API에서 최신 버전 조회
3. **최신 버전인 경우:** 다이얼로그 "현재 최신 버전입니다 (vX.X.X)"
4. **새 버전 있는 경우:** 다이얼로그 "vX.X.X 업데이트가 있습니다. 다운로드할까요?"
   - 확인 → 백그라운드 다운로드 시작, 진행률 다이얼로그 표시
   - 다운로드 완료 → 다이얼로그 "설치 준비 완료. 지금 재시작할까요?"
   - 확인 → `autoUpdater.quitAndInstall()` 호출, 앱 재시작 후 자동 설치

---

## 아키텍처

### 의존성

- `electron-updater` — electron-builder 생태계 공식 업데이트 라이브러리
- GitHub public 저장소 — 릴리즈 파일 호스팅 (무료)

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `package.json` | `electron-updater` 의존성 추가 |
| `electron-builder.yml` | `publish` 섹션 추가 (provider: github, owner, repo) |
| `main.js` | `autoUpdater` import, 이벤트 핸들러, IPC 핸들러, 메뉴 항목 추가 |
| `preload.js` | `checkForUpdates` IPC 채널 노출 (렌더러에서 트리거 필요 시) |

### electron-builder.yml publish 설정

```yaml
publish:
  provider: github
  owner: <GitHub 사용자명>
  repo: <저장소 이름>
```

### main.js autoUpdater 이벤트

| 이벤트 | 처리 |
|--------|------|
| `checking-for-update` | 상태 표시 (선택) |
| `update-available` | 다운로드 확인 다이얼로그 |
| `update-not-available` | "최신 버전" 다이얼로그 |
| `download-progress` | 진행률 다이얼로그 업데이트 |
| `update-downloaded` | "재시작" 확인 다이얼로그 |
| `error` | 에러 다이얼로그 표시 |

---

## GitHub 저장소 설정

1. GitHub에 public 저장소 생성
2. 로컬 프로젝트 `git remote add origin <url>`
3. 코드 push
4. 빌드 시 `GH_TOKEN` 환경변수 설정 (릴리즈 업로드용)
5. `electron-builder --publish always` 로 빌드하면 GitHub Release 자동 생성

---

## 릴리즈 프로세스

1. `package.json`의 `version` 올리기 (예: 1.0.0 → 1.1.0)
2. `npm run build` 또는 `electron-builder --publish always`
3. GitHub Releases에 `.exe` + `latest.yml` 자동 업로드
4. 기존 앱에서 "업데이트 확인" 시 새 버전 감지

---

## 제약 사항

- GitHub 저장소는 **public**이어야 무료로 동작 (private은 Personal Access Token 필요)
- 개발 환경(`NODE_ENV=development`)에서는 `autoUpdater` 비활성화 (electron-updater 기본 동작)
- 코드 서명 없이 빌드할 경우 Windows SmartScreen 경고 발생 가능
