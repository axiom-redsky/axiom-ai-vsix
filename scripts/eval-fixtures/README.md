# eval-fixtures — 실파일 측정용 픽스처

여기에 실제 react-app-scaffold 페이지 파일(`*.tsx`)을 떨구면
`npm run eval:region` 하니스가 **basename을 키로 자동 로드**한다.

- 예) `MemberListPage.tsx` → 코퍼스에서 `file: 'MemberListPage'`로 참조.
- 실고객 코드 보호: 이 폴더의 코드 파일은 `.gitignore`로 **커밋 제외**된다(추세만 보고 저장소엔 안 올림).
- 케이스(파일×질문)는 [../eval-region-corpus.ts](../eval-region-corpus.ts)의 `CASES`에 추가한다.
  파일과 함께 "그 파일에 실제로 칠 법한 요청 문장"을 같이 주면 케이스로 엮는다.
