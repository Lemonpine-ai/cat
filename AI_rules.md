기존 기능과 데이터 구조는 유지해.

디자인과 레이아웃은 변경 가능해.

이번 작업 범위의 화면만 디자인 수정해.

스타일 시스템은 최대한 일관되게 유지해.

새 라이브러리 추가는 가능하면 피하고, 꼭 필요하면 먼저 이유를 설명해.

기존 동작이 깨지지 않게 수정해.

변경 후 영향받는 파일만 최소한으로 수정해.

수정 후 무엇이 바뀌었는지 요약해.

## 🚀 작업 마무리 및 배포 자동화 규칙 (Workflow)

모든 기능 구현이나 버그 수정이 완료되면, 에이전트는 별도의 요청이 없어도 아래 단계를 순서대로 수행하여 작업을 마무리한다.

1. **의존성 체크 및 설치**:
   - `package.json`에 변화가 생겼거나 새로운 라이브러리가 필요하다면 **`bun install` 또는 `npm install` 중 해당 PC에 설치된 도구로** 환경을 동기화한다. (둘 다 허용. 저장소에 `package-lock.json`이 있으므로 `npm install`로 맞추거나, Bun 환경에서는 `bun install`을 써도 된다.)

2. **Git 커밋 및 푸시**:
   - 변경 사항을 스테이징(`git add .`)한다.
   - 커밋 메시지는 작업 내용을 요약하여 한국어로 명확하게 작성한다. (예: "feat: 고양이 급식 알림 UI 추가")
   - `git push origin master` 명령어로 원격 저장소에 반영한다.

3. **Vercel 운영 서버 배포**:
   - GitHub와 Vercel이 연결되어 있으면 **`git push`만으로 프로덕션 배포가 돌아가는 경우가 많다.** 그때는 대시보드 또는 `npx vercel ls cat`으로 최신 배포 URL을 확인해 보고한다.
   - 자동 배포가 없거나 CLI로 명시 배포가 필요하면 저장소 **루트**에서 `npx vercel --prod`를 실행한다. (워크스페이스 폴더 이름에 공백·대문자가 있으면 Vercel이 프로젝트 이름을 잘못 추론할 수 있으므로, 문제 시 `npx vercel link`로 아래 프로젝트를 다시 연결한다.)
   - 배포 결과(URL)를 사용자에게 보고한다.

4. **최종 보고**:
   - 모든 과정이 끝나면 [변경 내용 / 푸시 여부 / 배포 결과]를 요약하여 사용자에게 알린다.

## Vercel·GitHub 연동 정보 (이 저장소 기준)

에이전트와 다른 PC에서 동일하게 맞추기 위한 고정 값이다.

- **GitHub 저장소**: `https://github.com/Lemonpine-ai/cat`
- **배포 브랜치**: `master` (`git push origin master`)
- **Vercel 팀(스코프)**: `lemonpine-ais-projects`
- **Vercel 프로젝트 이름**: `cat`
- **Vercel 프로젝트 ID** (`vercel link`·API 참고용): `prj_Bnnc4kDkWB8tn6Ovvr8SmNWgPH2P`
- **Vercel 팀(조직) ID** (`vercel link` 참고용): `team_dobkbAGfwH68vFAtg8GFKQxn`
- **프로덕션 URL**: 배포마다 고유 URL이 생기며, Vercel 대시보드의 해당 프로젝트 **Domains**에 연결된 대표 도메인(예: `*.vercel.app`)을 기준으로 안내한다. 최신 한 건은 `npx vercel ls cat` 출력에서 확인할 수 있다.

**로컬 CLI 연결**: `.vercel/` 디렉터리는 `.gitignore`에 포함되어 저장소에 올라가지 않는다. 새 PC에서는 저장소 루트에서 `npx vercel login` 후 `npx vercel link`로 위 프로젝트 `cat`을 선택하면 된다.

다른 컴퓨터에서는 이 저장소를 클론하면 `AI_rules.md`가 함께 따라오므로 동일한 에이전트 규칙과 위 배포 설정을 쓸 수 있다.