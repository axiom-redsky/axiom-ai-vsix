# API 명세 (발췌 — 슬라이스 프로브 픽스처)

> react-app-scaffold 백엔드 API 명세 일부. region/hybrid 편집이 참조 스펙을 주입받았을 때
> 응답 타입·쿼리 파라미터를 추측 없이 정확히 쓰는지 검증하기 위한 픽스처.

---

## 공통코드 (Common Codes)

> 모든 엔드포인트 **인증 필요**
> SI 표준 코드그룹(`common_code_group`) + 코드상세(`common_code`) 구조. 조회는 기본적으로 `use_yn=true`만 반환하며 `?include_disabled=true`로 비활성 포함 가능.
> 기본 제공 그룹: `EMPLOYMENT_STATUS`(재직상태) · `DEPLOYMENT_STATUS`(투입상태) · `PROJECT_STATUS`(프로젝트상태) · `WORK_REPORT_STATUS`(근무보고상태) · `LEAVE_TYPE`(휴가종류) · `LEAVE_STATUS`(휴가상태)

### GET `/api/common-codes`

여러 그룹의 코드를 그룹별로 묶어서 반환.

**Query Parameters**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `groups` | string | 콤마구분 그룹코드 (예: `EMPLOYMENT_STATUS,LEAVE_TYPE`). 미지정 시 전체 그룹 |
| `include_disabled` | `true` | 비활성(`use_yn=false`) 코드 포함 |

**Response**

```json
{
  "success": true,
  "data": {
    "EMPLOYMENT_STATUS": [
      { "id": 1, "group_code": "EMPLOYMENT_STATUS", "code": "active", "code_name": "재직", "sort_order": 1, "use_yn": true, "extra1": null, "extra2": null, "extra3": null },
      { "id": 2, "group_code": "EMPLOYMENT_STATUS", "code": "leave", "code_name": "휴직", "sort_order": 2, "use_yn": true, "extra1": null, "extra2": null, "extra3": null },
      { "id": 3, "group_code": "EMPLOYMENT_STATUS", "code": "resigned", "code_name": "퇴사", "sort_order": 3, "use_yn": true, "extra1": null, "extra2": null, "extra3": null }
    ]
  }
}
```

### GET `/api/common-codes/:groupCode`

단일 그룹의 코드 목록만 배열로 반환.

**Response**

```json
{
  "success": true,
  "data": [
    { "id": 1, "group_code": "EMPLOYMENT_STATUS", "code": "active", "code_name": "재직", "sort_order": 1, "use_yn": true }
  ]
}
```

### POST `/api/common-codes`

코드상세 1건 생성. body: `{ group_code, code, code_name, sort_order?, use_yn? }`.

### PUT `/api/common-codes/:id`

코드상세 1건 수정. body: `{ code_name?, sort_order?, use_yn? }`.

### DELETE `/api/common-codes/:id`

코드상세 1건 삭제(soft delete — `use_yn=false`).

---

## 부서 (Departments)

### GET `/api/departments`

부서 트리/목록 반환.

**Response**

```json
{
  "success": true,
  "data": [
    { "id": 10, "dept_code": "DEV", "dept_name": "개발본부", "parent_id": null }
  ]
}
```
